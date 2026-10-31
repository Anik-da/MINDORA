const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mikoPet', {
  ready: () => ipcRenderer.send('miko:ready'),
  setInteractive: (interactive) => ipcRenderer.send('miko:set-interactive', Boolean(interactive)),
  openMain: () => ipcRenderer.send('miko:open-main'),
  loadCharacterSvg: (character) => ipcRenderer.invoke('miko:load-character-svg', String(character || '').slice(0, 16)),
  openExpandedTaskView: () => ipcRenderer.send('miko:open-expanded-task-view'),
  showContextMenu: () => ipcRenderer.send('miko:context-menu'),
  dragTo: (x, y) => {
    if (Number.isFinite(x) && Number.isFinite(y)) ipcRenderer.send('miko:drag-to', Math.round(x), Math.round(y));
  },
  submitChat: (text) => ipcRenderer.invoke('miko:chat', String(text || '').slice(0, 4000)),
  onOutsideChatClick: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback(); ipcRenderer.on('miko:chat:outside-click', listener);
    return () => ipcRenderer.removeListener('miko:chat:outside-click', listener);
  },
  onVoiceShutdown: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback(); ipcRenderer.on('miko:voice:shutdown', listener);
    return () => ipcRenderer.removeListener('miko:voice:shutdown', listener);
  },
  onCommand: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, command) => { if (command === 'chat' || command === 'voice') callback(command); };
    ipcRenderer.on('miko:command', listener);
    return () => ipcRenderer.removeListener('miko:command', listener);
  },
  acceptSuggestion: (suggestion) => ipcRenderer.send('miko:suggestion:accept', {
    id: String(suggestion?.id || '').slice(0, 80), category: String(suggestion?.category || '').slice(0, 40),
    message: String(suggestion?.message || '').slice(0, 500)
  }),
  dismissSuggestion: (suggestion) => ipcRenderer.send('miko:suggestion:dismiss', {
    id: String(suggestion?.id || '').slice(0, 80), category: String(suggestion?.category || '').slice(0, 40)
  }),
  cancelLock: () => ipcRenderer.send('miko:lock:cancel'),
  requestVoicePermission: () => ipcRenderer.invoke('miko:voice:permission'),
  submitVoiceText: (text) => ipcRenderer.send('miko:voice:text', String(text || '').slice(0, 1000)),
  voicePromptStarted: () => ipcRenderer.send('miko:voice:prompt-started'),
  voicePromptFinished: () => ipcRenderer.send('miko:voice:prompt-finished'),
  setVoiceState: (state) => { if (['idle', 'listening', 'thinking', 'speaking', 'error'].includes(state)) ipcRenderer.send('miko:voice:state', state); },
  performAction: (action) => {
    if (['pause', 'resume', 'stop'].includes(action)) ipcRenderer.send('miko:action', action);
  },
  onState: (callback) => {
    if (typeof callback === 'function') {
      ipcRenderer.on('miko:state', (_event, state) => callback(state));
    }
  },
  onTaskEvent: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('miko:task-event', listener);
    return () => ipcRenderer.removeListener('miko:task-event', listener);
  },
  onVoiceTranscript: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, transcript) => callback(String(transcript || '').slice(0, 1000));
    ipcRenderer.on('miko:voice:transcript', listener);
    return () => ipcRenderer.removeListener('miko:voice:transcript', listener);
  },
  onSuggestion: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('miko:suggestion', (_event, suggestion) => callback(suggestion));
  },
  onActivity: (callback) => {
    if (typeof callback === 'function') ipcRenderer.on('miko:activity', (_event, activity) => callback(activity));
  }
});
