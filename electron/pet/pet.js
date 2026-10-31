(function () {
  const api = window.mikoPet;
  const shell = document.getElementById('pet-shell');
  const mascotButton = document.getElementById('mascot-button');
  const art = document.getElementById('companion-art');
  const stateLabel = document.getElementById('state-label');
  const progressChip = document.getElementById('progress-chip');
  const taskMessage = document.getElementById('task-message');
  const bubbleActions = document.getElementById('bubble-actions');
  const sessionAction = document.getElementById('session-action');
  const stopAction = document.getElementById('stop-action');
  const voiceAction = document.getElementById('voice-action');
  const suggestionAction = document.getElementById('suggestion-action');
  const suggestionDismiss = document.getElementById('suggestion-dismiss');
  const cancelLockAction = document.getElementById('cancel-lock-action');
  const screenIndicator = document.getElementById('screen-observation-indicator');
  const stopVoiceButton = document.getElementById('pet-stop-speaking');
  const continuousCheckbox = document.getElementById('pet-continuous-mode');
  const chatPanel = document.getElementById('pet-chat');
  const chatForm = document.getElementById('pet-chat-form');
  const chatInput = document.getElementById('pet-chat-input');
  const chatResponse = document.getElementById('pet-chat-response');
  const chatSend = document.getElementById('pet-chat-send');

  let currentState = null;
  let previousState = null;
  let audioContext = null;
  let clickTimer = null;
  let hoverTimer = null;
  let greetingTimer = null;
  let sleepTimer = null;
  let recognition = null;
  let pointerDrag = null;
  let dragged = false;
  let lastDragEndTime = 0;
  let previousCharacter = null;
  let loadedArtCharacter = null;
  let artRequestId = 0;
  let continuousConversation = false;
  let voiceRequestPending = false;

  const characters = {
    miko: {
      name: 'MIKO',
      asset: './miko.png',
      alt: 'MIKO, friendly robotic fox companion',
      idle: 'Ready when you are.',
      species: 'Robotic fox'
    },
    nova: {
      name: 'NOVA',
      asset: './assets/nova.svg',
      alt: 'NOVA, curious space robot companion',
      idle: 'All systems online! Ready to explore.',
      species: 'Space robot'
    },
    pixel: {
      name: 'PIXEL',
      asset: './assets/pixel.svg',
      alt: 'PIXEL, playful robot cat companion',
      idle: 'MINDORA active and purring. Click me anytime!',
      species: 'Robot cat'
    },
    oliver: {
      name: 'OLIVER',
      asset: './assets/oliver.svg',
      alt: 'OLIVER, calm wise owl companion',
      idle: 'Observing quietly. Ready to guide your work.',
      species: 'Friendly owl'
    },
    pip: {
      name: 'PIP',
      asset: './assets/pip.svg',
      alt: 'PIP, cheerful penguin companion',
      idle: 'Standing by! One step at a time.',
      species: 'Penguin companion'
    }
  };

  const stateNames = {
    idle: 'Resting',
    listening: 'Listening',
    thinking: 'Thinking',
    planning: 'Planning',
    researching: 'Researching',
    browsing: 'Observing',
    executing: 'Working',
    waiting: 'Your turn',
    success: 'Complete',
    error: 'Needs attention',
    paused: 'Paused',
    greeting: 'Hello!',
    sleeping: 'Zzz...',
    waving: 'Hi there!',
    dancing: 'Celebration',
    attention: 'Input needed'
  };

  function setInteractive(value) {
    if (api) api.setInteractive(value);
  }

  function playSound(kind = 'tap') {
    if (!currentState?.settings?.soundsEnabled) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === 'suspended') void audioContext.resume();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.value = kind === 'success' ? 660 : kind === 'error' ? 250 : kind === 'attention' ? 580 : 440;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(kind === 'success' ? 0.035 : 0.02, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + (kind === 'success' ? 0.16 : 0.075));
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + (kind === 'success' ? 0.17 : 0.08));
    } catch {
      /* Audio feedback remains optional and non-blocking */
    }
  }

  function speak(text, resumeRecognition = continuousConversation) {
    if (!currentState?.settings?.voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    recognition?.stop();
    const spoken = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[`*_#>]/g, '').replace(/https?:\/\/\S+/g, 'link').slice(0, 1800);
    if (!spoken.trim()) return;
    const utterance = new SpeechSynthesisUtterance(spoken);
    const prefs = currentState.voice || {};
    const voices = window.speechSynthesis.getVoices();
    if (prefs.voiceName) utterance.voice = voices.find((voice) => voice.name === prefs.voiceName) || null;
    utterance.rate = Math.max(0.75, Math.min(1.25, Number(prefs.rate) || 1));
    utterance.volume = Math.max(0, Math.min(1, Number.isFinite(Number(prefs.volume)) ? Number(prefs.volume) : 0.8));
    shell.dataset.speaking = 'true';
    shell.dataset.state = 'speaking';
    if (stopVoiceButton) stopVoiceButton.hidden = false;
    utterance.onend = utterance.onerror = () => {
      shell.dataset.speaking = 'false';
      if (stopVoiceButton) stopVoiceButton.hidden = true;
      api?.voicePromptFinished();
      if (resumeRecognition && continuousConversation) startRecognition();
    };
    api?.voicePromptStarted();
    window.speechSynthesis.speak(utterance);
  }

  async function startRecognition() {
    if (!currentState?.settings?.voiceEnabled || voiceRequestPending || recognition) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) { taskMessage.textContent = 'Speech recognition is unavailable in this Windows runtime.'; return; }
    voiceRequestPending = true;
    try {
      const allowed = await api.requestVoicePermission();
      if (!allowed || !continuousConversation && !voiceRequestPending) return;
      const instance = new Recognition();
      recognition = instance;
      instance.lang = currentState.voice?.language || navigator.language || 'en-US';
      instance.continuous = false;
      instance.interimResults = true;
      instance.maxAlternatives = 1;
      instance.onstart = () => { shell.dataset.state = 'listening'; shell.dataset.micActive = 'true'; if (stopVoiceButton) stopVoiceButton.hidden = false; };
      instance.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const phrase = event.results[i][0]?.transcript || '';
          if (event.results[i].isFinal) {
            const text = phrase.trim().slice(0, 1000);
            if (text) { taskMessage.textContent = text; shell.dataset.state = 'thinking'; api.submitVoiceText(text); }
          } else interim += phrase;
        }
        if (interim) taskMessage.textContent = interim.slice(0, 300);
      };
      instance.onerror = (event) => { taskMessage.textContent = event.error === 'not-allowed' ? 'Microphone permission was denied.' : event.error === 'no-speech' ? 'I did not hear speech. Try again.' : 'Voice input ended. Check your microphone and try again.'; };
      instance.onend = () => {
        if (recognition === instance) recognition = null;
        shell.dataset.micActive = 'false';
        if (continuousConversation && currentState?.settings?.voiceEnabled && !window.speechSynthesis?.speaking) setTimeout(() => { if (continuousConversation) void startRecognition(); }, 400);
        else if (currentState && !window.speechSynthesis?.speaking) shell.dataset.state = currentState.state;
        if (!continuousConversation && stopVoiceButton) stopVoiceButton.hidden = true;
      };
      instance.start();
    } catch {
      voiceRequestPending = false;
      shell.dataset.micActive = 'false';
      taskMessage.textContent = 'Voice input could not start. Check microphone permission and availability.';
    } finally { voiceRequestPending = false; }
  }

  continuousCheckbox?.addEventListener('change', () => { continuousConversation = continuousCheckbox.checked; if (continuousConversation) void startRecognition(); else recognition?.stop(); });
  stopVoiceButton?.addEventListener('click', () => { continuousConversation = false; if (continuousCheckbox) continuousCheckbox.checked = false; recognition?.stop(); window.speechSynthesis?.cancel(); shell.dataset.speaking = 'false'; shell.dataset.micActive = 'false'; stopVoiceButton.hidden = true; api?.voicePromptFinished(); });
  api?.onVoiceShutdown(() => { continuousConversation = false; recognition?.stop(); window.speechSynthesis?.cancel(); shell.dataset.micActive = 'false'; shell.dataset.speaking = 'false'; });
  api?.onTaskEvent((event) => {
    const task = event?.task;
    if (!task) return;
    if (task.state === 'completed' && task.response) {
      chatResponse.textContent = task.response;
      if (continuousConversation && currentState?.settings?.voiceEnabled) speak(task.response, true);
    } else if (task.state === 'failed') {
      const message = task.error || event.message || 'The task failed.';
      chatResponse.textContent = message;
      if (currentState?.settings?.voiceEnabled) speak(message, false);
    } else if (task.state === 'awaiting_approval') {
      if (currentState) currentState.state = 'attention';
      taskMessage.textContent = 'MINDORA needs your approval in the main app.';
    } else if (task.state === 'planning' || task.state === 'running' || task.state === 'waiting_for_tool') {
      if (task.plan?.summary) chatResponse.textContent = `Working: ${task.plan.summary}`;
    }
  });
  api?.onVoiceTranscript((transcript) => {
    chatPanel.hidden = false;
    chatInput.value = transcript;
    chatResponse.textContent = 'Sending your spoken request to MINDORA…';
  });

  function offerSuggestion(suggestion) {
    if (!suggestion || !currentState?.settings?.proactiveEnabled || currentState.settings.doNotDisturb) return;
    currentState.suggestion = suggestion;
    taskMessage.textContent = suggestion.message;
    suggestionAction.hidden = false;
    suggestionDismiss.hidden = false;
    suggestionAction.textContent = 'Ask MINDORA';
    if (!currentState.settings.doNotDisturb && currentState.settings.voiceEnabled) speak(suggestion.message);
  }

  async function updateCharacterArt(character, pet) {
    const requestId = ++artRequestId;
    if (character === 'miko') {
      if (loadedArtCharacter !== 'miko') {
        const image = document.createElement('img');
        image.src = './miko.png';
        image.alt = '';
        art.replaceChildren(image);
        loadedArtCharacter = 'miko';
      }
      return;
    }

    if (loadedArtCharacter === character) return;
    try {
      const source = await api?.loadCharacterSvg(character);
      if (requestId !== artRequestId || typeof source !== 'string' || !source) return;
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      const root = parsed.documentElement;
      if (root.localName !== 'svg' || parsed.querySelector('parsererror')) throw new Error('Invalid companion artwork.');
      root.classList.add('companion-vector');
      art.replaceChildren(document.importNode(root, true));
      loadedArtCharacter = character;
    } catch {
      if (requestId === artRequestId) taskMessage.textContent = `${pet.name} artwork could not be loaded.`;
    }
  }

  function resetSleepTimer() {
    clearTimeout(sleepTimer);
    if (shell.dataset.state === 'sleeping' && currentState) {
      shell.dataset.state = currentState.state;
      stateLabel.textContent = stateNames[currentState.state] || 'Resting';
    }
    if (currentState?.state === 'idle' && !currentState?.sessionActive) {
      sleepTimer = setTimeout(() => {
        if (currentState?.state === 'idle' && !currentState?.sessionActive) {
          shell.dataset.state = 'sleeping';
          stateLabel.textContent = stateNames.sleeping;
        }
      }, 60000);
    }
  }

  // --- Click-Through Management via Pointer Detection ---
  window.addEventListener('pointermove', (event) => {
    resetSleepTimer();
    const isInteractive = Boolean(
      event.target && event.target.closest &&
      event.target.closest('#mascot-button, .context-bubble, .pet-quick-actions, .pet-chat')
    );
    setInteractive(isInteractive);
  });

  document.addEventListener('mouseleave', () => {
    setInteractive(false);
  });

  shell.addEventListener('focusin', () => setInteractive(true));
  shell.addEventListener('focusout', (event) => {
    if (!shell.contains(event.relatedTarget)) setInteractive(false);
  });

  shell.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    api?.showContextMenu();
  });

  const chatButton = document.getElementById('pet-chat-button');
  function openChat() {
    chatPanel.hidden = false;
    setInteractive(true);
    chatInput.focus();
  }
  chatButton?.addEventListener('click', openChat);
  document.getElementById('pet-chat-close')?.addEventListener('click', () => { chatPanel.hidden = true; });
  document.getElementById('pet-voice-button')?.addEventListener('click', () => voiceAction.click());
  api?.onCommand((command) => {
    if (command === 'chat') openChat();
    if (command === 'voice') voiceAction.click();
  });
  api?.onOutsideChatClick(() => { chatPanel.hidden = true; });
  chatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const request = chatInput.value.trim();
    if (!request || chatSend.disabled) return;
    chatSend.disabled = true;
    chatResponse.textContent = 'Thinking…';
    shell.dataset.state = 'thinking';
    try {
      const result = await api?.submitChat(request);
      chatResponse.textContent = result?.response || result?.error || 'MINDORA did not return a response.';
      if (result?.taskId) chatResponse.dataset.taskId = result.taskId;
      shell.dataset.state = result?.error ? 'error' : result?.taskId ? 'planning' : 'waiting';
      if (!result?.error) chatInput.value = '';
    } catch (error) {
      chatResponse.textContent = String(error?.message || 'MINDORA could not process that request.');
      shell.dataset.state = 'error';
    } finally { chatSend.disabled = false; }
  });

  // --- Drag & Click Logic ---
  function handleDragStart(event) {
    if (event.button !== 0) return;
    pointerDrag = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      offsetX: event.clientX,
      offsetY: event.clientY,
      hasMoved: false
    };
    dragged = false;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handleDragMove(event) {
    if (!pointerDrag || pointerDrag.pointerId !== event.pointerId) return;
    const dx = event.screenX - pointerDrag.startScreenX;
    const dy = event.screenY - pointerDrag.startScreenY;
    if (!pointerDrag.hasMoved && Math.hypot(dx, dy) < 5) return;

    pointerDrag.hasMoved = true;
    dragged = true;
    api?.dragTo(event.screenX - pointerDrag.offsetX, event.screenY - pointerDrag.offsetY);
  }

  function handleDragEnd(event) {
    if (pointerDrag && pointerDrag.pointerId === event.pointerId) {
      if (pointerDrag.hasMoved) {
        lastDragEndTime = Date.now();
      }
      try {
        event.currentTarget.releasePointerCapture?.(event.pointerId);
      } catch { /* noop */ }
      pointerDrag = null;
    }
  }

  mascotButton.addEventListener('pointerdown', handleDragStart);
  mascotButton.addEventListener('pointermove', handleDragMove);
  mascotButton.addEventListener('pointerup', handleDragEnd);
  mascotButton.addEventListener('pointercancel', handleDragEnd);

  // --- Petting Interaction on Pointer Hover ---
  mascotButton.addEventListener('pointermove', () => {
    if (!dragged && mascotButton.matches(':hover')) {
      shell.dataset.interaction = 'petting';
      clearTimeout(shell._petTimer);
      shell._petTimer = setTimeout(() => { shell.dataset.interaction = ''; }, 800);
    }
  });

  // --- Mascot Hover Tooltip ---
  mascotButton.addEventListener('mouseenter', () => {
    clearTimeout(hoverTimer);
    if (!currentState?.suggestion && !currentState?.sessionActive) {
      hoverTimer = setTimeout(() => {
        const pet = characters[currentState?.settings?.character] || characters.miko;
        taskMessage.textContent = pet.idle;
      }, 250);
    }
  });

  mascotButton.addEventListener('mouseleave', () => {
    clearTimeout(hoverTimer);
    if (currentState && !currentState?.suggestion) {
      render(currentState, false);
    }
  });

  // --- Mascot Single & Double Click ---
  mascotButton.addEventListener('click', (event) => {
    if (dragged || (Date.now() - lastDragEndTime < 300)) {
      dragged = false;
      return;
    }
    playSound('tap');
    clearTimeout(clickTimer);
    clickTimer = setTimeout(() => {
      api?.openMain();
    }, 240);
  });

  mascotButton.addEventListener('dblclick', (event) => {
    event.preventDefault();
    clearTimeout(clickTimer);
    api?.openExpandedTaskView();
  });

  // --- Control Buttons ---
  sessionAction?.addEventListener('click', () => {
    playSound('tap');
    api?.performAction(sessionAction.dataset.action || 'pause');
  });
  stopAction?.addEventListener('click', () => {
    playSound('tap');
    api?.performAction('stop');
  });
  suggestionAction?.addEventListener('click', () => {
    if (currentState?.suggestion) api?.acceptSuggestion(currentState.suggestion);
  });
  suggestionDismiss?.addEventListener('click', () => {
    if (currentState?.suggestion) api?.dismissSuggestion(currentState.suggestion);
    currentState.suggestion = null;
    suggestionAction.hidden = true;
    suggestionDismiss.hidden = true;
    render(currentState, false);
  });
  cancelLockAction?.addEventListener('click', () => api?.cancelLock());

  // --- Voice Input Action ---
  voiceAction.addEventListener('click', async () => {
    if (!currentState?.settings?.voiceEnabled) {
      taskMessage.textContent = 'Turn on voice interactions in MINDORA Settings first.';
      return;
    }
    continuousConversation = false;
    if (continuousCheckbox) continuousCheckbox.checked = false;
    taskMessage.textContent = 'Listening once. MINDORA will not keep recording.';
    await startRecognition();
  });

  const microphoneButton = document.getElementById('pet-voice-button');
  microphoneButton?.addEventListener('pointerdown', (event) => {
    if (!currentState?.settings?.pushToTalk || event.button !== 0 || !currentState?.settings?.voiceEnabled) return;
    continuousConversation = true;
    void startRecognition();
  });
  microphoneButton?.addEventListener('pointerup', () => {
    if (currentState?.settings?.pushToTalk) { continuousConversation = false; recognition?.stop(); }
  });
  microphoneButton?.addEventListener('pointerleave', () => {
    if (currentState?.settings?.pushToTalk) { continuousConversation = false; recognition?.stop(); }
  });
  microphoneButton?.addEventListener('keydown', (event) => { if (event.code === 'Space' && currentState?.settings?.pushToTalk) { continuousConversation = true; void startRecognition(); } });
  microphoneButton?.addEventListener('keyup', (event) => { if (event.code === 'Space' && currentState?.settings?.pushToTalk) { continuousConversation = false; recognition?.stop(); } });

  // --- State Rendering ---
  function render(state, refreshMessage = true) {
    if (!state || !stateNames[state.state]) return;
    currentState = state;
    if (!state.settings?.voiceEnabled) { continuousConversation = false; recognition?.stop(); window.speechSynthesis?.cancel(); }

    if (previousState !== state.state) {
      if (state.state === 'success') playSound('success');
      else if (state.state === 'error') playSound('error');
      else if (state.state === 'attention') playSound('attention');
    }
    previousState = state.state;

    const charKey = state.settings?.character || 'miko';
    const pet = characters[charKey] || characters.miko;
    mascotButton.setAttribute('aria-label', `${pet.alt}. Click to open MINDORA or drag to move.`);

    // Trigger greeting animation on character change
    if (previousCharacter && previousCharacter !== charKey) {
      shell.dataset.state = 'greeting';
      clearTimeout(greetingTimer);
      greetingTimer = setTimeout(() => {
        if (currentState) {
          shell.dataset.state = currentState.state;
          stateLabel.textContent = stateNames[currentState.state] || 'Resting';
        }
      }, 1000);
    } else {
      shell.dataset.state = state.state;
    }
    previousCharacter = charKey;

    shell.dataset.mode = state.settings?.expanded ? 'expanded' : 'compact';
    shell.dataset.character = charKey;
    shell.dataset.reducedMotion = state.settings?.reducedMotion ? 'true' : 'false';
    shell.dataset.animationMode = state.settings?.animationMode === 'subtle' ? 'subtle' : 'full';
    if (continuousCheckbox) continuousCheckbox.checked = continuousConversation;

    const bubble = document.querySelector('.context-bubble');
    if (bubble) bubble.hidden = state.settings?.showStatusBubbles === false;
    if (bubbleActions) bubbleActions.hidden = !state.sessionActive && !state.suggestion && !Number.isFinite(state.lockCountdown);

    stateLabel.textContent = stateNames[shell.dataset.state] || stateNames[state.state];
    if (refreshMessage && !state.suggestion) {
      taskMessage.textContent = state.instruction || pet.idle;
    }

    void updateCharacterArt(charKey, pet);

    const observing = Boolean(state.settings?.screenAwarenessEnabled && !state.settings?.screenObservationPaused);
    screenIndicator.hidden = !observing;
    screenIndicator.textContent = observing ? '● Local screen awareness on' : '';

    progressChip.textContent = state.sessionActive ? `Step ${state.step || 1}` : pet.name;
    progressChip.classList.toggle('active', Boolean(state.sessionActive));
    progressChip.classList.toggle('attention', state.state === 'attention');
    progressChip.classList.toggle('success', state.state === 'success');

    const canPause = Boolean(state.sessionActive) && !state.paused && state.state !== 'success' && state.state !== 'error';
    const canResume = Boolean(state.sessionActive) && Boolean(state.paused);
    if (sessionAction) sessionAction.hidden = !canPause && !canResume;
    if (stopAction) stopAction.hidden = !state.sessionActive;
    sessionAction.textContent = canResume ? 'Resume' : 'Pause';
    sessionAction.dataset.action = canResume ? 'resume' : 'pause';

    if (voiceAction) voiceAction.hidden = !state.settings?.voiceEnabled;
    if (suggestionAction) suggestionAction.hidden = !state.suggestion;
    if (suggestionDismiss) suggestionDismiss.hidden = !state.suggestion;
    if (cancelLockAction) cancelLockAction.hidden = !Number.isFinite(state.lockCountdown);

    if (Number.isFinite(state.lockCountdown)) {
      if (cancelLockAction) {
        cancelLockAction.hidden = false;
        cancelLockAction.textContent = `Cancel lock (${state.lockCountdown}s)`;
      }
      taskMessage.textContent = `Windows will lock in ${state.lockCountdown} seconds due to your inactivity setting.`;
    }

    resetSleepTimer();
  }

  if (api) {
    api.onState(render);
    api.onSuggestion(offerSuggestion);
    api.onActivity((activity) => {
      if (!activity || !screenIndicator) return;
      if (activity.status === 'observed') {
        screenIndicator.title = `Local classification: ${activity.category}, ${Math.round(activity.confidence * 100)}% confidence`;
        screenIndicator.setAttribute('aria-label', screenIndicator.title);
      } else if (activity.status === 'skipped') {
        screenIndicator.title = 'Screen observation skipped for this application.';
      }
    });
    api.ready();
  }
})();
