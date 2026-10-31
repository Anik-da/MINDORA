const { contextBridge, ipcRenderer } = require('electron');

// Signal to main process that preload has executed
try {
  ipcRenderer.send('renderer-preload-ready');
} catch (e) {
  // Preload startup guard
}

/**
 * Narrow isolated IPC bridge for transparent overlay.
 * Keeps context isolation and sandboxing strictly enabled.
 * Zero Node APIs, filesystem access, network, or secrets exposed to renderer.
 */
contextBridge.exposeInMainWorld('mindoraOverlay', {
  onShowOutline: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('show-outline', (_event, data) => callback(data));
    }
  },
  onClearOutline: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('clear-outline', () => callback());
    }
  },
  sendAck: (metrics) => {
    ipcRenderer.send('outline-applied-ack', metrics);
  },
  sendReady: () => {
    ipcRenderer.send('renderer-dom-ready');
  },
  reportError: (err) => {
    ipcRenderer.send('renderer-error', err);
  }
});

/**
 * Narrow isolated IPC bridge for Unstuck Launch and Coach Windows.
 */
contextBridge.exposeInMainWorld('electronAPI', {
  startCoaching: (goal, tutorialUrl) => {
    if (goal && typeof goal === 'object') {
      ipcRenderer.send('start-coaching', goal);
    } else {
      ipcRenderer.send('start-coaching', {
        goal: String(goal || ''),
        tutorialUrl: tutorialUrl ? String(tutorialUrl) : undefined
      });
    }
  },
  getTargetInfo: async () => {
    return ipcRenderer.invoke('get-target-info');
  },
  getTargetApplications: async () => ipcRenderer.invoke('get-target-applications'),
  onTargetSelectionError: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, message) => callback(String(message || 'The selected application could not be found.'));
    ipcRenderer.on('target-selection-error', listener);
    return () => ipcRenderer.removeListener('target-selection-error', listener);
  },
  getMikoSettings: async () => ipcRenderer.invoke('get-miko-settings'),
  setMikoEnabled: async (enabled) => ipcRenderer.invoke('set-miko-enabled', Boolean(enabled)),
  setMikoAlwaysOnTop: async (enabled) => ipcRenderer.invoke('set-miko-always-on-top', Boolean(enabled)),
  setCompanionSettings: async (patch) => ipcRenderer.invoke('set-companion-settings', patch),
  resetMikoPosition: async () => ipcRenderer.invoke('reset-miko-position'),
  onCompanionActivity: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('companion-activity-update', listener);
    return () => ipcRenderer.removeListener('companion-activity-update', listener);
  },
  onOpenHome: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback(); ipcRenderer.on('open-home-page', listener);
    return () => ipcRenderer.removeListener('open-home-page', listener);
  },
  onOpenSettings: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback(); ipcRenderer.on('open-settings-page', listener);
    return () => ipcRenderer.removeListener('open-settings-page', listener);
  },
  onOpenTasks: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback(); ipcRenderer.on('open-task-page', listener);
    return () => ipcRenderer.removeListener('open-task-page', listener);
  },
  onPrefillTask: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, text) => callback(String(text || '').slice(0, 1000));
    ipcRenderer.on('prefill-task-request', listener);
    return () => ipcRenderer.removeListener('prefill-task-request', listener);
  },
  agent: {
    startTask: (task) => ipcRenderer.invoke('agent:task:start', String(task || '')),
    getTask: (taskId) => ipcRenderer.invoke('agent:task:get', String(taskId)),
    history: () => ipcRenderer.invoke('agent:task:history'),
    action: (taskId, action, approvalId) => ipcRenderer.invoke('agent:task:action', String(taskId), String(action), approvalId ? String(approvalId) : undefined),
    onEvent: (callback) => {
      if (typeof callback !== 'function') return () => {};
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('agent-task-event', listener);
      return () => ipcRenderer.removeListener('agent-task-event', listener);
    }
  },
  tinyfish: {
    search: (request) => ipcRenderer.invoke('tinyfish:search', request),
    testSearchConnection: () => ipcRenderer.invoke('tinyfish:search:connection'),
    fetch: (request) => ipcRenderer.invoke('tinyfish:fetch', request),
    startResearch: (request) => ipcRenderer.invoke('tinyfish:research:start', request),
    getResearch: (id) => ipcRenderer.invoke('tinyfish:research:get', String(id)),
    listResearch: (params = {}) => ipcRenderer.invoke('tinyfish:research:list', params),
    researchHistory: () => ipcRenderer.invoke('tinyfish:research:history'),
    cancelResearch: (id) => ipcRenderer.invoke('tinyfish:research:cancel', String(id)),
    startAutomation: (request) => {
      const safeRequest = { ...request };
      // Credentials for custom proxies must be configured by trusted code, never sent by renderer IPC.
      if (safeRequest.proxyConfig) {
        const { url, username, password, ...safeProxyConfig } = safeRequest.proxyConfig;
        void url; void username; void password;
        safeRequest.proxyConfig = safeProxyConfig;
      }
      return ipcRenderer.invoke('tinyfish:automation:start', safeRequest);
    },
    listRuns: (params = {}) => ipcRenderer.invoke('tinyfish:runs:list', params),
    getRun: (id) => ipcRenderer.invoke('tinyfish:runs:get', String(id)),
    cancelRun: (id) => ipcRenderer.invoke('tinyfish:runs:cancel', String(id)),
    getRunStepHtml: (runId, stepId) => ipcRenderer.invoke('tinyfish:runs:html', String(runId), String(stepId)),
    getRunStepScreenshot: (runId, stepId) => ipcRenderer.invoke('tinyfish:runs:screenshot', String(runId), String(stepId)),
    listMonitors: () => ipcRenderer.invoke('tinyfish:monitors:list'),
    getMonitor: (id) => ipcRenderer.invoke('tinyfish:monitors:get', String(id)),
    createMonitor: (request) => ipcRenderer.invoke('tinyfish:monitors:create', request),
    updateMonitor: (id, patch) => ipcRenderer.invoke('tinyfish:monitors:update', String(id), patch),
    deleteMonitor: (id) => ipcRenderer.invoke('tinyfish:monitors:delete', String(id)),
    runMonitorNow: (id) => ipcRenderer.invoke('tinyfish:monitors:run', String(id)),
    listProfiles: () => ipcRenderer.invoke('tinyfish:profiles:list'),
    getProfile: (id) => ipcRenderer.invoke('tinyfish:profiles:get', String(id)),
    createProfile: (request) => ipcRenderer.invoke('tinyfish:profiles:create', request),
    updateProfile: (id, patch) => ipcRenderer.invoke('tinyfish:profiles:update', String(id), patch),
    deleteProfile: (id) => ipcRenderer.invoke('tinyfish:profiles:delete', String(id)),
    getWallet: () => ipcRenderer.invoke('tinyfish:wallet:get'),
    searchUsage: (params = {}) => ipcRenderer.invoke('tinyfish:usage:search', params),
    fetchUsage: (params = {}) => ipcRenderer.invoke('tinyfish:usage:fetch', params),
    browserUsage: (params = {}) => ipcRenderer.invoke('tinyfish:usage:browser', params)
  },
  triggerCheck: () => {
    ipcRenderer.send('trigger-check');
  },
  pauseSession: () => {
    ipcRenderer.send('pause-session');
  },
  resumeSession: () => {
    ipcRenderer.send('resume-session');
  },
  stopSession: () => {
    ipcRenderer.send('stop-session');
  },
  resetSession: () => {
    ipcRenderer.send('reset-session');
  },
  minimizeWindow: () => {
    ipcRenderer.send('window-minimize');
  },
  closeWindow: () => {
    ipcRenderer.send('window-close');
  },
  onCoachUpdate: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('coach-state-update', (_event, data) => callback(data));
    }
  },
  onLaunchReset: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('launch-state-reset', (_event, data) => callback(data));
    }
  },
  getKeyStatus: async () => {
    return ipcRenderer.invoke('get-key-status');
  },
  testApiKey: async (candidateKey) => {
    return ipcRenderer.invoke('test-api-key', candidateKey);
  },
  saveApiKey: async (candidateKey) => {
    return ipcRenderer.invoke('save-api-key', candidateKey);
  },
  removeApiKey: async () => {
    return ipcRenderer.invoke('remove-api-key');
  },
  openExternal: (url) => {
    ipcRenderer.invoke('open-external-url', url);
  }
});
