type RecordValue = Record<string, any>;

class WebDashboard {
  private readonly nav = [...document.querySelectorAll<HTMLButtonElement>('#web-dashboard-nav [data-view]')];
  private readonly dashboard = document.getElementById('web-dashboard') as HTMLElement;
  private readonly eventSource: EventSource;
  private currentView = 'home';
  private cache: { tasks: RecordValue[]; research: RecordValue[]; runs: RecordValue[] } = { tasks: [], research: [], runs: [] };

  constructor() {
    document.body.classList.add('dashboard-active'); this.dashboard.hidden = false;
    this.nav.forEach((button) => button.addEventListener('click', () => this.show(button.dataset.view || 'home')));
    document.querySelectorAll<HTMLButtonElement>('[data-open-view]').forEach((button) => button.addEventListener('click', () => this.show(button.dataset.openView || 'home')));
    document.querySelectorAll<HTMLButtonElement>('[data-refresh]').forEach((button) => button.addEventListener('click', () => void this.load(button.dataset.refresh || this.currentView)));
    document.getElementById('web-task-form')?.addEventListener('submit', (event) => void this.startTask(event));
    document.getElementById('web-research-form')?.addEventListener('submit', (event) => void this.startResearch(event));
    document.getElementById('web-monitor-form')?.addEventListener('submit', (event) => void this.createMonitor(event));
    document.getElementById('web-browser-form')?.addEventListener('submit', (event) => void this.startBrowser(event));
    document.querySelectorAll<HTMLButtonElement>('[data-task-prompt]').forEach((button) => button.addEventListener('click', () => {
      const input=document.getElementById('web-task-input') as HTMLTextAreaElement; input.value=button.dataset.taskPrompt||''; input.focus(); input.setSelectionRange(input.value.length,input.value.length);
    }));
    document.getElementById('web-open-guidance')?.addEventListener('click', () => this.openGuidance());
    document.getElementById('web-dashboard-return')?.addEventListener('click', () => { this.dashboard.hidden=false; document.body.classList.add('dashboard-active'); document.getElementById('web-dashboard-return')?.setAttribute('hidden',''); });
    document.getElementById('web-dashboard-signout')?.addEventListener('click', () => void this.signOut());
    this.eventSource = new EventSource('/api/events');
    this.eventSource.addEventListener('task', () => { void this.load('tasks'); });
    this.eventSource.onerror = () => this.setServiceState(false, 'Live updates reconnecting');
    void this.load('home');
  }

  private async api<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, { ...init, credentials: 'same-origin', cache: 'no-store', headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) } });
    const data = await response.json().catch(() => ({})) as RecordValue;
    if (response.status === 401) { this.eventSource.close(); window.location.reload(); throw new Error('Your session has expired. Sign in again.'); }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data as T;
  }

  private show(view: string): void {
    if (!['home','tasks','browser','research','monitors','history','settings'].includes(view)) return;
    this.currentView = view;
    document.querySelectorAll<HTMLElement>('[data-web-view]').forEach((section) => { section.hidden = section.dataset.webView !== view; });
    this.nav.forEach((button) => button.classList.toggle('active', button.dataset.view === view));
    const title = document.getElementById('web-view-title'); if (title) title.textContent = view[0].toUpperCase() + view.slice(1);
    void this.load(view);
  }

  private async load(view: string): Promise<void> {
    try {
      if (view === 'home' || view === 'tasks' || view === 'history') {
        const [tasksResult, runsResult, researchResult] = await Promise.allSettled([
          this.api<{ tasks: RecordValue[] }>('/api/tasks'), this.api<RecordValue>('/api/dashboard/runs'), this.api<RecordValue>('/api/dashboard/research')
        ]);
        if(tasksResult.status==='rejected')throw tasksResult.reason;
        this.cache = { tasks: tasksResult.value.tasks || [], runs: runsResult.status==='fulfilled'?this.rows(runsResult.value,['runs','data']):[], research: researchResult.status==='fulfilled'?this.rows(researchResult.value,['research_runs','runs','data']):[] };
        this.renderTasks(view === 'home' ? 'web-home-tasks' : 'web-task-list', this.cache.tasks.slice(0, view === 'home' ? 4 : 100));
        if (view === 'home') {
          const active = this.cache.tasks.filter((task) => !['completed','failed','cancelled'].includes(task.state)).length;
          this.setText('web-active-count', String(active));
          this.renderServiceStatus();
        }
        if (view === 'history') this.renderHistory();
      } else if (view === 'browser') {
        const runs = await this.api<RecordValue>('/api/dashboard/runs'); this.cache.runs = this.rows(runs,['runs','data']); this.renderRuns(); void this.loadBrowserProfiles();
      } else if (view === 'research') {
        const report = await this.api<RecordValue>('/api/dashboard/research'); this.cache.research = this.rows(report,['research_runs','runs','data']); this.renderResearch();
      } else if (view === 'monitors') this.renderMonitors(await this.api<RecordValue>('/api/dashboard/monitors'));
      else if (view === 'settings') { const status = await this.api<RecordValue>('/api/dashboard/status'); this.renderSettings(status); }
      else if (view === 'wallet') { const [wallet,usage]=await Promise.all([this.api<RecordValue>('/api/dashboard/wallet'),this.api<RecordValue>('/api/dashboard/usage?kind=browser')]);this.renderWallet(wallet,usage); }
      else if (view === 'status') this.renderSettings(await this.api<RecordValue>('/api/dashboard/status'));
    } catch (error) {
      if (view === 'home' || view === 'tasks') this.message(view === 'home' ? 'web-home-tasks' : 'web-task-list', error, true);
      else if (view === 'browser') this.message('web-browser-list', error, true);
      else if (view === 'research') this.message('web-research-list', error, true);
      else if (view === 'monitors') this.message('web-monitor-list', error, true);
      else if (view === 'settings') this.message('web-settings-tinyfish', error, true);
      else if (view === 'history') this.message('web-history-list', error, true);
    }
  }

  private rows(response: RecordValue, keys: string[]): RecordValue[] { for (const key of keys) if (Array.isArray(response[key])) return response[key]; return []; }
  private setText(id: string, value: string): void { const el = document.getElementById(id); if (el) el.textContent = value; }
  private target(id: string): HTMLElement { return document.getElementById(id) as HTMLElement; }
  private setServiceState(online: boolean, text: string): void { const dot = this.target('web-service-dot'); dot.className = `service-dot ${online ? 'online' : 'offline'}`; this.setText('web-service-status', text); }
  private message(id: string, error: unknown, isError = false): void { const target=this.target(id); target.replaceChildren(); const p=document.createElement('p'); p.className=isError?'web-error':'web-empty'; p.textContent=error instanceof Error?error.message:String(error); target.append(p); }
  private async renderServiceStatus(): Promise<void> {
    const status = await this.api<RecordValue>('/api/dashboard/status');
    this.setText('web-gemini-status', status.geminiConfigured ? 'Connected' : 'Not configured');
    this.setText('web-tinyfish-status', status.tinyfishConnected ? 'Connected' : 'Not configured');
    const wallet=status.wallet||{}; const balance=wallet.balance??wallet.credits??wallet.available_balance;
    this.setText('web-usage-summary', status.tinyfishConnected ? (balance===undefined?'Connected':String(balance)) : '—');
    this.setText('web-settings-gemini', status.geminiConfigured ? 'Configured on the trusted server.' : 'Add GEMINI_API_KEY to the trusted server environment.');
    this.setText('web-settings-tinyfish', status.tinyfishConnected ? 'Connection verified.' : 'Add TINYFISH_API_KEY to the trusted server environment.');
    this.setServiceState(Boolean(status.geminiConfigured || status.tinyfishConnected), 'Services checked');
  }

  private renderTasks(targetId: string, tasks: RecordValue[]): void {
    const target=this.target(targetId); target.replaceChildren();
    if (!tasks.length) { this.message(targetId,'No tasks yet. Describe one above to get started.'); return; }
    tasks.forEach((task) => {
      const card=this.card(target,task.summary || task.task || 'MINDORA task',`${task.state} · Updated ${new Date(task.updatedAt).toLocaleString()}`);
      const body=document.createElement('div'); body.className='web-record-body';
      (task.steps||[]).forEach((step:RecordValue) => { const line=document.createElement('p'); line.textContent=`${step.title} · ${step.state}${step.attempts>1?` · attempt ${step.attempts}`:''}`; body.append(line); if(step.output){const output=document.createElement('p');output.textContent=`Result: ${step.output}`;body.append(output);} });
      if(task.response){const result=document.createElement('p');result.textContent=task.response;body.append(result);}
      (task.evidence||[]).forEach((evidence:RecordValue)=>{const anchor=this.safeLink(evidence.url);if(anchor){anchor.textContent=evidence.title||evidence.url;body.append(anchor);}});
      card.append(body);
      const approvals=task.pendingApprovals||[];
      approvals.forEach((approval:RecordValue)=>{const actions=card.querySelector('.web-record-actions');const action=document.createElement('button');action.type='button';action.textContent=`Approve: ${approval.action||'step'}`;action.addEventListener('click',()=>void this.taskAction(task.id,'approve',approval.id));actions?.append(action);const decline=document.createElement('button');decline.type='button';decline.textContent='Decline';decline.addEventListener('click',()=>void this.taskAction(task.id,'reject',approval.id));actions?.append(decline);});
      if(['running','planning','ready','paused','awaiting_approval'].includes(task.state)){
        const actionName=task.state==='paused'?'resume':'pause';this.action(card,actionName,()=>this.taskAction(task.id,actionName));this.action(card,'Cancel',()=>this.taskAction(task.id,'cancel'));
      }
    });
  }
  private card(target:HTMLElement,title:string,detail:string):HTMLElement {
    const card=document.createElement('article');card.className='web-record'; const header=document.createElement('header'); const titleEl=document.createElement('h3');titleEl.textContent=title;const detailEl=document.createElement('p');detailEl.textContent=detail;const text=document.createElement('div');text.append(titleEl,detailEl);header.append(text);const actions=document.createElement('div');actions.className='web-record-actions';header.append(actions);card.append(header);target.append(card);return card;
  }
  private action(card:HTMLElement,label:string,run:()=>void):void {const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',run);card.querySelector('.web-record-actions')?.append(b);}
  private async taskAction(id:string,action:string,approvalId?:string):Promise<void>{try{await this.api(`/api/tasks/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action,approvalId})});await this.load('tasks');}catch(error){this.message('web-task-list',error,true);}}
  private renderRuns():void {
    const target=this.target('web-browser-list');target.replaceChildren();
    if(!this.cache.runs.length){this.message('web-browser-list','No browser executions yet. Start one through Tasks so approvals and progress stay connected.');return;}
    this.cache.runs.forEach((run)=>{const card=this.card(target,run.goal||run.url||run.run_id||'Browser run',`${run.status||'Status unavailable'} · ${run.created_at||run.createdAt||''}`);if(run.result){const pre=document.createElement('p');pre.textContent=JSON.stringify(run.result);card.append(pre);}const id=run.run_id||run.id;const steps=Array.isArray(run.steps)?run.steps:[];steps.forEach((step:RecordValue)=>{const stepId=step.step_id||step.id;if(!id||!stepId||!(step.screenshot||step.screenshot_url||step.capture_config?.screenshots))return;const img=document.createElement('img');img.className='web-run-screenshot';img.alt=`Browser capture for ${step.title||stepId}`;img.src=`/api/dashboard/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/screenshot`;img.addEventListener('error',()=>img.remove(),{once:true});card.append(img);});if(id&&/running|queued/i.test(run.status||''))this.action(card,'Cancel',async()=>{await this.api(`/api/dashboard/runs/${encodeURIComponent(id)}/cancel`,{method:'POST'});await this.load('browser');});});
  }
  private async loadBrowserProfiles():Promise<void>{try{const response=await this.api<RecordValue>('/api/dashboard/profiles');const rows=this.rows(response,['profiles','data']);const select=document.getElementById('web-browser-profile') as HTMLSelectElement;select.replaceChildren(new Option('Default profile',''));rows.forEach((entry)=>{const item=entry.profile||entry;const id=item.profile_id||item.id;if(id)select.add(new Option(item.name||id,id));});}catch{/* Profile selection remains on the default profile when not configured. */}}
  private renderResearch():void {
    const target=this.target('web-research-list');target.replaceChildren();
    if(!this.cache.research.length){this.message('web-research-list','No research reports yet. Start a question above.');return;}
    this.cache.research.forEach((item)=>{const card=this.card(target,item.query||'Research report',`${item.status||'Unknown status'} · ${item.updatedAt||item.updated_at||''}`);const result=item.report||item.result;if(result){const pre=document.createElement('p');pre.textContent=typeof result==='string'?result:JSON.stringify(result);card.append(pre);}const sources=Array.isArray(item.sources)?item.sources:Array.isArray(result?.sources)?result.sources:[];sources.forEach((source:RecordValue)=>{const link=this.safeLink(source.url||source.link);if(link){link.textContent=source.title||link.href;card.append(link);}});const id=item.researchRunId||item.research_run_id||item.run_id;if(id&&!result)this.action(card,'Refresh report',async()=>{await this.api(`/api/dashboard/research/${encodeURIComponent(id)}`);await this.load('research');});});
  }
  private renderMonitors(response:RecordValue):void {
    const target=this.target('web-monitor-list');target.replaceChildren();const monitors=this.rows(response,['monitors','data']);if(!monitors.length){this.message('web-monitor-list','No monitors configured yet.');return;}
    monitors.forEach((entry)=>{const m=entry.monitor||entry;const id=m.monitor_id||m.id;const card=this.card(target,m.name||m.purpose||'Website monitor',`${m.status||'Unknown'} · ${m.schedule_cron||'Schedule unavailable'}`);const latest=m.latest_run||m.last_run||m.latest_change;if(latest){const detail=document.createElement('p');detail.textContent=typeof latest==='string'?latest:JSON.stringify(latest);card.append(detail);}if(id){this.action(card,m.status==='paused'?'Resume':'Pause',async()=>{await this.api(`/api/dashboard/monitors/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({status:m.status==='paused'?'active':'paused'})});await this.load('monitors');});this.action(card,'Run now',async()=>{await this.api(`/api/dashboard/monitors/${encodeURIComponent(id)}/run`,{method:'POST'});await this.load('monitors');});this.action(card,'Cancel',async()=>{if(confirm('Delete this monitor?')){await this.api(`/api/dashboard/monitors/${encodeURIComponent(id)}`,{method:'DELETE'});await this.load('monitors');}});}});
  }
  private renderHistory():void {const target=this.target('web-history-list');target.replaceChildren();const all=[...this.cache.tasks.map((x)=>({title:x.summary||'Task',detail:x.state})),...this.cache.runs.map((x)=>({title:x.goal||x.url||'Browser run',detail:x.status||''})),...this.cache.research.map((x)=>({title:x.query||'Research',detail:x.status||''}))];if(!all.length){this.message('web-history-list','No activity yet.');return;}all.slice(0,60).forEach((x)=>this.card(target,x.title,x.detail));}
  private renderSettings(status:RecordValue):void {this.setText('web-settings-gemini',status.geminiConfigured?'Configured on the trusted server.':'Add GEMINI_API_KEY to the trusted server environment.');this.setText('web-settings-tinyfish',status.tinyfishConnected?'Connection verified.':'Add TINYFISH_API_KEY to the trusted server environment.');this.setServiceState(Boolean(status.geminiConfigured||status.tinyfishConnected),'Services checked');const profiles=this.target('web-profiles');profiles.replaceChildren();const wallet=this.target('web-wallet');wallet.replaceChildren();if(status.wallet){const pre=document.createElement('pre');pre.textContent=JSON.stringify(status.wallet,null,2);wallet.append(pre);}else this.message('web-wallet','Wallet unavailable.');void this.api<RecordValue>('/api/dashboard/profiles').then((response)=>{const rows=this.rows(response,['profiles','data']);if(!rows.length)this.message('web-profiles','No profiles returned.');rows.forEach((x)=>{const p=document.createElement('p');p.textContent=x.name||x.profile_id||x.id||'Browser profile';profiles.append(p);});}).catch((error)=>this.message('web-profiles',error,true));}
  private renderWallet(wallet:RecordValue,usage:RecordValue):void{const target=this.target('web-wallet');target.replaceChildren();const pre=document.createElement('pre');pre.textContent=JSON.stringify({wallet,usage},null,2);target.append(pre);}
  private renderServiceState(online:boolean,text:string):void{this.setServiceState(online,text);}
  private safeLink(raw:unknown):HTMLAnchorElement|null{if(typeof raw!=='string')return null;try{const url=new URL(raw);if(!['http:','https:'].includes(url.protocol))return null;const a=document.createElement('a');a.href=url.href;a.target='_blank';a.rel='noopener noreferrer';return a;}catch{return null;}}
  private async startTask(event:Event):Promise<void>{event.preventDefault();const form=event.currentTarget as HTMLFormElement;const input=document.getElementById('web-task-input') as HTMLTextAreaElement;const button=form.querySelector('button[type="submit"]') as HTMLButtonElement;button.disabled=true;try{await this.api('/api/tasks',{method:'POST',body:JSON.stringify({task:input.value})});input.value='';this.show('tasks');}catch(error){this.message('web-home-tasks',error,true);}finally{button.disabled=false;}}
  private async startResearch(event:Event):Promise<void>{event.preventDefault();const form=event.currentTarget as HTMLFormElement;const data=new FormData(form);const button=form.querySelector('button[type="submit"]') as HTMLButtonElement;button.disabled=true;try{await this.api('/api/dashboard/research',{method:'POST',body:JSON.stringify({query:data.get('query'),domainType:data.get('domainType')})});form.reset();await this.load('research');}catch(error){this.message('web-research-list',error,true);}finally{button.disabled=false;}}
  private async createMonitor(event:Event):Promise<void>{event.preventDefault();const form=event.currentTarget as HTMLFormElement;const data=new FormData(form);const button=form.querySelector('button[type="submit"]') as HTMLButtonElement;button.disabled=true;try{await this.api('/api/dashboard/monitors',{method:'POST',body:JSON.stringify({type:'fetch',name:data.get('purpose'),purpose:data.get('purpose'),scheduleCron:data.get('scheduleCron'),config:{url:data.get('url'),purpose:data.get('purpose')}})});form.reset();await this.load('monitors');}catch(error){this.message('web-monitor-list',error,true);}finally{button.disabled=false;}}
  private async startBrowser(event:Event):Promise<void>{event.preventDefault();const form=event.currentTarget as HTMLFormElement;const data=new FormData(form);const goal=String(data.get('goal')||'');if(/\b(bypass|solve|circumvent)\b.{0,30}\b(captcha|mfa|multi.factor|security challenge)\b/i.test(goal)){this.message('web-browser-list','MINDORA cannot bypass CAPTCHA, MFA, or website security controls.',true);return;}if(!window.confirm(`Approve this TinyFish browser run? It may make changes on the website described by your goal.\n\n${goal}\n\nMINDORA will stop at CAPTCHA, MFA, or security challenges.`))return;const button=form.querySelector('button[type="submit"]') as HTMLButtonElement;button.disabled=true;try{const profileId=String(data.get('profileId')||'');await this.api('/api/dashboard/automation',{method:'POST',body:JSON.stringify({url:data.get('url'),goal,...(profileId?{useProfile:true,profileId}:{}),captureConfig:{screenshots:true,html:true,snapshots:true}})});form.reset();await this.load('browser');}catch(error){this.message('web-browser-list',error,true);}finally{button.disabled=false;}}
  private openGuidance():void{this.dashboard.hidden=true;document.body.classList.remove('dashboard-active');document.getElementById('web-dashboard-return')?.removeAttribute('hidden');document.getElementById('workspace')?.scrollIntoView({behavior:'smooth'});}
  private async signOut():Promise<void>{this.eventSource.close();await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});window.location.reload();}
}

let dashboard: WebDashboard | null = null;
function activate():void { if (!dashboard) dashboard = new WebDashboard(); }
window.addEventListener('mindora:authenticated', activate);
window.addEventListener('DOMContentLoaded', () => { void fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}).then((response)=>{if(response.ok)activate();}).catch(()=>undefined); });
