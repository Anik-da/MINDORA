/**
 * MINDORA - Launch Window Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  const goalInput = document.getElementById('goal-input');
  const btnPreset = document.getElementById('btn-preset');
  const btnStart = document.getElementById('btn-start');
  const btnRefreshTarget = document.getElementById('btn-refresh-target');
  const appSelector = document.getElementById('app-selector');
  const targetTitle = document.getElementById('target-title');
  const targetDot = document.getElementById('target-dot');
  const targetPickerList = document.getElementById('target-picker-list');
  const btnMin = document.getElementById('btn-min');
  const btnClose = document.getElementById('btn-close');
  const btnMikoToggle = document.getElementById('btn-miko-toggle');
  const mikoToggleLabel = document.getElementById('miko-toggle-label');

  // Key Management DOM Elements
  const btnKeyStatus = document.getElementById('btn-key-status');
  const keyChipDot = document.getElementById('key-chip-dot');
  const keyChipLabel = document.getElementById('key-chip-label');
  const keyModalBackdrop = document.getElementById('key-modal-backdrop');
  const btnCloseKeyModal = document.getElementById('btn-close-key-modal');
  const keyCurrentStatusBanner = document.getElementById('key-current-status-banner');
  const keyStatusBannerText = document.getElementById('key-status-banner-text');
  const btnRemoveKey = document.getElementById('btn-remove-key');
  const inputApiKey = document.getElementById('input-api-key');
  const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
  const keyFeedback = document.getElementById('key-feedback');
  const linkGetKey = document.getElementById('link-get-key');
  const btnTestKey = document.getElementById('btn-test-key');
  const btnSaveKey = document.getElementById('btn-save-key');

  const DEFAULT_GOAL = '';
  let targetApplications = [];
  let selectedTargetHandle = null;

  const pageCopy = {
    home: ['OVERVIEW', 'Home', 'A calm place to start a task and see what needs attention.'],
    tasks: ['WORKSPACE', 'Tasks', 'Follow each task from plan through evidence.'],
    browser: ['TINYFISH', 'Browser', 'Review browser runs and start an explicitly approved automation.'],
    research: ['TINYFISH', 'Research', 'Start research and open reports backed by cited sources.'],
    monitors: ['TINYFISH', 'Monitors', 'Manage scheduled website checks.'],
    history: ['ACTIVITY', 'History', 'Recent tasks, research, and browser executions.'],
    settings: ['PREFERENCES', 'Settings', 'Manage connections, companion preferences, and privacy.']
  };
  const navItems = [...document.querySelectorAll('.nav-item[data-page]')];
  const homePage = document.querySelector('.launch-content');
  const featurePage = document.getElementById('feature-page');
  const agentPanel = document.querySelector('.agent-task-panel');
  const agentSlot = document.getElementById('agent-task-slot');
  let currentPage = 'home';
  if (agentPanel && agentSlot) agentSlot.append(agentPanel);
  function showPage(name) {
    const page = pageCopy[name] ? name : 'home';
    currentPage = page;
    homePage.hidden = page !== 'home';
    featurePage.hidden = page === 'home';
    document.querySelectorAll('.feature-view').forEach((view) => { view.hidden = view.dataset.view !== page; });
    navItems.forEach((item) => {
      const active = item.dataset.page === page;
      item.classList.toggle('active', active);
      if (active) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
    const [eyebrow, title, description] = pageCopy[page];
    document.getElementById('feature-eyebrow').textContent = eyebrow;
    document.getElementById('feature-title').textContent = title;
    document.getElementById('feature-description').textContent = description;
    if (page === 'tasks') loadAgentHistory();
    if (page === 'browser') { loadRuns(); loadBrowserProfiles(); }
    if (page === 'research') loadResearch();
    if (page === 'monitors') loadMonitors();
    if (page === 'history') loadHistory();
    if (page === 'settings' || page === 'home') refreshIntegrationStatus();
  }
  navItems.forEach((item) => item.addEventListener('click', () => showPage(item.dataset.page)));
  document.getElementById('feature-refresh')?.addEventListener('click', () => showPage(currentPage));

  function asRows(response, keys) {
    if (Array.isArray(response)) return response;
    for (const key of keys) if (response && Array.isArray(response[key])) return response[key];
    return [];
  }
  function showError(container, error) {
    container.replaceChildren();
    const row = document.createElement('article'); row.className = 'feature-item';
    const p = document.createElement('p'); p.textContent = error?.message || String(error || 'Request failed.'); row.append(p); container.append(row);
  }
  function appendItem(container, title, details, actions = []) {
    const row = document.createElement('article'); row.className = 'feature-item';
    const content = document.createElement('div');
    const heading = document.createElement('h3'); heading.textContent = title || 'Untitled'; content.append(heading);
    const p = document.createElement('p'); p.textContent = details || ''; content.append(p); row.append(content);
    if (actions.length) {
      const controls = document.createElement('div'); controls.className = 'feature-item-actions';
      actions.forEach(({ label, run }) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', run); controls.append(b); });
      row.append(controls);
    }
    container.append(row); return row;
  }
  function showJson(container, response) {
    container.replaceChildren();
    const pre = document.createElement('pre'); pre.textContent = JSON.stringify(response, null, 2); container.append(pre); container.hidden = false;
  }
  async function loadRuns() {
    const target = document.getElementById('browser-runs'); target.replaceChildren(); appendItem(target, 'Loading browser runs…', 'Checking the configured TinyFish account.');
    try {
      const rows = asRows(await window.electronAPI.tinyfish.listRuns({ limit: 25 }), ['runs', 'data']);
      target.replaceChildren();
      if (!rows.length) appendItem(target, 'No browser runs yet', 'Start a run above or use the Tasks planner.');
      rows.forEach((run) => {
        const item = appendItem(target, run.goal || run.url || run.run_id || 'Browser execution', `${run.status || 'Unknown status'} · ${run.created_at || run.createdAt || ''}`, (run.status === 'RUNNING' || run.status === 'QUEUED') ? [{ label: 'Cancel', run: async () => { await window.electronAPI.tinyfish.cancelRun(run.run_id || run.id); loadRuns(); } }] : []);
        const runId = run.run_id || run.id;
        (Array.isArray(run.steps) ? run.steps : []).forEach((step, index) => {
          if (!runId || !(step.screenshot_available || step.html_available)) return;
          const stepId = step.step_id || step.id || step.index || String(index);
          if (step.screenshot_available) item.append(actionButton('View screenshot', () => showBrowserCapture(runId, stepId, 'screenshot')));
          if (step.html_available) item.append(actionButton('View page text', () => showBrowserCapture(runId, stepId, 'html')));
        });
      });
    } catch (error) { showError(target, error); }
  }
  function actionButton(label, action) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', async () => { button.disabled = true; try { await action(); } catch (error) { showError(document.getElementById('browser-runs'), error); } finally { button.disabled = false; } });
    return button;
  }
  let browserCaptureObjectUrl = '';
  document.getElementById('browser-capture-close')?.addEventListener('click', () => {
    document.getElementById('browser-capture-viewer').hidden = true;
    document.getElementById('browser-capture-image').removeAttribute('src');
    if (browserCaptureObjectUrl) { URL.revokeObjectURL(browserCaptureObjectUrl); browserCaptureObjectUrl = ''; }
  });
  async function showBrowserCapture(runId, stepId, type) {
    const viewer = document.getElementById('browser-capture-viewer');
    const image = document.getElementById('browser-capture-image');
    const html = document.getElementById('browser-capture-html');
    const title = document.getElementById('browser-capture-title');
    viewer.hidden = false; image.hidden = true; html.hidden = true; title.textContent = type === 'screenshot' ? 'Loading screenshot…' : 'Loading page text…';
    if (browserCaptureObjectUrl) { URL.revokeObjectURL(browserCaptureObjectUrl); browserCaptureObjectUrl = ''; }
    if (type === 'screenshot') {
      const bytes = await window.electronAPI.tinyfish.getRunStepScreenshot(runId, stepId);
      const blob = new Blob([bytes], { type: 'image/png' }); browserCaptureObjectUrl = URL.createObjectURL(blob);
      image.src = browserCaptureObjectUrl; image.hidden = false; title.textContent = 'Browser screenshot';
    } else {
      const content = await window.electronAPI.tinyfish.getRunStepHtml(runId, stepId);
      html.textContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
      html.hidden = false; title.textContent = 'Captured page content';
    }
    viewer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  async function loadBrowserProfiles() {
    const select = document.getElementById('browser-profile');
    try {
      const rows = asRows(await window.electronAPI.tinyfish.listProfiles(), ['profiles', 'data']);
      select.replaceChildren(new Option('Default profile', ''));
      rows.forEach((entry) => { const profile = entry.profile || entry; const id = profile.profile_id || profile.id; if (id) select.add(new Option(profile.name || id, id)); });
    } catch { /* Keep the default profile if TinyFish is unavailable. */ }
  }
  async function loadResearch() {
    const target = document.getElementById('research-runs'); target.replaceChildren(); appendItem(target, 'Loading research history…', '');
    try {
      const rows = asRows(await window.electronAPI.tinyfish.researchHistory(), ['runs', 'research_runs', 'data']);
      target.replaceChildren();
      if (!rows.length) appendItem(target, 'No research yet', 'Completed reports and in-progress runs will appear here.');
      rows.forEach((run) => {
        const report = run.report || run.result;
        const sources = Array.isArray(run.sources) ? run.sources : (Array.isArray(report?.sources) ? report.sources : []);
        const item = appendItem(target, run.query || run.research_run_id || 'Research report', `${run.status || 'Unknown status'} · ${run.updatedAt || run.updated_at || ''}`);
        if (report) { const pre = document.createElement('pre'); pre.textContent = typeof report === 'string' ? report : JSON.stringify(report, null, 2); item.firstChild.append(pre); }
        sources.forEach((source) => { const rawUrl = source.url || source.link; let safeUrl = ''; try { const url = new URL(rawUrl); if (url.protocol === 'https:' || url.protocol === 'http:') safeUrl = url.href; } catch {} if (!safeUrl) return; const a = document.createElement('a'); a.href = safeUrl; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = source.title || safeUrl; item.firstChild.append(a); });
        const id = run.researchRunId || run.research_run_id || run.run_id;
        if (id && !report) { const b = document.createElement('button'); b.type='button'; b.textContent='Refresh report'; b.addEventListener('click', async () => { try { await window.electronAPI.tinyfish.getResearch(id); await loadResearch(); } catch(error) { showError(target,error); } }); item.append(b); }
      });
    } catch (error) { showError(target, error); }
  }
  function renderTinyFishSearch(response) {
    const target = document.getElementById('tinyfish-search-results');
    target.replaceChildren();
    const rows = asRows(response, ['results', 'data']);
    if (!rows.length) { appendItem(target, 'Search returned no results', 'TinyFish accepted the search request, but returned no matching pages.'); return; }
    rows.slice(0, 10).forEach((result) => {
      const url = result.url || result.link;
      const row = appendItem(target, result.title || result.site_name || url || 'Web result', result.snippet || result.description || '');
      if (url) {
        try {
          const safe = new URL(url);
          if (safe.protocol === 'https:' || safe.protocol === 'http:') {
            const link = document.createElement('a'); link.href = safe.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = safe.hostname; row.firstChild.append(link);
          }
        } catch { /* Unusable provider URLs are shown as text only. */ }
      }
    });
  }
  async function loadMonitors() {
    const target = document.getElementById('monitor-list'); target.replaceChildren(); appendItem(target, 'Loading monitors…', '');
    try {
      const rows = asRows(await window.electronAPI.tinyfish.listMonitors(), ['monitors', 'data']);
      target.replaceChildren();
      if (!rows.length) appendItem(target, 'No monitors configured', 'Create one with a website and schedule above.');
      rows.forEach((entry) => {
        const monitor = entry.monitor || entry; const id = monitor.monitor_id || monitor.id;
        appendItem(target, monitor.name || monitor.purpose || id, `${monitor.status || 'Unknown status'} · ${monitor.schedule_cron || monitor.scheduleCron || 'No schedule'}`, [
          { label: monitor.status === 'paused' ? 'Resume' : 'Pause', run: async () => { await window.electronAPI.tinyfish.updateMonitor(id, { status: monitor.status === 'paused' ? 'active' : 'paused' }); loadMonitors(); } },
          { label: 'Run now', run: async () => { await window.electronAPI.tinyfish.runMonitorNow(id); loadMonitors(); } },
          { label: 'Cancel', run: async () => { if (window.confirm('Delete this monitor?')) { await window.electronAPI.tinyfish.deleteMonitor(id); loadMonitors(); } } }
        ]);
      });
    } catch (error) { showError(target, error); }
  }
  async function loadHistory() {
    const target = document.getElementById('history-list'); target.replaceChildren(); appendItem(target, 'Loading activity history…', '');
    try {
      const [tasks, runs, research] = await Promise.all([window.electronAPI.agent.history(), window.electronAPI.tinyfish.listRuns({ limit: 15 }), window.electronAPI.tinyfish.researchHistory()]);
      target.replaceChildren();
      [...tasks.map((item) => ({ label: item.plan?.summary || 'Agent task', status: item.state, detail: item.response || item.error || '' })), ...asRows(runs,['runs','data']).map((item) => ({ label:item.goal || item.url || 'Browser run',status:item.status,detail:item.created_at || '' })), ...asRows(research,['runs','research_runs','data']).map((item) => ({label:item.query || 'Research',status:item.status,detail:item.updatedAt || ''}))].slice(0,30).forEach((item) => appendItem(target,item.label,`${item.status || ''} · ${item.detail || ''}`));
      if (!target.childElementCount) appendItem(target, 'Nothing here yet', 'Completed activity will appear here.');
    } catch (error) { showError(target, error); }
  }
  async function refreshIntegrationStatus() {
    const gemini = document.getElementById('gemini-setting-status'); const tinyfish = document.getElementById('tinyfish-setting-status');
    try { const status = await window.electronAPI.getKeyStatus(); gemini.textContent = status.configured ? `Key saved · ${status.maskedKey || 'encrypted locally'} · not tested` : 'Not configured'; const home=document.getElementById('home-gemini-status'); if(home)home.textContent=status.configured?'Key saved':'Not configured'; } catch { gemini.textContent = 'Status unavailable'; }
    tinyfish.textContent = 'Not tested';
    const home=document.getElementById('home-tinyfish-status'); if(home)home.textContent='Not tested';
  }
  document.getElementById('tinyfish-search-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const button = form.querySelector('button[type="submit"]');
    const target = document.getElementById('tinyfish-search-results'); button.disabled = true; target.replaceChildren(); appendItem(target, 'Searching TinyFish…', 'This is a free read-only web search.');
    try { const result = await window.electronAPI.tinyfish.search({ query: String(data.get('query') || '') }); renderTinyFishSearch(result); const status=document.getElementById('tinyfish-setting-status'); if(status)status.textContent='Connected · live Search API response received'; const home=document.getElementById('home-tinyfish-status'); if(home)home.textContent='Connected'; }
    catch (error) { showError(target, error); const status=document.getElementById('tinyfish-setting-status'); if(status)status.textContent=error?.message || 'Search failed'; const home=document.getElementById('home-tinyfish-status'); if(home)home.textContent='Connection failed'; }
    finally { button.disabled = false; }
  });
  document.getElementById('test-tinyfish-connection')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true; const status=document.getElementById('tinyfish-setting-status'); status.textContent='Testing with a free TinyFish Search request…';
    try { renderTinyFishSearch(await window.electronAPI.tinyfish.testSearchConnection()); status.textContent='Connected · live Search API response received'; const home=document.getElementById('home-tinyfish-status'); if(home)home.textContent='Connected'; }
    catch (error) { status.textContent=error?.message || 'TinyFish connection failed'; const home=document.getElementById('home-tinyfish-status'); if(home)home.textContent='Connection failed'; }
    finally { button.disabled = false; }
  });
  document.getElementById('test-gemini-connection')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true; const status=document.getElementById('gemini-setting-status'); status.textContent='Testing saved key with a short Gemini response…';
    try { const result = await window.electronAPI.testApiKey(); status.textContent=result.success?'Connected · Gemini returned a live response':(result.error || 'Gemini connection failed'); const home=document.getElementById('home-gemini-status'); if(home)home.textContent=result.success?'Connected':'Connection failed'; }
    catch (error) { status.textContent=error?.message || 'Gemini connection failed'; }
    finally { button.disabled = false; }
  });
  document.getElementById('browser-run-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form); const goal = String(data.get('goal') || '');
    const button = form.querySelector('button[type="submit"]'); button.disabled = true;
    const profileId = String(data.get('profileId') || '');
    try { const result = await window.electronAPI.tinyfish.startAutomation({ url: String(data.get('url')), goal, ...(profileId ? { useProfile:true, profileId } : {}), captureConfig: { screenshots:true, html:true, snapshots:true } }); if (result?.cancelled) return; form.reset(); loadRuns(); } catch(error) { showError(document.getElementById('browser-runs'),error); } finally { button.disabled = false; }
  });
  document.getElementById('research-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); const button=form.querySelector('button[type="submit"]'); button.disabled=true; try { const result=await window.electronAPI.tinyfish.startResearch({ query:String(data.get('query')), domainType:String(data.get('domainType')) }); if(result?.cancelled)return; form.reset(); loadResearch(); } catch(error) { showError(document.getElementById('research-runs'),error); } finally { button.disabled=false; } });
  document.getElementById('monitor-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form=event.currentTarget; const data=new FormData(form); const button=form.querySelector('button[type="submit"]'); button.disabled=true; try { const result=await window.electronAPI.tinyfish.createMonitor({ type:'fetch', purpose:String(data.get('goal')), name:String(data.get('goal')).slice(0,80), scheduleCron:String(data.get('scheduleCron')), config:{url:String(data.get('url')),purpose:String(data.get('goal'))} }); if(result?.cancelled)return; form.reset(); loadMonitors(); } catch(error) { showError(document.getElementById('monitor-list'),error); } finally { button.disabled=false; } });
  document.querySelectorAll('[data-load="wallet"]').forEach((button) => button.addEventListener('click', async () => { try { showJson(document.getElementById('wallet-status'), await window.electronAPI.tinyfish.getWallet()); } catch(error) { showError(document.getElementById('wallet-status'),error); } }));
  document.querySelectorAll('[data-load="profiles"]').forEach((button) => button.addEventListener('click', async () => { try { showJson(document.getElementById('profiles-status'), await window.electronAPI.tinyfish.listProfiles()); } catch(error) { showError(document.getElementById('profiles-status'),error); } }));
  document.querySelectorAll('[data-load="runs"]').forEach((button) => button.addEventListener('click',loadRuns));
  document.querySelectorAll('[data-load="history"]').forEach((button) => button.addEventListener('click',loadHistory));
  document.getElementById('open-gemini-settings')?.addEventListener('click', () => document.getElementById('btn-key-status')?.click());
  document.getElementById('settings-miko-toggle')?.addEventListener('click', () => document.getElementById('btn-miko-toggle')?.click());

  function renderMikoPreference(settings) {
    if (!settings || !btnMikoToggle) return;
    btnMikoToggle.setAttribute('aria-pressed', String(settings.enabled));
    btnMikoToggle.title = settings.enabled ? 'Hide MIKO' : 'Show MIKO';
    if (mikoToggleLabel) mikoToggleLabel.textContent = `MIKO ${settings.enabled ? 'On' : 'Off'}`;
    const enabledControl=document.getElementById('settings-miko-enabled'); if(enabledControl) enabledControl.checked=Boolean(settings.enabled);
    const topControl=document.getElementById('settings-miko-top'); if(topControl) topControl.checked=Boolean(settings.alwaysOnTop);
  }

  if (window.electronAPI && window.electronAPI.getMikoSettings) {
    window.electronAPI.getMikoSettings().then(renderMikoPreference).catch(() => {});
  }
  if (btnMikoToggle && window.electronAPI && window.electronAPI.setMikoEnabled) {
    btnMikoToggle.addEventListener('click', async () => {
      btnMikoToggle.disabled = true;
      try {
        const settings = await window.electronAPI.setMikoEnabled(btnMikoToggle.getAttribute('aria-pressed') !== 'true');
        renderMikoPreference(settings);
      } finally {
        btnMikoToggle.disabled = false;
      }
    });
  }
  document.getElementById('settings-miko-enabled')?.addEventListener('change', async (event) => {
    const checkbox=event.currentTarget; checkbox.disabled=true;
    try { renderMikoPreference(await window.electronAPI.setMikoEnabled(checkbox.checked)); } catch { checkbox.checked=!checkbox.checked; }
    finally { checkbox.disabled=false; }
  });
  document.getElementById('settings-miko-top')?.addEventListener('change', async (event) => {
    const checkbox=event.currentTarget; checkbox.disabled=true;
    try { renderMikoPreference(await window.electronAPI.setMikoAlwaysOnTop(checkbox.checked)); } catch { checkbox.checked=!checkbox.checked; }
    finally { checkbox.disabled=false; }
  });

  const companionSettings = {
    character: document.getElementById('companion-gallery'), sizeScale: document.getElementById('companion-size'), launchAtLogin: document.getElementById('companion-launch-at-login'), keepRunningWhenMainClosed: document.getElementById('companion-keep-running'), showStatusBubbles: document.getElementById('companion-status-bubbles'), animationMode: document.getElementById('companion-animation-mode'),
    reducedMotion: document.getElementById('companion-reduced-motion'), voiceEnabled: document.getElementById('companion-voice'),
    soundsEnabled: document.getElementById('companion-sounds'),
    voiceName: document.getElementById('companion-voice-name'), voiceLanguage: document.getElementById('companion-voice-language'), voiceRate: document.getElementById('companion-voice-rate'), voiceVolume: document.getElementById('companion-voice-volume'),
    screenAwarenessEnabled: document.getElementById('companion-screen-enabled'), observationIntervalSeconds: document.getElementById('companion-observation-interval'),
    excludedApplications: document.getElementById('companion-excluded-apps'), proactiveEnabled: document.getElementById('companion-proactive'), doNotDisturb: document.getElementById('companion-dnd'),
    quietHoursStart: document.getElementById('companion-quiet-start'), quietHoursEnd: document.getElementById('companion-quiet-end'), suggestionCooldownMinutes: document.getElementById('companion-suggestion-cooldown'),
    autoLockEnabled: document.getElementById('companion-lock-enabled'), autoLockAfterSeconds: document.getElementById('companion-lock-after'), autoLockWarningSeconds: document.getElementById('companion-lock-warning')
  };
  const screenStatus = document.getElementById('screen-awareness-status');
  const activityStatus = document.getElementById('screen-activity-status');
  let latestCompanionPrefs = null;
  function renderCompanionSettings(settings) {
    if (!settings) return;
    latestCompanionPrefs = settings;
    document.getElementById('settings-miko-enabled').checked = Boolean(settings.enabled);
    document.getElementById('settings-miko-top').checked = Boolean(settings.alwaysOnTop);
    document.getElementById('companion-launch-at-login').checked = Boolean(settings.launchAtLogin);
    document.getElementById('companion-keep-running').checked = settings.keepRunningWhenMainClosed !== false;
    document.getElementById('companion-status-bubbles').checked = settings.showStatusBubbles !== false;
    document.getElementById('companion-animation-mode').value = settings.animationMode === 'subtle' ? 'subtle' : 'full';
    document.getElementById('companion-size').value = String(Math.round((settings.sizeScale || 1) * 100));
    document.getElementById('companion-reduced-motion').checked = Boolean(settings.reducedMotion);
    document.getElementById('companion-voice').checked = Boolean(settings.voiceEnabled);
    document.getElementById('companion-voice-language').value = settings.voiceLanguage || '';
    document.getElementById('companion-sounds').checked = Boolean(settings.soundsEnabled);
    document.getElementById('companion-voice-rate').value = String(settings.voiceRate || 1);
    document.getElementById('companion-voice-volume').value = String(settings.voiceVolume ?? 0.8);
    document.getElementById('companion-screen-enabled').checked = Boolean(settings.screenAwarenessEnabled);
    document.getElementById('companion-observation-interval').value = String(settings.observationIntervalSeconds || 60);
    document.getElementById('companion-excluded-apps').value = (settings.excludedApplications || []).join(', ');
    document.getElementById('companion-proactive').checked = Boolean(settings.proactiveEnabled);
    document.getElementById('companion-dnd').checked = Boolean(settings.doNotDisturb);
    document.getElementById('companion-quiet-start').value = settings.quietHoursStart || '22:00';
    document.getElementById('companion-quiet-end').value = settings.quietHoursEnd || '08:00';
    document.getElementById('companion-suggestion-cooldown').value = String(settings.suggestionCooldownMinutes || 30);
    document.getElementById('companion-lock-enabled').checked = Boolean(settings.autoLockEnabled);
    document.getElementById('companion-lock-after').value = String(settings.autoLockAfterSeconds || 600);
    document.getElementById('companion-lock-warning').value = String(settings.autoLockWarningSeconds || 30);
    document.querySelectorAll('[data-pet]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.pet === (settings.character || 'miko'))));
    screenStatus.textContent = settings.screenAwarenessEnabled ? settings.screenObservationPaused ? 'Screen awareness is paused.' : 'Screen awareness is on; OCR remains local.' : 'Screen awareness is off.';
    document.getElementById('companion-screen-pause').textContent = settings.screenObservationPaused ? 'Resume observation' : 'Pause observation';
    renderMikoPreference(settings);
  }
  async function saveCompanion(patch) {
    try { renderCompanionSettings(await window.electronAPI.setCompanionSettings(patch)); }
    catch { if (latestCompanionPrefs) renderCompanionSettings(latestCompanionPrefs); }
  }
  if (window.speechSynthesis) {
    const voicePicker = document.getElementById('companion-voice-name');
    const fillVoicePicker = () => {
      const selected = latestCompanionPrefs?.voiceName || voicePicker.value;
      voicePicker.replaceChildren(new Option('System default', ''));
      window.speechSynthesis.getVoices().forEach((voice) => voicePicker.add(new Option(`${voice.name} (${voice.lang})`, voice.name)));
      voicePicker.value = selected;
    };
    fillVoicePicker(); window.speechSynthesis.addEventListener?.('voiceschanged', fillVoicePicker);
  }
  document.querySelectorAll('[data-pet]').forEach((button) => button.addEventListener('click', () => saveCompanion({ character: button.dataset.pet })));
  document.getElementById('companion-size').addEventListener('change', (event) => saveCompanion({ sizeScale: Number(event.currentTarget.value) / 100 }));
  document.getElementById('companion-launch-at-login').addEventListener('change', (event) => saveCompanion({ launchAtLogin: event.currentTarget.checked }));
  document.getElementById('companion-keep-running').addEventListener('change', (event) => saveCompanion({ keepRunningWhenMainClosed: event.currentTarget.checked }));
  document.getElementById('companion-status-bubbles').addEventListener('change', (event) => saveCompanion({ showStatusBubbles: event.currentTarget.checked }));
  document.getElementById('companion-animation-mode').addEventListener('change', (event) => saveCompanion({ animationMode: event.currentTarget.value }));
  document.getElementById('companion-reduced-motion').addEventListener('change', (event) => saveCompanion({ reducedMotion: event.currentTarget.checked }));
  document.getElementById('companion-voice').addEventListener('change', (event) => saveCompanion({ voiceEnabled: event.currentTarget.checked }));
  document.getElementById('companion-sounds').addEventListener('change', (event) => saveCompanion({ soundsEnabled: event.currentTarget.checked }));
  document.getElementById('companion-voice-name').addEventListener('change', (event) => saveCompanion({ voiceName: event.currentTarget.value }));
  document.getElementById('companion-voice-language').addEventListener('change', (event) => saveCompanion({ voiceLanguage: event.currentTarget.value.trim() }));
  document.getElementById('companion-voice-rate').addEventListener('change', (event) => saveCompanion({ voiceRate: Number(event.currentTarget.value) }));
  document.getElementById('companion-voice-volume').addEventListener('change', (event) => saveCompanion({ voiceVolume: Number(event.currentTarget.value) }));
  document.getElementById('companion-voice-test').addEventListener('click', () => {
    if (!latestCompanionPrefs?.voiceEnabled || !window.speechSynthesis) { screenStatus.textContent = 'Enable voice interactions first.'; return; }
    const utterance = new SpeechSynthesisUtterance('Hello. I’m here when you need me.');
    utterance.rate = Number(companionSettings.voiceRate.value) || 1; utterance.volume = Number.isFinite(Number(companionSettings.voiceVolume.value)) ? Number(companionSettings.voiceVolume.value) : 0.8;
    const voice = window.speechSynthesis.getVoices().find((item) => item.name === companionSettings.voiceName.value); if (voice) utterance.voice = voice;
    window.speechSynthesis.cancel(); window.speechSynthesis.speak(utterance);
  });
  document.getElementById('companion-screen-enabled').addEventListener('change', (event) => {
    const checkbox = event.currentTarget;
    if (checkbox.checked && !window.confirm('Enable local screen awareness? MINDORA will periodically capture the foreground desktop locally and run OCR. Screenshots and recognized text are not saved or sent to an AI provider.')) { checkbox.checked = false; return; }
    saveCompanion({ screenAwarenessEnabled: checkbox.checked, screenObservationPaused: false });
  });
  document.getElementById('companion-observation-interval').addEventListener('change', (event) => saveCompanion({ observationIntervalSeconds: Number(event.currentTarget.value) }));
  document.getElementById('companion-excluded-apps').addEventListener('change', (event) => saveCompanion({ excludedApplications: event.currentTarget.value.split(',').map((value) => value.trim()).filter(Boolean) }));
  document.getElementById('companion-proactive').addEventListener('change', (event) => saveCompanion({ proactiveEnabled: event.currentTarget.checked }));
  document.getElementById('companion-dnd').addEventListener('change', (event) => saveCompanion({ doNotDisturb: event.currentTarget.checked }));
  document.getElementById('companion-quiet-start').addEventListener('change', (event) => saveCompanion({ quietHoursStart: event.currentTarget.value }));
  document.getElementById('companion-quiet-end').addEventListener('change', (event) => saveCompanion({ quietHoursEnd: event.currentTarget.value }));
  document.getElementById('companion-suggestion-cooldown').addEventListener('change', (event) => saveCompanion({ suggestionCooldownMinutes: Number(event.currentTarget.value) }));
  document.getElementById('companion-lock-enabled').addEventListener('change', (event) => {
    if (event.currentTarget.checked && !window.confirm('Enable optional Windows device lock after inactivity? MINDORA requires at least five minutes idle and will show a cancel countdown before locking.')) { event.currentTarget.checked = false; return; }
    saveCompanion({ autoLockEnabled: event.currentTarget.checked });
  });
  document.getElementById('companion-lock-after').addEventListener('change', (event) => saveCompanion({ autoLockAfterSeconds: Number(event.currentTarget.value) }));
  document.getElementById('companion-lock-warning').addEventListener('change', (event) => saveCompanion({ autoLockWarningSeconds: Number(event.currentTarget.value) }));
  document.getElementById('companion-screen-pause').addEventListener('click', () => {
    if (!latestCompanionPrefs?.screenAwarenessEnabled) { screenStatus.textContent = 'Enable screen awareness before pausing or resuming it.'; return; }
    saveCompanion({ screenObservationPaused: !latestCompanionPrefs.screenObservationPaused });
  });
  document.getElementById('companion-screen-stop').addEventListener('click', () => saveCompanion({ screenAwarenessEnabled: false, screenObservationPaused: false }));

  const btnResetPos = document.getElementById('btn-reset-pet-position');
  if (btnResetPos && window.electronAPI?.resetMikoPosition) {
    btnResetPos.addEventListener('click', async () => {
      btnResetPos.disabled = true;
      try {
        const settings = await window.electronAPI.resetMikoPosition();
        if (settings) renderCompanionSettings(settings);
      } finally {
        btnResetPos.disabled = false;
      }
    });
  }

  const btnTogglePause = document.getElementById('btn-toggle-companion-pause');
  if (btnTogglePause) {
    btnTogglePause.addEventListener('click', async () => {
      const isPaused = latestCompanionPrefs?.screenObservationPaused || false;
      await saveCompanion({ screenObservationPaused: !isPaused });
      btnTogglePause.textContent = isPaused ? 'Pause companion' : 'Resume companion';
    });
  }

  window.electronAPI.getMikoSettings().then(renderCompanionSettings).catch(() => {});
  window.electronAPI.onCompanionActivity((activity) => {
    if (activity.status === 'observed') activityStatus.textContent = `${activity.category} · ${Math.round(activity.confidence * 100)}% confidence · ${activity.evidence.join(' ')}`;
    else activityStatus.textContent = activity.evidence?.join(' ') || 'No observation available.';
  });
  window.electronAPI.onOpenSettings(() => showPage('settings'));
  window.electronAPI.onOpenTasks(() => showPage('tasks'));
  window.electronAPI.onOpenHome?.(() => showPage('home'));
  window.electronAPI.onPrefillTask((text) => { showPage('home'); goalInput.value = text; goalInput.focus(); });

  const DEFAULT_START_HTML = `
    <span>Start with MINDORA</span>
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3.75 9h10.5M10.5 5.25L14.25 9l-3.75 3.75" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  let currentKeyStatus = {
    configured: false,
    source: 'none',
    maskedKey: null
  };

  const agentStart = document.getElementById('btn-agent-start');
  const agentStatus = document.getElementById('agent-task-status');
  const agentControls = document.getElementById('agent-task-controls');
  const agentApproval = document.getElementById('agent-approval');
  const agentApprovalLabel = document.getElementById('agent-approval-label');
  const agentResult = document.getElementById('agent-task-result');
  const agentStepList = document.getElementById('agent-step-list');
  const agentHistoryList = document.getElementById('agent-task-history-list');
  const homeAgentStart = document.getElementById('btn-home-agent-start');
  const homeAgentStatus = document.getElementById('home-agent-status');
  const homeRecentTasks = document.getElementById('home-recent-tasks');
  let activeAgentTaskId = null;
  let pendingApprovalId = null;

  async function loadAgentHistory() {
    if (!agentHistoryList || !window.electronAPI?.agent?.history) return;
    try {
      const history = await window.electronAPI.agent.history();
      agentHistoryList.replaceChildren();
      if (!history.length) {
        const item = document.createElement('li'); item.textContent = 'No agent history yet.'; agentHistoryList.append(item); return;
      }
      history.slice(0, 5).forEach((task) => {
        const item = document.createElement('li');
        const summary = task.plan?.summary || task.state;
        item.textContent = `${summary} · ${task.state}${task.response ? `\n${task.response.slice(0, 180)}` : task.error ? `\n${task.error}` : ''}`;
        agentHistoryList.append(item);
      });
      if (homeRecentTasks) {
        homeRecentTasks.replaceChildren();
        if (!history.length) { const item=document.createElement('li');item.textContent='No recent tasks.';homeRecentTasks.append(item); }
        history.slice(0,3).forEach((task)=>{const item=document.createElement('li');item.textContent=`${task.plan?.summary||'MINDORA task'} · ${task.state}`;homeRecentTasks.append(item);});
      }
    } catch { /* History is optional until an agent task has been configured. */ }
  }

  function renderAgentEvent(event) {
    if (!event || !event.task) return;
    const task = event.task;
    activeAgentTaskId = task.id;
    const done = task.steps.filter((step) => step.state === 'completed').length;
    const total = task.steps.length;
    const statusLine = event.message || task.error || task.plan?.summary || 'Working on your task.';
    if (agentStatus) agentStatus.textContent = `${task.state.replaceAll('_', ' ')}${total ? ` · ${done}/${total} steps` : ''}\n${statusLine}`;
    if (homeAgentStatus) homeAgentStatus.textContent = `${task.state.replaceAll('_',' ')}${total?` · ${done}/${total} steps`:''} · ${statusLine}`;
    const terminal = ['completed', 'failed', 'cancelled'].includes(task.state);
    if (agentStart) agentStart.disabled = !terminal;
    if (homeAgentStart) homeAgentStart.disabled = !terminal;
    if (agentControls) agentControls.hidden = terminal || task.state === 'created';
    const pause = document.getElementById('btn-agent-pause');
    const resume = document.getElementById('btn-agent-resume');
    if (pause) pause.hidden = task.state === 'paused' || terminal;
    if (resume) resume.hidden = task.state !== 'paused';
    if (agentApproval && event.type === 'approval_required' && event.approvalId) {
      pendingApprovalId = event.approvalId;
      agentApproval.hidden = false;
      if (agentApprovalLabel) agentApprovalLabel.textContent = event.message || 'Approve this consequential action?';
    } else if (agentApproval && event.type === 'approval_resolved') {
      pendingApprovalId = null;
      agentApproval.hidden = true;
    }
    if (agentResult) {
      const finalText = task.response || (task.state === 'failed' ? `Task failed: ${task.error || 'Unknown error.'}` : task.state === 'cancelled' ? 'Task cancelled.' : '');
      agentResult.hidden = !finalText;
      agentResult.textContent = finalText;
    }
    if (agentStepList) {
      agentStepList.replaceChildren();
      (task.steps || []).forEach((step) => {
        const item = document.createElement('li'); item.dataset.state = step.state;
        item.textContent = `${step.title} · ${step.state.replaceAll('_', ' ')}${step.attempts > 1 ? ` · attempt ${step.attempts}` : ''}`;
        agentStepList.append(item);
      });
    }
    if (terminal) {
      activeAgentTaskId = null;
      pendingApprovalId = null;
      if (agentApproval) agentApproval.hidden = true;
      loadAgentHistory();
    }
  }

  function agentAction(action, approvalId) {
    if (!window.electronAPI?.agent || !activeAgentTaskId) return;
    window.electronAPI.agent.action(activeAgentTaskId, action, approvalId).catch((error) => {
      if (agentStatus) agentStatus.textContent = error?.message || 'Could not update the agent task.';
    });
  }

  if (window.electronAPI?.agent?.onEvent) window.electronAPI.agent.onEvent(renderAgentEvent);
  refreshIntegrationStatus();
  loadAgentHistory();
  async function startAgentTask(trigger, statusElement) {
    if (!currentKeyStatus.configured) {
      await refreshKeyStatus(true);
      if (!currentKeyStatus.configured) {
        openKeyModal('A Gemini API key is required to plan agent tasks. Configure TinyFish in the MINDORA process environment for web search and research.');
        return;
      }
    }
    trigger.disabled = true;
    if (statusElement) statusElement.textContent = 'Sending task to Gemini planner…';
    try {
      const record = await window.electronAPI.agent.startTask((goalInput && goalInput.value.trim()) || '');
      activeAgentTaskId = record.id;
      renderAgentEvent({ task: record, message: 'Task received. Planning now.' });
    } catch (error) {
      trigger.disabled = false;
      if (statusElement) statusElement.textContent = error?.message || 'Could not start the agent task.';
    }
  }
  if (agentStart) agentStart.addEventListener('click', () => void startAgentTask(agentStart,agentStatus));
  if (homeAgentStart) homeAgentStart.addEventListener('click', () => void startAgentTask(homeAgentStart,homeAgentStatus));
  document.getElementById('btn-agent-pause')?.addEventListener('click', () => agentAction('pause'));
  document.getElementById('btn-agent-resume')?.addEventListener('click', () => agentAction('resume'));
  document.getElementById('btn-agent-cancel')?.addEventListener('click', () => agentAction('cancel'));
  document.getElementById('btn-agent-approve')?.addEventListener('click', () => {
    if (pendingApprovalId) agentAction('approve', pendingApprovalId);
  });
  document.getElementById('btn-agent-reject')?.addEventListener('click', () => {
    if (pendingApprovalId) agentAction('reject', pendingApprovalId);
  });

  function resetStartState() {
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = DEFAULT_START_HTML;
    }
  }

  // Preset button
  if (btnPreset && goalInput) {
    btnPreset.addEventListener('click', () => {
      goalInput.value = DEFAULT_GOAL;
      goalInput.focus();
    });
  }

  // Key Modal Feedback Display
  function showKeyFeedback(type, message) {
    if (!keyFeedback) return;
    keyFeedback.className = `key-feedback-box ${type}`;
    keyFeedback.textContent = message;
    keyFeedback.style.display = 'block';
  }

  function clearKeyFeedback() {
    if (!keyFeedback) return;
    keyFeedback.style.display = 'none';
    keyFeedback.textContent = '';
    keyFeedback.className = 'key-feedback-box';
  }

  // Open / Close Key Setup Modal
  function openKeyModal(initialFeedback = null) {
    if (!keyModalBackdrop) return;
    keyModalBackdrop.style.display = 'flex';
    keyModalBackdrop.setAttribute('aria-hidden', 'false');
    clearKeyFeedback();
    if (initialFeedback) {
      showKeyFeedback('info', initialFeedback);
    }
    if (inputApiKey) {
      inputApiKey.value = '';
      inputApiKey.focus();
    }
  }

  function closeKeyModal() {
    if (!keyModalBackdrop) return;
    keyModalBackdrop.style.display = 'none';
    keyModalBackdrop.setAttribute('aria-hidden', 'true');
    clearKeyFeedback();
    if (inputApiKey) {
      inputApiKey.value = '';
    }
  }

  if (btnCloseKeyModal) {
    btnCloseKeyModal.addEventListener('click', closeKeyModal);
  }

  if (keyModalBackdrop) {
    keyModalBackdrop.addEventListener('click', (e) => {
      if (e.target === keyModalBackdrop) {
        closeKeyModal();
      }
    });
  }

  if (btnKeyStatus) {
    btnKeyStatus.addEventListener('click', () => {
      openKeyModal();
    });
  }

  // Toggle Password Masking in Input
  if (btnToggleKeyVisibility && inputApiKey) {
    btnToggleKeyVisibility.addEventListener('click', () => {
      const isPassword = inputApiKey.type === 'password';
      inputApiKey.type = isPassword ? 'text' : 'password';
      btnToggleKeyVisibility.textContent = isPassword ? '🔒' : '👁️';
    });
  }

  // External Link to Google AI Studio
  if (linkGetKey) {
    linkGetKey.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
        window.electronAPI.openExternal('https://aistudio.google.com/app/apikey');
      }
    });
  }

  // Refresh & Apply Key Status UI
  async function refreshKeyStatus(suppressAutoModal = false) {
    if (!window.electronAPI || typeof window.electronAPI.getKeyStatus !== 'function') return;

    try {
      const status = await window.electronAPI.getKeyStatus();
      currentKeyStatus = status || { configured: false, source: 'none', maskedKey: null };

      if (currentKeyStatus.configured) {
        if (keyChipDot) keyChipDot.classList.add('configured');
        if (keyChipLabel) {
          keyChipLabel.textContent = currentKeyStatus.maskedKey ? `Key: ${currentKeyStatus.maskedKey.slice(-8)}` : 'Key Active';
        }
        if (keyCurrentStatusBanner) {
          keyCurrentStatusBanner.style.display = 'flex';
        }
        if (keyStatusBannerText) {
          const srcLabel = currentKeyStatus.source === 'env' ? ' (from .env)' : '';
          keyStatusBannerText.textContent = `Configured: ${currentKeyStatus.maskedKey || 'Active'}${srcLabel}`;
        }
      } else {
        if (keyChipDot) keyChipDot.classList.remove('configured');
        if (keyChipLabel) keyChipLabel.textContent = 'Setup API Key';
        if (keyCurrentStatusBanner) keyCurrentStatusBanner.style.display = 'none';

        // First run: automatically show setup modal if key is missing and not suppressed
        if (!suppressAutoModal) {
          openKeyModal('Welcome! To begin using MINDORA, please enter your personal Google Gemini API key.');
        }
      }
    } catch (err) {
      console.warn('[Launch] Error refreshing key status:', err);
    }
  }

  // Test Key Action
  if (btnTestKey) {
    btnTestKey.addEventListener('click', async () => {
      const candidate = inputApiKey ? inputApiKey.value.trim() : '';
      if (!candidate && !currentKeyStatus.configured) {
        showKeyFeedback('error', 'Please enter a Gemini API key to test.');
        return;
      }

      btnTestKey.disabled = true;
      btnTestKey.textContent = 'Testing…';
      showKeyFeedback('info', 'Connecting to Google Gemini API…');

      try {
        const result = await window.electronAPI.testApiKey(candidate);
        if (result && result.success) {
          showKeyFeedback('success', '✓ Connection successful! Your Gemini API key is valid.');
        } else {
          showKeyFeedback('error', result?.error || 'Connection failed. Please verify your API key.');
        }
      } catch (err) {
        showKeyFeedback('error', 'Network test failed. Please check your internet connection.');
      } finally {
        btnTestKey.disabled = false;
        btnTestKey.textContent = 'Test connection';
      }
    });
  }

  // Save Key Action
  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', async () => {
      const candidate = inputApiKey ? inputApiKey.value.trim() : '';
      if (!candidate) {
        showKeyFeedback('error', 'Please paste your Gemini API key before saving.');
        return;
      }

      btnSaveKey.disabled = true;
      btnSaveKey.textContent = 'Saving…';

      try {
        const result = await window.electronAPI.saveApiKey(candidate);
        if (result && result.success) {
          showKeyFeedback('success', '✓ Key encrypted and saved securely!');
          if (inputApiKey) {
            inputApiKey.value = '';
          }
          await refreshKeyStatus(true);
          setTimeout(() => {
            closeKeyModal();
          }, 1200);
        } else {
          showKeyFeedback('error', result?.error || 'Failed to save key.');
        }
      } catch (err) {
        showKeyFeedback('error', 'Error saving key. Please try again.');
      } finally {
        btnSaveKey.disabled = false;
        btnSaveKey.textContent = 'Save key';
      }
    });
  }

  // Remove Key Action
  if (btnRemoveKey) {
    btnRemoveKey.addEventListener('click', async () => {
      try {
        await window.electronAPI.removeApiKey();
        showKeyFeedback('info', 'API key removed. Enter a new key to continue.');
        await refreshKeyStatus(true);
      } catch (err) {
        showKeyFeedback('error', 'Error removing key.');
      }
    });
  }

  // Start Coaching Button
  if (btnStart) {
    btnStart.addEventListener('click', async () => {
      // Gate check: verify Gemini API key is configured before launching
      if (!currentKeyStatus.configured) {
        await refreshKeyStatus(true);
        if (!currentKeyStatus.configured) {
          openKeyModal('A Google Gemini API key is required to start coaching with MINDORA.');
          return;
        }
      }

      const goal = (goalInput && goalInput.value.trim()) || DEFAULT_GOAL;
      if (!goal) {
        goalInput?.focus();
        showToast('Describe the task you want help with, or choose the chart preset.');
        return;
      }
      btnStart.disabled = true;
      btnStart.innerHTML = `<span>Starting with MINDORA…</span>`;

      // Safety fallback to restore button if window stays visible
      setTimeout(() => {
        if (!document.hidden && btnStart.disabled) {
          resetStartState();
        }
      }, 4000);

      if (window.electronAPI && typeof window.electronAPI.startCoaching === 'function') {
        window.electronAPI.startCoaching({ goal, targetHandle: selectedTargetHandle });
      } else {
        console.log('[Launch] electronAPI.startCoaching triggered with goal:', goal);
      }
    });
  }

  // Refresh Target Window
  function updateTargetInfo(info) {
    if (!info) return;
    const p = (info.process || '').toLowerCase();
    const t = (info.title || '').toLowerCase();
    const isSelf = ['electron', 'unstuck', 'mindora'].includes(p) && (t === 'mindora' || t.startsWith('mindora ') || t === 'unstuck' || t.startsWith('unstuck -') || t.startsWith('unstuck —'));
    const isDesktop = info.hWnd === 0 || (p === 'explorer' && (!t || t === 'program manager'));

    if (info.isCalc) {
      targetTitle.textContent = info.title || info.process || 'LibreOffice Calc';
      targetDot.style.backgroundColor = 'var(--color-success)';
      targetDot.title = 'LibreOffice Calc identified from the foreground window';
    } else if (!isSelf && !isDesktop && (info.title || info.process)) {
      targetTitle.textContent = `${info.title || info.process} (${info.process || 'App'})`;
      targetDot.style.backgroundColor = 'var(--color-success)';
      targetDot.title = 'Active window selected from Windows foreground/Z order';
    } else {
      targetTitle.textContent = 'Focus your application to check';
      targetDot.style.backgroundColor = 'var(--color-warning)';
      targetDot.title = 'No active application window detected. Bring your app to foreground.';
    }
  }

  function closeTargetPicker() {
    if (!targetPickerList || !appSelector) return;
    targetPickerList.hidden = true;
    appSelector.setAttribute('aria-expanded', 'false');
  }

  function renderTargetApplications() {
    if (!targetPickerList) return;
    targetPickerList.replaceChildren();
    if (!targetApplications.length) {
      const empty = document.createElement('div');
      empty.className = 'target-picker-empty';
      empty.textContent = 'No open applications found. Open an app, then refresh.';
      targetPickerList.append(empty);
      return;
    }
    targetApplications.forEach((application) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'target-picker-option';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', String(application.hWnd === selectedTargetHandle));
      option.dataset.windowHandle = String(application.hWnd);
      const title = document.createElement('span');
      title.textContent = application.title || application.process || 'Open application';
      const process = document.createElement('small');
      process.className = 'target-picker-process';
      process.textContent = application.process || '';
      option.append(title, process);
      targetPickerList.append(option);
    });
  }

  async function fetchTargetApplications(openAfter = false) {
    if (!window.electronAPI || typeof window.electronAPI.getTargetApplications !== 'function') return;
    if (targetPickerList && openAfter) {
      targetPickerList.hidden = false;
      targetPickerList.replaceChildren();
      const loading = document.createElement('div');
      loading.className = 'target-picker-empty';
      loading.textContent = 'Finding open applications…';
      targetPickerList.append(loading);
      appSelector?.setAttribute('aria-expanded', 'true');
    }
    try {
      const applications = await window.electronAPI.getTargetApplications();
      targetApplications = Array.isArray(applications) ? applications : [];
      let selected = targetApplications.find((application) => application.hWnd === selectedTargetHandle);
      if (!selected) {
        const foreground = await window.electronAPI.getTargetInfo();
        selected = targetApplications.find((application) => application.hWnd === foreground?.hWnd) || targetApplications[0];
        selectedTargetHandle = selected?.hWnd ?? null;
      }
      if (selected) {
        updateTargetInfo(selected);
        targetTitle.textContent = `${selected.title || selected.process} (${selected.process || 'App'})`;
      } else {
        selectedTargetHandle = null;
        targetTitle.textContent = 'Choose an application';
        targetDot.style.backgroundColor = 'var(--color-warning)';
      }
      renderTargetApplications();
      if (openAfter && targetPickerList) {
        targetPickerList.hidden = false;
        appSelector?.setAttribute('aria-expanded', 'true');
      }
    } catch (err) {
      console.warn('[Launch] Application list error:', err);
      targetApplications = [];
      renderTargetApplications();
    }
  }

  if (btnRefreshTarget) {
    btnRefreshTarget.addEventListener('click', (e) => {
      e.stopPropagation();
      void fetchTargetApplications(true);
    });
  }

  if (appSelector) {
    appSelector.addEventListener('click', (event) => {
      if (event.target.closest('#btn-refresh-target')) return;
      if (targetPickerList?.hidden) void fetchTargetApplications(true);
      else closeTargetPicker();
    });
    appSelector.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (targetPickerList?.hidden) void fetchTargetApplications(true);
        else closeTargetPicker();
      }
    });
  }

  targetPickerList?.addEventListener('click', (event) => {
    const option = event.target.closest('.target-picker-option');
    if (!option) return;
    const handle = Number(option.dataset.windowHandle);
    const selected = targetApplications.find((application) => application.hWnd === handle);
    if (!selected) return;
    selectedTargetHandle = selected.hWnd;
    updateTargetInfo(selected);
    targetTitle.textContent = `${selected.title || selected.process} (${selected.process || 'App'})`;
    renderTargetApplications();
    closeTargetPicker();
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#app-selector') && !event.target.closest('#target-picker-list')) closeTargetPicker();
  });

  window.electronAPI?.onTargetSelectionError?.((message) => {
    showToast(message);
    void fetchTargetApplications(true);
  });

  // Initial target & key status fetch
  void fetchTargetApplications();
  refreshKeyStatus();

  // Listen for reset events from Main Process when session stops or finishes
  if (window.electronAPI && typeof window.electronAPI.onLaunchReset === 'function') {
    window.electronAPI.onLaunchReset(() => {
      resetStartState();
      void fetchTargetApplications();
      refreshKeyStatus(true);
    });
  }

  // Window visibility & focus listeners to ensure start button is always responsive
  window.addEventListener('focus', () => {
    resetStartState();
    void fetchTargetApplications();
    refreshKeyStatus(true);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resetStartState();
      void fetchTargetApplications();
      refreshKeyStatus(true);
    }
  });

  // Window titlebar controls
  if (btnMin) {
    btnMin.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.minimizeWindow) {
        window.electronAPI.minimizeWindow();
      }
    });
  }

  if (btnClose) {
    btnClose.addEventListener('click', () => {
      if (window.electronAPI && window.electronAPI.closeWindow) {
        window.electronAPI.closeWindow();
      }
    });
  }
});
