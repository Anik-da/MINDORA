/**
 * MINDORA - Active Coach Panel Logic
 * 
 * Manages UI rendering across 9 approved coach states:
 * 1. ready
 * 2. capturing
 * 3. analysing
 * 4. guidance
 * 5. recovery
 * 6. paused
 * 7. complete
 * 8. error
 * 9. text-only
 */

/**
 * MINDORA - Coach TTS Controller
 * Manages local text-to-speech for actionable instructions.
 */
export function createCoachTtsController(options = {}) {
  const getInstruction = options.getInstruction || (() => '');
  const onStateChange = options.onStateChange || (() => {});
  const getSpeechSynthesis = options.getSpeechSynthesis || (() => (typeof window !== 'undefined' ? window.speechSynthesis : undefined));
  const getUtteranceClass = options.getUtteranceClass || (() => (typeof window !== 'undefined' ? (window.SpeechSynthesisUtterance || globalThis.SpeechSynthesisUtterance) : undefined));

  let isSpeaking = false;
  let activeUtterance = null;
  let currentSpokenText = '';

  function isSupported() {
    const synth = getSpeechSynthesis();
    const UtteranceClass = getUtteranceClass();
    return Boolean(synth && UtteranceClass);
  }

  function stop() {
    const synth = getSpeechSynthesis();
    if (synth) {
      try {
        synth.cancel();
      } catch (e) {
        // Safe guard against synthesis cancel errors
      }
    }
    isSpeaking = false;
    activeUtterance = null;
    currentSpokenText = '';
    onStateChange({ isSpeaking: false, label: 'Read instruction aloud', notice: null });
  }

  function speak(overrideText) {
    if (!isSupported()) {
      onStateChange({ 
        isSpeaking: false, 
        label: 'Read instruction aloud', 
        notice: 'Speech synthesis is unavailable on this device.' 
      });
      return false;
    }

    // Stop any in-progress speech first before starting new one
    stop();

    const rawText = overrideText !== undefined ? overrideText : getInstruction();
    const textToSpeak = typeof rawText === 'string' ? rawText.trim() : '';

    if (!textToSpeak) {
      onStateChange({ 
        isSpeaking: false, 
        label: 'Read instruction aloud', 
        notice: 'No active instruction to read.' 
      });
      return false;
    }

    const synth = getSpeechSynthesis();
    const UtteranceClass = getUtteranceClass();

    try {
      const utterance = new UtteranceClass(textToSpeak);
      activeUtterance = utterance;
      currentSpokenText = textToSpeak;

      utterance.onstart = () => {
        isSpeaking = true;
        onStateChange({ isSpeaking: true, label: 'Stop speaking', notice: null });
      };

      utterance.onend = () => {
        isSpeaking = false;
        activeUtterance = null;
        currentSpokenText = '';
        onStateChange({ isSpeaking: false, label: 'Read instruction aloud', notice: null });
      };

      utterance.onerror = (event) => {
        // Canceled or interrupted utterances are expected when user stops or guidance changes
        const isNormalStop = event && (event.error === 'canceled' || event.error === 'interrupted');
        isSpeaking = false;
        activeUtterance = null;
        currentSpokenText = '';
        onStateChange({ 
          isSpeaking: false, 
          label: 'Read instruction aloud', 
          notice: isNormalStop ? null : 'Could not play audio. Please read the instruction above.' 
        });
      };

      synth.speak(utterance);
      // Immediately reflect playing state for responsive feedback
      isSpeaking = true;
      onStateChange({ isSpeaking: true, label: 'Stop speaking', notice: null });
      return true;
    } catch (err) {
      isSpeaking = false;
      activeUtterance = null;
      currentSpokenText = '';
      onStateChange({ 
        isSpeaking: false, 
        label: 'Read instruction aloud', 
        notice: 'Speech synthesis encountered an error.' 
      });
      return false;
    }
  }

  function toggle() {
    if (isSpeaking) {
      stop();
    } else {
      speak();
    }
  }

  return {
    isSupported,
    isSpeaking: () => isSpeaking,
    getActiveText: () => currentSpokenText,
    speak,
    stop,
    toggle
  };
}

function initCoachPanel() {
  const panel = document.getElementById('coach-panel');
  const brandIndicator = document.getElementById('brand-indicator');
  const statusBadge = document.getElementById('status-badge');
  const goalLabel = document.getElementById('goal-label');
  const busyBox = document.getElementById('busy-box');
  const busyLabel = document.getElementById('busy-label');
  const instructionBox = document.getElementById('instruction-box');
  const instructionText = document.getElementById('instruction-text');
  const recoveryBox = document.getElementById('recovery-box');
  const recoveryText = document.getElementById('recovery-text');
  const observationBox = document.getElementById('observation-box');
  const observationText = document.getElementById('observation-text');
  const btnCheck = document.getElementById('btn-check');
  const btnPause = document.getElementById('btn-pause');
  const btnStop = document.getElementById('btn-stop');
  const btnTts = document.getElementById('btn-tts');
  const ttsNotice = document.getElementById('tts-notice');
  const budgetChip = document.getElementById('budget-chip');
  const mockBar = document.getElementById('mock-bar');
  const mockStateSelect = document.getElementById('mock-state-select');

  let currentState = 'ready';
  let isPaused = false;

  // Local Text-to-Speech Controller for actionable instructions
  const ttsController = createCoachTtsController({
    getInstruction: () => (instructionText && instructionText.textContent ? instructionText.textContent.trim() : ''),
    onStateChange: ({ isSpeaking, label, notice }) => {
      if (!btnTts) return;
      btnTts.setAttribute('aria-pressed', isSpeaking ? 'true' : 'false');
      btnTts.classList.toggle('speaking', isSpeaking);
      btnTts.setAttribute('aria-label', label);
      btnTts.setAttribute('title', label);

      const iconSpeaker = btnTts.querySelector('.tts-icon-speaker');
      const iconStop = btnTts.querySelector('.tts-icon-stop');
      if (iconSpeaker) iconSpeaker.style.display = isSpeaking ? 'none' : 'block';
      if (iconStop) iconStop.style.display = isSpeaking ? 'block' : 'none';

      if (ttsNotice) {
        ttsNotice.textContent = notice || '';
        ttsNotice.style.display = notice ? 'block' : 'none';
      }
    }
  });

  if (btnTts) {
    btnTts.addEventListener('click', (e) => {
      e.stopPropagation();
      ttsController.toggle();
    });
  }

  const STATE_DEFINITIONS = {
    ready: {
      badge: 'Ready',
      instruction: 'Focus your active application and click Check to begin.',
      observation: 'Waiting for your first screen check.',
      recovery: null,
      busy: null,
      panelClass: '',
      btnText: 'Check my progress',
      disabled: false
    },
    capturing: {
      badge: 'Observing',
      instruction: 'Observing your desktop…',
      observation: 'Hiding coach to capture active application window.',
      recovery: null,
      busy: 'Capturing window…',
      panelClass: '',
      btnText: 'Observing…',
      disabled: true
    },
    analysing: {
      badge: 'Reasoning',
      instruction: 'Analyzing your current progress…',
      observation: 'Evaluating visible application state.',
      recovery: null,
      busy: 'Reading your screen…',
      panelClass: '',
      btnText: 'Reading screen…',
      disabled: true
    },
    guidance: {
      badge: 'Step 1',
      instruction: 'Click "Insert" on the top menu bar to open chart options.',
      observation: 'Cells A1:B5 are selected. Insert menu is visible in the top toolbar.',
      recovery: null,
      busy: null,
      panelClass: '',
      btnText: 'Check my progress',
      disabled: false
    },
    recovery: {
      badge: 'Correction',
      instruction: 'Click "Insert" on the top menu bar to open chart options.',
      observation: 'You opened the "Format" menu instead of "Insert".',
      recovery: 'The "Format" menu changes cell styles. Charts are created under the "Insert" menu.',
      busy: null,
      panelClass: 'state-recovery',
      btnText: 'Check my progress',
      disabled: false
    },
    paused: {
      badge: 'Paused',
      instruction: 'Coaching is paused. Click Resume when you are ready.',
      observation: 'Screen observation is temporarily suspended. Highlights are cleared.',
      recovery: null,
      busy: null,
      panelClass: 'state-paused',
      btnText: 'Check my progress',
      disabled: true
    },
    complete: {
      badge: 'Complete',
      instruction: 'Well done! Your task is verified complete.',
      observation: 'Visible finished goal state verified on screen.',
      recovery: null,
      busy: null,
      panelClass: 'state-complete',
      btnText: 'Start new task',
      disabled: false
    },
    error: {
      badge: 'Notice',
      instruction: 'Please bring your target application to the foreground.',
      observation: 'Desktop or coach window is currently active.',
      recovery: null,
      busy: null,
      panelClass: 'state-error',
      btnText: 'Try Check again',
      disabled: false
    },
    'text-only': {
      badge: 'Action',
      instruction: 'Drag your mouse from cell A1 down to B5 to highlight the table.',
      observation: 'Table data is unselected. Highlight cells A1:B5 before opening the chart wizard.',
      recovery: null,
      busy: null,
      panelClass: '',
      btnText: 'Check my progress',
      disabled: false
    }
  };

  function applyState(stateName, payload = {}) {
    currentState = stateName;
    const def = STATE_DEFINITIONS[stateName] || STATE_DEFINITIONS.ready;

    // Immediately stop any prior speech when guidance or state changes
    ttsController.stop();

    panel.className = `coach-panel ${payload.panelClass || def.panelClass}`;
    statusBadge.textContent = payload.badge || def.badge;
    instructionText.textContent = payload.instruction || def.instruction;
    observationText.textContent = payload.observation || def.observation;

    // Recovery
    const recText = payload.recovery || def.recovery;
    if (recText) {
      recoveryText.textContent = recText;
      recoveryBox.classList.add('active');
    } else {
      recoveryBox.classList.remove('active');
    }

    // Busy
    const bText = payload.busy || def.busy;
    if (bText) {
      busyLabel.textContent = bText;
      busyBox.classList.add('active');
      instructionBox.style.display = 'none';
    } else {
      busyBox.classList.remove('active');
      instructionBox.style.display = 'flex';
    }

    // Buttons
    btnCheck.disabled = payload.disabled !== undefined ? payload.disabled : def.disabled;
    btnCheck.querySelector('span').textContent = payload.btnText || def.btnText;

    if (payload.goal) {
      goalLabel.textContent = payload.goal;
    }
    if (payload.budget !== undefined) {
      budgetChip.textContent = `${payload.budget} checks left`;
    }

    if (stateName === 'paused') {
      btnPause.textContent = 'Resume';
      isPaused = true;
    } else {
      btnPause.textContent = 'Pause';
      isPaused = false;
    }

    // Scroll content region to beginning so immediate instruction is always visible
    const scrollContainer = document.getElementById('panel-scroll-content');
    if (scrollContainer) {
      scrollContainer.scrollTop = 0;
    }
  }

  // Expose mock state switcher and tts controller for developer review harness
  window.__applyMockState = applyState;
  window.__ttsController = ttsController;

  // Check button click
  btnCheck.addEventListener('click', () => {
    ttsController.stop();
    if (currentState === 'complete') {
      if (window.electronAPI && window.electronAPI.stopSession) {
        window.electronAPI.stopSession();
      } else if (window.electronAPI && window.electronAPI.resetSession) {
        window.electronAPI.resetSession();
      }
      return;
    }

    if (window.electronAPI && window.electronAPI.triggerCheck) {
      window.electronAPI.triggerCheck();
    }
  });

  // Pause / Resume
  btnPause.addEventListener('click', () => {
    ttsController.stop();
    if (isPaused) {
      if (window.electronAPI && window.electronAPI.resumeSession) {
        window.electronAPI.resumeSession();
      } else {
        applyState('ready');
      }
    } else {
      if (window.electronAPI && window.electronAPI.pauseSession) {
        window.electronAPI.pauseSession();
      } else {
        applyState('paused');
      }
    }
  });

  // Stop button
  btnStop.addEventListener('click', () => {
    ttsController.stop();
    if (window.electronAPI && window.electronAPI.stopSession) {
      window.electronAPI.stopSession();
    }
  });

  // Unload listener to stop speech synthesis on window close/destroy
  window.addEventListener('beforeunload', () => {
    ttsController.stop();
  });

  // Developer Mock Bar
  if (mockStateSelect) {
    mockStateSelect.addEventListener('change', (e) => {
      applyState(e.target.value);
    });
  }

  // Listen to IPC updates from main process
  if (window.electronAPI && window.electronAPI.onCoachUpdate) {
    window.electronAPI.onCoachUpdate((data) => {
      if (data.isMockMode) {
        mockBar.classList.add('visible');
      }
      applyState(data.state, data);
    });
  }

  // Check URL params for mock mode
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('mock') === 'true') {
    mockBar.classList.add('visible');
    applyState('guidance');
  } else {
    applyState('ready');
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCoachPanel);
  } else {
    initCoachPanel();
  }
}
