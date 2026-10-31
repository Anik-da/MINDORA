import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentOrchestrator } from '../server/agent/orchestrator.js';
import { ApprovalManager } from '../server/agent/approval-manager.js';
import { AgentEventBus } from '../server/agent/event-bus.js';
import { AgentAnswerModel, AgentPlan, AgentPlanModel, AgentPlanStep, AgentTool, AgentToolResult } from '../server/agent/execution-state.js';
import { AgentPlanner } from '../server/agent/planner.js';
import { AgentTaskManager } from '../server/agent/task-manager.js';
import { AgentToolRegistry } from '../server/agent/tool-registry.js';
import { createGeminiPlanModel } from '../server/agent/gemini-planner.js';
import { createTinyFishTools } from '../server/agent/tinyfish-tools.js';
import { TinyFishClient } from '../server/integrations/tinyfish/client.js';

function plan(...steps: AgentPlanStep[]): AgentPlan { return { summary: 'Use evidence-backed tools to complete the request.', steps }; }
function step(id: string, tool: string, options: Partial<AgentPlanStep> = {}): AgentPlanStep {
  return { id, title: options.title || `Run ${id}`, tool, input: options.input || {}, dependsOn: options.dependsOn || [], effect: options.effect || 'read' };
}
let evidenceSequence = 0;
function evidence(source = 'https://example.test/page') { return [{ id: `evidence:${source}:${++evidenceSequence}`, type: 'url' as const, source, title: 'Verified source', url: source }]; }
function tool(id: string, run: AgentTool['execute'], capability: 'read' | 'write' = 'read', maxAttempts = 2): AgentTool {
  return { id, description: `Test ${id}.`, capability, maxAttempts, execute: run };
}
function model(value: unknown | (() => Promise<unknown>)): AgentPlanModel {
  return { plan: async () => typeof value === 'function' ? (value as () => Promise<unknown>)() : value };
}
function system(rawPlan: unknown, registry: AgentToolRegistry, options: { taskManager?: AgentTaskManager; retryDelayMs?: () => number; events?: AgentEventBus; answerModel?: AgentAnswerModel } = {}) {
  const planner = new AgentPlanner(model(rawPlan), registry);
  return new AgentOrchestrator({ planner, tools: registry, tasks: options.taskManager, events: options.events, answerModel: options.answerModel, retryDelayMs: options.retryDelayMs ? () => options.retryDelayMs!() : () => 0 });
}
async function waitFor(predicate: () => boolean, timeoutMs = 1500): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for agent task state.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
async function startAndWait(agent: AgentOrchestrator, task: string, terminal: 'completed' | 'failed' | 'cancelled' = 'completed') {
  const started = agent.startTask(task);
  await waitFor(() => agent.getTask(started.id)?.state === terminal);
  return agent.getTask(started.id)!;
}

describe('Agent plan validation', () => {
  it('accepts registered tools, validates dependencies, and normalizes duplicate dependency IDs', async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool('tinyfish.search', async () => ({ output: {}, evidence: evidence() })));
    const planner = new AgentPlanner(model(plan(
      step('search', 'tinyfish.search'),
      step('read', 'tinyfish.search', { dependsOn: ['search', 'search'] })
    )), registry);
    const result = await planner.createPlan('Find current information.');
    assert.deepEqual(result.steps[1].dependsOn, ['search']);
  });

  it('requires and inserts TinyFish search for factual questions, and fails clearly when TinyFish is unavailable', async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool('tinyfish.search', async () => ({ output: {}, evidence: evidence() })));
    registry.register(tool('desktop.observe', async () => ({ output: {}, evidence: evidence() })));
    const planner = new AgentPlanner(model(plan(step('summarize', 'desktop.observe'))), registry);
    const result = await planner.createPlan('Who is the current CEO of Example Corp?');
    assert.equal(result.steps.filter((item) => item.tool === 'tinyfish.search').length, 1);
    assert.deepEqual(result.steps[1].dependsOn, ['tinyfish_required_search']);

    const missing = new AgentToolRegistry();
    missing.register(tool('desktop.observe', async () => ({ output: {}, evidence: evidence() })));
    await assert.rejects(new AgentPlanner(model(plan(step('observe', 'desktop.observe'))), missing).createPlan('Who is the current CEO of Example Corp?'), /TinyFish is required.*not configured/i);
  });

  it('rejects invented tools, missing dependencies, cycles, malformed plans, and excessive steps', async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool('research.search', async () => ({ output: {}, evidence: evidence() })));
    const invalidPlans = [
      plan(step('a', 'made.up.tool')),
      plan(step('a', 'research.search', { dependsOn: ['missing'] })),
      plan(step('a', 'research.search', { dependsOn: ['b'] }), step('b', 'research.search', { dependsOn: ['a'] })),
      { summary: 'no steps', steps: [] },
      plan(...Array.from({ length: 21 }, (_, i) => step(`s${i}`, 'research.search')))
    ];
    for (const invalid of invalidPlans) await assert.rejects(new AgentPlanner(model(invalid), registry).createPlan('Task'));
  });
});

describe('Agent task execution', () => {
  it('sends completed TinyFish results and source URLs to Gemini for the final answer', async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool('tinyfish.search', async () => ({ output: { results: [{ title: 'Current finding', url: 'https://example.test/fact', snippet: 'Verified data' }] }, evidence: evidence('https://example.test/fact') })));
    let received: unknown;
    const answerModel: AgentAnswerModel = { answer: async (_task, _summary, results) => { received = results; return 'The verified answer is 42 [source](https://example.test/fact).'; } };
    const task = await startAndWait(system(plan(step('search', 'tinyfish.search')), registry, { answerModel }), 'What is the current verified fact?');
    assert.equal(task.state, 'completed');
    assert.match(task.response || '', /verified answer is 42/);
    assert.match(task.response || '', /https:\/\/example\.test\/fact/);
    assert.match(JSON.stringify(received), /Verified data/);
    assert.match(JSON.stringify(received), /https:\/\/example\.test\/fact/);
  });

  it('runs independent steps in parallel, waits for dependencies, and retains evidence-backed history', async () => {
    const registry = new AgentToolRegistry();
    let active = 0; let maximum = 0; const received: unknown[] = [];
    registry.register(tool('research.search', async (input) => {
      active++; maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 15)); active--;
      received.push(input.query);
      return { output: { results: [{ url: 'https://example.test/item', title: 'Item' }] }, evidence: evidence() };
    }));
    registry.register(tool('research.fetch', async (input) => {
      received.push(input.url);
      return { output: { title: 'Fetched page' }, evidence: evidence('https://example.test/item') };
    }));
    const taskManager = new AgentTaskManager();
    const agent = system(plan(
      step('first', 'research.search', { input: { query: 'first' } }),
      step('second', 'research.search', { input: { query: 'second' } }),
      step('fetch', 'research.fetch', { input: { url: '$steps.first.results.0.url' }, dependsOn: ['first'] })
    ), registry, { taskManager });
    const completed = await startAndWait(agent, 'Find and read evidence.');
    assert.equal(completed.state, 'completed');
    assert.equal(maximum, 2);
    assert.ok(received.includes('https://example.test/item'));
    assert.equal(completed.steps.filter((item) => item.state === 'completed').length, 3);
    assert.ok(completed.evidence.length >= 3);
    assert.match(completed.response || '', /Evidence:/);
    assert.equal(taskManager.history()[0].id, completed.id);
  });

  it('requires approval for consequential language and write tools before executing them', async () => {
    let executed = false;
    const registry = new AgentToolRegistry();
    registry.register(tool('tinyfish.automation', async () => { executed = true; return { output: {}, evidence: evidence() }; }, 'write'));
    const agent = system(plan(step('send', 'tinyfish.automation', { title: 'Send an email', effect: 'read' })), registry);
    const events: string[] = [];
    agent.events.subscribe((event) => { if (event.type === 'approval_required' && event.approvalId) events.push(event.approvalId); });
    const task = agent.startTask('Send the prepared email.');
    await waitFor(() => events.length === 1);
    assert.equal(executed, false);
    assert.equal(agent.getTask(task.id)?.state, 'awaiting_approval');
    agent.approve(events[0]);
    await waitFor(() => agent.getTask(task.id)?.state === 'completed');
    assert.equal(executed, true);
  });

  it('cancels a consequential task when the user rejects approval', async () => {
    let executed = false;
    const registry = new AgentToolRegistry();
    registry.register(tool('external.publish', async () => { executed = true; return { output: {}, evidence: evidence() }; }, 'write'));
    const agent = system(plan(step('publish', 'external.publish')), registry);
    let approvalId = '';
    agent.events.subscribe((event) => { if (event.type === 'approval_required') approvalId = event.approvalId || ''; });
    const task = agent.startTask('Publish this article.');
    await waitFor(() => Boolean(approvalId));
    agent.reject(approvalId);
    await waitFor(() => agent.getTask(task.id)?.state === 'cancelled');
    assert.equal(executed, false);
  });

  it('serializes approvals for parallel consequential steps so each one is actionable', async () => {
    const registry = new AgentToolRegistry(); let executed = 0; const approvals: string[] = [];
    registry.register(tool('external.write', async () => { executed++; return { output: {}, evidence: evidence() }; }, 'write'));
    const agent = system(plan(step('first', 'external.write'), step('second', 'external.write')), registry);
    agent.events.subscribe((event) => { if (event.type === 'approval_required' && event.approvalId) approvals.push(event.approvalId); });
    const task = agent.startTask('Perform two external changes.');
    await waitFor(() => approvals.length === 1);
    assert.equal(agent.getPendingApprovals(task.id).length, 1);
    agent.approve(approvals[0]);
    await waitFor(() => approvals.length === 2);
    assert.equal(agent.getPendingApprovals(task.id).length, 1);
    agent.approve(approvals[1]);
    await waitFor(() => agent.getTask(task.id)?.state === 'completed');
    assert.equal(executed, 2);
  });

  it('retries retryable reads, never retries write tools, and fails if a tool returns no evidence', async () => {
    const registry = new AgentToolRegistry(); let readAttempts = 0; let writeAttempts = 0;
    registry.register(tool('research.read', async () => {
      if (++readAttempts < 2) throw new Error('temporary provider failure');
      return { output: { ok: true }, evidence: evidence() };
    }));
    registry.register(tool('external.write', async () => { writeAttempts++; throw new Error('provider rejected action'); }, 'write', 4));
    const success = await startAndWait(system(plan(step('read', 'research.read')), registry), 'Read a reliable result.');
    assert.equal(success.state, 'completed'); assert.equal(readAttempts, 2);
    const writeAgent = system(plan(step('write', 'external.write')), registry);
    const writeTask = writeAgent.startTask('Make a change.');
    await waitFor(() => writeAgent.getTask(writeTask.id)?.state === 'awaiting_approval');
    const approval = writeAgent.getPendingApprovals(writeTask.id)[0];
    writeAgent.approve(approval.id);
    await waitFor(() => writeAgent.getTask(writeTask.id)?.state === 'failed');
    assert.equal(writeAttempts, 1);
    const emptyRegistry = new AgentToolRegistry();
    emptyRegistry.register(tool('research.empty', async (): Promise<AgentToolResult> => ({ output: { claim: 'done' }, evidence: [] })));
    const unsupported = await startAndWait(system(plan(step('empty', 'research.empty')), emptyRegistry), 'Verify a claim.', 'failed');
    assert.match(unsupported.error || '', /no valid evidence/i);
    assert.equal(unsupported.state, 'failed');
  });

  it('pauses at a safe boundary, resumes, and reflects pause events', async () => {
    const registry = new AgentToolRegistry(); let releaseFirst!: () => void; let runs = 0;
    registry.register(tool('research.wait', async (_input, context) => {
      runs++;
      if (runs === 1) await new Promise<void>((resolve, reject) => {
        releaseFirst = resolve;
        context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
      });
      return { output: { run: runs }, evidence: evidence() };
    }));
    const agent = system(plan(step('one', 'research.wait'), step('two', 'research.wait', { dependsOn: ['one'] })), registry);
    const task = agent.startTask('Do two steps.');
    await waitFor(() => agent.getTask(task.id)?.state === 'waiting_for_tool');
    agent.pause(task.id);
    releaseFirst();
    await waitFor(() => agent.getTask(task.id)?.state === 'paused');
    assert.equal(agent.getTask(task.id)?.steps[1].state, 'pending');
    agent.resume(task.id);
    await waitFor(() => agent.getTask(task.id)?.state === 'completed');
  });

  it('does not report desktop tasks complete before an observation verifies completion', async () => {
    const registry = new AgentToolRegistry(); let observations = 0;
    registry.register(tool('desktop.observe', async () => {
      observations++;
      return {
        output: { status: observations === 1 ? 'guide' : 'complete' }, evidence: evidence(`https://example.test/screen/${observations}`),
        needsUserAction: observations === 1
      };
    }));
    const agent = system(plan(step('observe', 'desktop.observe')), registry);
    const task = agent.startTask('Create a chart in the desktop application.');
    await waitFor(() => agent.getTask(task.id)?.state === 'paused');
    assert.equal(agent.getTask(task.id)?.steps[0].state, 'pending');
    assert.equal(agent.getTask(task.id)?.state, 'paused');
    agent.resume(task.id);
    await waitFor(() => agent.getTask(task.id)?.state === 'completed');
    assert.equal(observations, 2);
  });

  it('cancels active tools and aborts unresolved approval waits', async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool('research.blocking', async (_input, context) => new Promise((_resolve, reject) => {
      context.signal.addEventListener('abort', () => reject(context.signal.reason), { once: true });
    })));
    const agent = system(plan(step('blocking', 'research.blocking')), registry);
    const task = agent.startTask('Cancel this task.');
    await waitFor(() => agent.getTask(task.id)?.state === 'waiting_for_tool');
    agent.cancel(task.id);
    await waitFor(() => agent.getTask(task.id)?.state === 'cancelled');
    assert.equal(agent.getTask(task.id)?.state, 'cancelled');
  });

  it('emits immutable execution events and isolates subscriber exceptions', async () => {
    const registry = new AgentToolRegistry();
    registry.register(tool('research.ok', async () => ({ output: {}, evidence: evidence() })));
    const bus = new AgentEventBus(); let eventCount = 0;
    bus.subscribe(() => { throw new Error('UI subscriber failure'); });
    bus.subscribe((event) => { eventCount++; if (event.task.state === 'completed') assert.equal(event.task.steps[0].state, 'completed'); });
    const task = await startAndWait(system(plan(step('one', 'research.ok')), registry, { events: bus }), 'Complete with a source.');
    assert.equal(task.state, 'completed');
    assert.ok(eventCount >= 7);
  });

  it('persists bounded task history without raw tool inputs or outputs and restores it safely', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mindora-agent-history-'));
    try {
      const file = path.join(dir, 'history.json');
      const tasks = new AgentTaskManager(10, () => '2026-10-31T10:00:00.000Z', file);
      const task = tasks.create('Use password: topsecret123 for this site.');
      tasks.setPlan(task.id, plan(step('fetch', 'tinyfish.fetch', { input: { password: 'topsecret123', urls: ['https://example.test'] } })));
      tasks.updateStep(task.id, 'fetch', { state: 'completed', output: { password: 'topsecret123', text: 'private page content' }, evidence: evidence() });
      tasks.addEvidence(task.id, evidence());
      tasks.setState(task.id, 'completed', { response: 'Completed from https://example.test/?token=abc123' });
      const raw = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(raw, /topsecret123|private page content|token=abc123/);
      const restored = new AgentTaskManager(10, undefined, file).get(task.id)!;
      assert.equal(restored.state, 'completed');
      assert.equal(restored.steps[0].output, undefined);
      assert.equal(restored.steps[0].input && Object.keys(restored.steps[0].input).length, 0);
      assert.match(restored.task, /\[redacted\]/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });
});

describe('Approval policy', () => {
  it('flags message, form, purchase, publish, delete, and account-setting actions', () => {
    const approvals = new ApprovalManager();
    for (const action of ['send an email', 'submit the form', 'purchase this item', 'publish an update', 'delete the record', 'change account settings']) {
      assert.equal(approvals.requiresApproval(action, step('action', 'read.tool', { title: action }), 'read'), true, action);
    }
    assert.equal(approvals.requiresApproval('Research the topic', step('search', 'read.tool'), 'read'), false);
  });
});

describe('Gemini and TinyFish agent adapters', () => {
  it('sends the registered tool catalog to Gemini and parses the constrained plan response', async () => {
    let requestUrl = ''; let requestHeaders = new Headers(); let requestBody: Record<string, unknown> = {};
    const expected = plan(step('search', 'tinyfish.search', { input: { query: 'MINDORA' } }));
    const fetchImpl: typeof fetch = async (input, init = {}) => {
      requestUrl = String(input); requestHeaders = new Headers(init.headers); requestBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(expected) }] } }] }), { headers: { 'content-type': 'application/json' } });
    };
    const model = createGeminiPlanModel('AIzaSyTestCredentialShouldNeverBeLogged0000000000', fetchImpl);
    const tools = [{ id: 'tinyfish.search', description: 'Search public web.', capability: 'read' as const }];
    assert.deepEqual(await model.plan('Search for MINDORA.', tools), expected);
    assert.match(requestUrl, /generativelanguage\.googleapis\.com/);
    assert.equal(requestHeaders.get('x-goog-api-key'), 'AIzaSyTestCredentialShouldNeverBeLogged0000000000');
    assert.match(JSON.stringify(requestBody), /tinyfish\.search/);
  });

  it('retries a bounded number of transient Gemini 503 responses and surfaces the provider message', async () => {
    let calls = 0;
    const expected = plan(step('search', 'tinyfish.search', { input: { query: 'MINDORA' } }));
    const fetchImpl: typeof fetch = async () => {
      calls++;
      if (calls < 3) return new Response(JSON.stringify({ error: { message: 'Service temporarily unavailable' } }), { status: 503, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(expected) }] } }] }), { headers: { 'content-type': 'application/json' } });
    };
    const model = createGeminiPlanModel('AIzaSyRetryTestCredentialNeverLog0000000000', fetchImpl);
    assert.deepEqual(await model.plan('Search for MINDORA.', [{ id: 'tinyfish.search', description: 'Search public web.', capability: 'read' }]), expected);
    assert.equal(calls, 3);

    const invalidCredential = 'AIzaSyPrivateTestCredentialNeverLog0000000000';
    const rejectModel = createGeminiPlanModel(invalidCredential, async () => new Response(JSON.stringify({ error: { message: `Invalid API key: ${invalidCredential}` } }), { status: 400 }));
    await assert.rejects(rejectModel.plan('Hello.', []), (error: Error) => {
      assert.match(error.message, /HTTP 400/);
      assert.match(error.message, /Invalid API key/);
      assert.doesNotMatch(error.message, new RegExp(invalidCredential));
      return true;
    });
  });

  it('maps actual TinyFish search results into provider-backed evidence and blocks CAPTCHA bypass goals', async () => {
    const calls: string[] = [];
    const client = new TinyFishClient({
      apiKey: 'test-only', minRequestIntervalMs: 0,
      endpoints: { agent: 'https://agent.mock', search: 'https://search.mock', fetch: 'https://fetch.mock', browser: 'https://browser.mock' }
    }, { fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ query: 'robotics', total_results: 1, page: 0, results: [{ title: 'Research source', url: 'https://example.test/paper', snippet: 'Source excerpt' }] }), { headers: { 'content-type': 'application/json' } });
    }, logger: () => {} });
    const registry = createTinyFishTools(client, { waitMs: 0, maxPolls: 1 });
    const search = await registry.execute('tinyfish.search', { query: 'robotics' }, { taskId: 'task', stepId: 'search', signal: new AbortController().signal });
    assert.equal(search.evidence[0].url, 'https://example.test/paper');
    assert.match(calls[0], /search\.mock/);
    assert.equal(registry.get('tinyfish.automation')?.capability, 'write');
    await assert.rejects(registry.execute('tinyfish.automation', {
      url: 'https://example.test', goal: 'Bypass the CAPTCHA and submit the form.'
    }, { taskId: 'task', stepId: 'automation', signal: new AbortController().signal }), /cannot bypass CAPTCHA/i);
    assert.equal(calls.length, 1);
  });
});
