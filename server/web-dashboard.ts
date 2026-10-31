import * as http from 'node:http';
import * as path from 'node:path';
import { AgentOrchestrator } from './agent/orchestrator.js';
import { AgentTaskManager } from './agent/task-manager.js';
import { AgentPlanner } from './agent/planner.js';
import { createGeminiAnswerModel } from './agent/gemini-answer.js';
import { createGeminiPlanModel } from './agent/gemini-planner.js';
import { createTinyFishTools } from './agent/tinyfish-tools.js';
import { tinyFishClientFromEnv } from './integrations/tinyfish/client.js';
import { TinyFishError } from './integrations/tinyfish/errors.js';
import { searchWeb } from './integrations/tinyfish/search.js';
import { fetchUrls } from './integrations/tinyfish/fetch.js';
import { startResearch, getResearch, listResearch, cancelResearch, ResearchHistoryStore } from './integrations/tinyfish/research.js';
import { listRuns, getRun, cancelRun, getRunStepScreenshot } from './integrations/tinyfish/runs.js';
import { startAutomation } from './integrations/tinyfish/automation.js';
import { listMonitors, createMonitor, updateMonitor, deleteMonitor, runMonitorNow } from './integrations/tinyfish/monitors.js';
import { listProfiles } from './integrations/tinyfish/profiles.js';
import { getWallet, listSearchUsage, listFetchUsage, listBrowserUsage } from './integrations/tinyfish/wallet.js';

type Json = Record<string, unknown>;
type ReadBody = (request: http.IncomingMessage, limit?: number) => Promise<unknown>;
type SendJson = (response: http.ServerResponse, status: number, value: unknown) => void;
let orchestrator: AgentOrchestrator | null = null;
let taskManager: AgentTaskManager | null = null;
let client: ReturnType<typeof tinyFishClientFromEnv> | null = null;
const researchHistory = new ResearchHistoryStore(path.join(process.env.MINDORA_WEB_DATA_DIR || path.join(process.cwd(), '.mindora-web'), 'research-history.json'));
const sseClients = new Set<http.ServerResponse>();

function getClient() { if (!client) client = tinyFishClientFromEnv(); return client; }
function getTaskManager() {
  if (!taskManager) {
    const taskPath = path.join(process.env.MINDORA_WEB_DATA_DIR || path.join(process.cwd(), '.mindora-web'), 'tasks.json');
    taskManager = new AgentTaskManager(100, undefined, taskPath);
  }
  return taskManager;
}
function getOrchestrator() {
  if (orchestrator) return orchestrator;
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('Agent tasks require GEMINI_API_KEY on the trusted server.');
  const tools = createTinyFishTools(getClient());
  const tasks = getTaskManager();
  orchestrator = new AgentOrchestrator({ planner: new AgentPlanner(createGeminiPlanModel(key), tools), answerModel: createGeminiAnswerModel(key), tools, tasks });
  orchestrator.events.subscribe((event) => {
    const task = event.task;
    const safe = {
      type: event.type, at: event.at, taskId: event.taskId, message: safeText(event.message,500),
      approvalId: event.approvalId,
      task: safeTask(task, orchestrator!)
    };
    const message = `event: task\ndata: ${JSON.stringify(safe)}\n\n`;
    for (const response of sseClients) response.write(message);
  });
  return orchestrator;
}

function object(value: unknown): Json { return value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {}; }
function safeText(value: unknown, limit = 1200): string {
  let text=''; try { text=typeof value==='string'?value:JSON.stringify(value); } catch { text='[result unavailable]'; }
  return (text||'').replace(/AIza[\w-]{20,}/g,'[redacted credential]').replace(/\bBearer\s+[^\s"']+/gi,'Bearer [redacted]')
    .replace(/("?(?:api[_-]?key|password|secret|access[_-]?token|credential)"?\s*[:=]\s*)"?[^",}\s]+/gi,'$1[redacted]')
    .replace(/([?&](?:key|token|password|secret|signature|sig|auth)=)[^&\s]+/gi,'$1[redacted]').slice(0,limit);
}
function safeTask(task: import('./agent/execution-state.js').AgentTaskRecord, agent?: AgentOrchestrator) {
  const evidence=task.evidence.map((item)=>({id:safeText(item.id,300),type:item.type,source:safeText(item.source,500),title:item.title?safeText(item.title,300):undefined,url:item.url?safeText(item.url,1000):undefined,detail:item.detail?safeText(item.detail,1000):undefined}));
  return { id:task.id,state:task.state,summary:safeText(task.plan?.summary,500),response:safeText(task.response,4000),error:safeText(task.error,500),createdAt:task.createdAt,updatedAt:task.updatedAt,
    steps:task.steps.map(({id,title,tool,state,attempts,error,evidence:stepEvidence,output})=>({id,title:safeText(title,240),tool,state,attempts,error:safeText(error,500),...(output===undefined?{}:{output:safeText(output)}),evidence:stepEvidence.map((item)=>({id:safeText(item.id,300),type:item.type,source:safeText(item.source,500),title:item.title?safeText(item.title,300):undefined,url:item.url?safeText(item.url,1000):undefined,detail:item.detail?safeText(item.detail,1000):undefined}))})), evidence,
    pendingApprovals:agent?.getPendingApprovals(task.id).map(({id,stepId,action,createdAt})=>({id,stepId,action:safeText(action,240),createdAt}))||[] };
}
function jsonError(error: unknown): { status: number; body: Json } {
  if (error instanceof TinyFishError) {
    const status = error.kind === 'configuration' ? 503 : error.kind === 'authentication' ? 502 : error.kind === 'insufficient_credits' ? 402 : error.kind === 'rate_limited' ? 429 : error.kind === 'validation' ? 400 : 502;
    return { status, body: { error: safeText(error.message,500), code: error.kind } };
  }
  const message = error instanceof Error ? error.message : 'Request failed.';
  return { status: /requires|must contain|invalid|unknown task|approval/i.test(message) ? 400 : 503, body: { error: safeText(message,500) } };
}
function sendStream(response: http.ServerResponse): void {
  response.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  response.write(': connected\n\n'); sseClients.add(response);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 25_000);
  response.on('close', () => { clearInterval(heartbeat); sseClients.delete(response); });
}

export async function handleDashboardApi(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, method: string, readBody: ReadBody, sendJson: SendJson): Promise<boolean> {
  if (pathname === '/api/events' && method === 'GET') {
    try { getOrchestrator(); sendStream(res); }
    catch (error) { const result=jsonError(error); sendJson(res,result.status,result.body); }
    return true;
  }
  if (pathname === '/api/tasks' && method === 'GET') {
    try { const manager=getTaskManager(); sendJson(res, 200, { tasks: manager.history().map((task) => safeTask(task, orchestrator || undefined)) }); }
    catch (error) { const result = jsonError(error); sendJson(res, result.status, result.body); }
    return true;
  }
  if (pathname === '/api/tasks' && method === 'POST') {
    try { const body = object(await readBody(req, 24 * 1024)); const task = getOrchestrator().startTask(typeof body.task === 'string' ? body.task : ''); sendJson(res, 202, { id: task.id, state: task.state }); }
    catch (error) { const result = jsonError(error); sendJson(res, result.status, result.body); }
    return true;
  }
  const taskAction = /^\/api\/tasks\/([^/]+)(?:\/(action))?$/.exec(pathname);
  if (taskAction) {
    try {
      const agent = getOrchestrator(); const id = decodeURIComponent(taskAction[1]);
      if (!taskAction[2] && method === 'GET') {
        const task = getTaskManager().get(id); if (!task) { sendJson(res, 404, { error: 'Task not found.' }); return true; }
        sendJson(res, 200, { task: safeTask(task,agent) }); return true;
      }
      if (taskAction[2] && method === 'POST') {
        const body = object(await readBody(req, 8 * 1024)); const action = body.action;
        let result;
        if (action === 'pause') result = agent.pause(id);
        else if (action === 'resume') result = agent.resume(id);
        else if (action === 'cancel') result = agent.cancel(id);
        else if (action === 'approve' && typeof body.approvalId === 'string') result = agent.approve(body.approvalId);
        else if (action === 'reject' && typeof body.approvalId === 'string') result = agent.reject(body.approvalId);
        else { sendJson(res, 400, { error: 'Unsupported task action.' }); return true; }
        if (!result) { sendJson(res, 404, { error: 'Task or approval not found.' }); return true; }
        sendJson(res, 200, { id: result.id, state: result.state }); return true;
      }
    } catch (error) { const result = jsonError(error); sendJson(res, result.status, result.body); return true; }
    return false;
  }

  if (!pathname.startsWith('/api/dashboard/')) return false;
  try {
    if (pathname === '/api/dashboard/status' && method === 'GET') {
      let wallet: unknown = null; let tinyfishConnected = false;
      if (process.env.TINYFISH_API_KEY?.trim()) {
        try { wallet = await getWallet(getClient()); tinyfishConnected = true; } catch { /* Keep connection state generic; never return provider configuration details. */ }
      }
      sendJson(res, 200, { geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()), tinyfishConnected, wallet }); return true;
    }
    const api = getClient();
    if (pathname === '/api/dashboard/search' && method === 'POST') { sendJson(res, 200, await searchWeb(api, object(await readBody(req)) as never)); return true; }
    if (pathname === '/api/dashboard/fetch' && method === 'POST') { sendJson(res, 200, await fetchUrls(api, object(await readBody(req)) as never)); return true; }
    if (pathname === '/api/dashboard/research' && method === 'GET') { sendJson(res, 200, await listResearch(api, {}, undefined)); return true; }
    if (pathname === '/api/dashboard/research' && method === 'POST') { sendJson(res, 202, await startResearch(api, object(await readBody(req)) as never, researchHistory)); return true; }
    const researchRoute = /^\/api\/dashboard\/research\/([^/]+)(?:\/(cancel))?$/.exec(pathname);
    if (researchRoute) { const id = decodeURIComponent(researchRoute[1]); sendJson(res, 200, researchRoute[2] ? await cancelResearch(api,id) : await getResearch(api,id,researchHistory)); return true; }
    if (pathname === '/api/dashboard/runs' && method === 'GET') { sendJson(res, 200, await listRuns(api, { limit: 30 })); return true; }
    if (pathname === '/api/dashboard/automation' && method === 'POST') {
      const body=object(await readBody(req,64*1024)); const proxy=object(body.proxyConfig);
      if (body.useVault || body.credentialItemIds || proxy.url || proxy.username || proxy.password || (proxy.type && proxy.type !== 'tinyfish')) { sendJson(res,400,{error:'Web automation accepts a TinyFish profile only; credentials and custom proxies must remain in trusted configuration.'}); return true; }
      sendJson(res, 202, await startAutomation(api, body as never)); return true;
    }
    const screenshotRoute = /^\/api\/dashboard\/runs\/([^/]+)\/steps\/([^/]+)\/screenshot$/.exec(pathname);
    if (screenshotRoute && method === 'GET') {
      const bytes = await getRunStepScreenshot(api, decodeURIComponent(screenshotRoute[1]), decodeURIComponent(screenshotRoute[2]));
      const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(Buffer.from(bytes)); return true;
    }
    const runRoute = /^\/api\/dashboard\/runs\/([^/]+)(?:\/(cancel))?$/.exec(pathname);
    if (runRoute) { const id=decodeURIComponent(runRoute[1]); sendJson(res,200,runRoute[2]?await cancelRun(api,id):await getRun(api,id)); return true; }
    if (pathname === '/api/dashboard/monitors' && method === 'GET') { sendJson(res,200,await listMonitors(api)); return true; }
    if (pathname === '/api/dashboard/monitors' && method === 'POST') { sendJson(res,201,await createMonitor(api,object(await readBody(req)) as never)); return true; }
    const monitorRoute=/^\/api\/dashboard\/monitors\/([^/]+)(?:\/(run))?$/.exec(pathname);
    if(monitorRoute){const id=decodeURIComponent(monitorRoute[1]); if(method==='DELETE'){await deleteMonitor(api,id);sendJson(res,200,{ok:true});return true;} if(monitorRoute[2]&&method==='POST'){sendJson(res,202,await runMonitorNow(api,id));return true;} if(method==='PATCH'){sendJson(res,200,await updateMonitor(api,id,object(await readBody(req)) as never));return true;}}
    if(pathname==='/api/dashboard/profiles'&&method==='GET'){sendJson(res,200,await listProfiles(api));return true;}
    if(pathname==='/api/dashboard/wallet'&&method==='GET'){sendJson(res,200,await getWallet(api));return true;}
    if(pathname==='/api/dashboard/usage'&&method==='GET'){const kind=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`).searchParams.get('kind');const params={limit:30};sendJson(res,200,kind==='search'?await listSearchUsage(api,params):kind==='fetch'?await listFetchUsage(api,params):await listBrowserUsage(api,params));return true;}
    sendJson(res,404,{error:'Dashboard API route not found.'}); return true;
  } catch(error){const result=jsonError(error);sendJson(res,result.status,result.body);return true;}
}
