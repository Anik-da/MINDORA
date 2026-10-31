/**
 * MINDORA Web - Client Application Controller & State Machine
 * 
 * Manages full interactive web companion experience:
 * - Image upload (drag & drop, file picker, clipboard paste).
 * - "Explore an example" loading from server.
 * - Goal entry and preset selection.
 * - Monotonic request identity & stale-response rejection.
 * - Progress checks with fresh screenshots across session turns.
 * - Grounded bounding box rendering relative to displayed image.
 * - Error states, rate limit pacing feedback, and clean session reset.
 * - Premium motion: entrance choreography, ribbon interaction, scan effects.
 */

interface NormalizedBox {
  0: number; // ymin
  1: number; // xmin
  2: number; // ymax
  3: number; // xmax
}

interface ValidatedGuidance {
  assessment: 'not_started' | 'expected' | 'unexpected' | 'uncertain';
  status: 'guide' | 'recover' | 'uncertain' | 'complete';
  observation: string;
  instruction: string;
  targetLabel: string | null;
  targetBox: [number, number, number, number] | null;
  selectedCandidateId: string | null;
  expectedOutcome: string;
  reason: string | null;
  hasTargetHighlight: boolean;
}

interface CheckResponse {
  success: boolean;
  guidance?: ValidatedGuidance;
  stepNumber?: number;
  checkCount?: number;
  maxChecks?: number;
  durationMs?: number;
  candidatesFound?: number;
  imageDimensions?: { width: number; height: number };
  error?: string;
  retryAfterSec?: number;
}

interface SessionTurnRecord {
  turnNumber: number;
  instruction: string;
  assessment: string;
  status: string;
  selectedCandidateText: string | null;
}

type AppState = 'ready' | 'preview' | 'analysing' | 'guidance' | 'recovery' | 'uncertain' | 'complete' | 'error';

/* ═══════════════════════════════════════════════
   Motion Controller
   ═══════════════════════════════════════════════ */

class MotionController {
  private prefersReducedMotion: boolean;
  private companionParallaxWrap: HTMLElement | null;
  private companionStageWrapper: HTMLElement | null;
  private companionEntranceWrap: HTMLElement | null;
  private companionSwayWrap: HTMLElement | null;
  private companionFloatWrap: HTMLElement | null;
  private heroSection: HTMLElement | null;
  private heroObserver: IntersectionObserver | null = null;
  private isTouchDevice: boolean;
  private isHeroVisible = true;

  constructor() {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.prefersReducedMotion = mq.matches;
    mq.addEventListener('change', (e) => { this.prefersReducedMotion = e.matches; });

    this.companionParallaxWrap = document.getElementById('companion-parallax');
    this.companionStageWrapper = document.querySelector('.companion-stage-wrapper');
    this.companionEntranceWrap = document.querySelector('.companion-entrance-wrap');
    this.companionSwayWrap = document.querySelector('.companion-sway-wrap');
    this.companionFloatWrap = document.querySelector('.companion-float-wrap');
    this.heroSection = document.getElementById('hero');
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }

  /** Run deliberate page entrance sequence */
  playEntrance(): void {
    if (this.prefersReducedMotion) {
      // Immediately reveal all in static composed layout
      document.querySelectorAll('.entrance-nav, .entrance-lettering, .companion-entrance-wrap, .entrance-bubble, .entrance-copy')
        .forEach(el => {
          (el as HTMLElement).style.opacity = '1';
          (el as HTMLElement).style.transform = 'none';
          (el as HTMLElement).style.clipPath = 'none';
        });
      if (this.companionFloatWrap) this.companionFloatWrap.classList.add('settled');
      return;
    }

    requestAnimationFrame(() => {
      // 0–400 ms: oversized lettering reveals through a short upward mask
      document.querySelectorAll('.entrance-nav, .entrance-lettering')
        .forEach(el => el.classList.add('reveal'));

      // 250–1100 ms: MINDORA companion rises ~40px, fades in and scales from 0.94 to 1
      if (this.companionEntranceWrap) {
        this.companionEntranceWrap.classList.add('reveal');
      }

      // 1000–1600 ms: a short welcoming sway settles
      setTimeout(() => {
        if (this.companionSwayWrap) {
          this.companionSwayWrap.classList.add('swaying');
        }
      }, 1000);

      // 1300–1900 ms: the welcome bubble and supporting content appear
      setTimeout(() => {
        document.querySelectorAll('.entrance-bubble, .entrance-copy')
          .forEach(el => el.classList.add('reveal'));
      }, 1300);

      // 1900 ms onwards: start gentle idle float
      setTimeout(() => {
        if (this.companionFloatWrap) {
          this.companionFloatWrap.classList.add('settled');
        }
      }, 1900);
    });
  }

  /** Set up IntersectionObservers for scroll reveals */
  initScrollReveals(): void {
    if (this.prefersReducedMotion) {
      document.querySelectorAll('.workspace-reveal, .explainer-reveal')
        .forEach(el => el.classList.add('revealed'));
      return;
    }

    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.workspace-reveal, .explainer-reveal')
      .forEach(el => revealObserver.observe(el));

    // Hero visibility tracking: pause MINDORA companion animation when offscreen
    if (this.heroSection) {
      this.heroObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          this.isHeroVisible = entry.isIntersecting;
          if (this.companionStageWrapper) {
            this.companionStageWrapper.classList.toggle('offscreen', !entry.isIntersecting);
          }
        });
      }, { threshold: 0.05 });
      this.heroObserver.observe(this.heroSection);
    }

    // Tab visibility: pause MINDORA companion animation when tab is hidden
    document.addEventListener('visibilitychange', () => {
      if (this.companionStageWrapper) {
        this.companionStageWrapper.classList.toggle('offscreen', document.hidden);
      }
    });
  }

  /** Pointer tracking for gentle desktop parallax */
  initCompanionPointerTracking(): void {
    if (this.prefersReducedMotion || this.isTouchDevice || !this.companionParallaxWrap || !this.heroSection) return;

    const parallaxEl = this.companionParallaxWrap;
    const heroEl = this.heroSection;

    heroEl.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isHeroVisible) return;

      const rect = heroEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (e.clientX - cx) / rect.width;
      const dy = (e.clientY - cy) / rect.height;

      // Restrained tilt and subtle translation
      const rotateY = dx * 2.5;
      const rotateX = -dy * 2.0;
      const translateX = dx * 10;
      const translateY = dy * 8;

      parallaxEl.style.transform = 
        `perspective(800px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) translate(${translateX.toFixed(1)}px, ${translateY.toFixed(1)}px)`;
    });

    heroEl.addEventListener('mouseleave', () => {
      parallaxEl.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translate(0px, 0px)';
    });
  }

  /** Add scan line effect during analysis */
  showScanLine(previewWrapper: HTMLElement): void {
    if (this.prefersReducedMotion) return;

    // Remove existing scan lines
    previewWrapper.querySelectorAll('.scan-line').forEach(el => el.remove());

    const scanLine = document.createElement('div');
    scanLine.className = 'scan-line';
    previewWrapper.appendChild(scanLine);

    // Auto-remove after animation
    scanLine.addEventListener('animationend', () => scanLine.remove());
  }

  /** Show/hide analysis progress bar */
  setAnalysisProgress(show: boolean): void {
    const el = document.getElementById('analysis-progress');
    if (el) el.style.display = show ? 'block' : 'none';
  }

  /** Animate coach content transition */
  animateCoachContent(): void {
    if (this.prefersReducedMotion) return;

    const instructionBox = document.getElementById('instruction-box');
    const observationBox = document.getElementById('observation-box');

    [instructionBox, observationBox].forEach(box => {
      if (box) {
        box.classList.remove('coach-content-transition');
        void box.offsetWidth; // Force reflow
        box.classList.add('coach-content-transition');
      }
    });
  }

  /** Animate recovery box entrance */
  animateRecoveryEntrance(): void {
    if (this.prefersReducedMotion) return;

    const recoveryBox = document.getElementById('recovery-box');
    if (recoveryBox) {
      recoveryBox.classList.remove('entering');
      void recoveryBox.offsetWidth;
      recoveryBox.classList.add('entering');
    }
  }

  /** Set panel indicator analysis state */
  setPanelIndicatorAnalysing(active: boolean): void {
    const indicator = document.getElementById('panel-indicator');
    if (indicator) {
      indicator.classList.toggle('analysing', active);
    }
  }
}

/* ═══════════════════════════════════════════════
   Main Application
   ═══════════════════════════════════════════════ */

class MINDORAWebApp {
  private state: AppState = 'ready';
  private sessionId: string;
  private currentStepNumber = 1;
  private checkCount = 0;
  private maxChecks = 15;
  private inFlightRequestId = 0;
  private abortController: AbortController | null = null;

  private imageBase64: string | null = null;
  private imageMime: 'image/png' | 'image/jpeg' = 'image/png';
  private lastGuidance: ValidatedGuidance | null = null;
  private history: SessionTurnRecord[] = [];

  // Motion controller
  private motion: MotionController;

  // DOM Elements
  private dropzone = document.getElementById('dropzone') as HTMLElement;
  private fileInput = document.getElementById('file-input') as HTMLInputElement;
  private previewContainer = document.getElementById('preview-container') as HTMLElement;
  private previewImg = document.getElementById('preview-img') as HTMLImageElement;
  private highlightOverlay = document.getElementById('highlight-overlay') as HTMLElement;
  private imageMetaBadge = document.getElementById('image-meta-badge') as HTMLElement;
  private candidateCountBadge = document.getElementById('candidate-count-badge') as HTMLElement;
  private canvasStepNum = document.getElementById('canvas-step-num') as HTMLElement;
  private canvasFooterTip = document.getElementById('canvas-footer-tip') as HTMLElement;

  private btnFreshScreenshot = document.getElementById('btn-fresh-screenshot') as HTMLButtonElement;
  private btnClearImage = document.getElementById('btn-clear-image') as HTMLButtonElement;
  private btnLoadCalcExample = document.getElementById('btn-load-calc-example') as HTMLButtonElement | null;
  private scenarioQuickLinks = document.getElementById('scenario-quick-links') as HTMLElement | null;
  private btnHeroExample = document.getElementById('btn-hero-example') as HTMLButtonElement;
  private btnPresetChart = document.getElementById('btn-preset-chart') as HTMLButtonElement;
  private btnAction = document.getElementById('btn-action') as HTMLButtonElement;
  private btnActionLabel = document.getElementById('btn-action-label') as HTMLElement;
  private btnCancel = document.getElementById('btn-cancel') as HTMLButtonElement;
  private btnResetSession = document.getElementById('btn-reset-session') as HTMLButtonElement;

  private goalInput = document.getElementById('goal-input') as HTMLTextAreaElement;
  private tutorialUrlInput = document.getElementById('tutorial-url-input') as HTMLInputElement | null;
  private goalModeChip = document.getElementById('goal-mode-chip') as HTMLElement | null;
  private goalClarificationHint = document.getElementById('goal-clarification-hint') as HTMLElement | null;
  private currentGoal: string = "Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.";
  private readonly defaultGoal: string = "Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.";
  private pendingResetPromise: Promise<void> | null = null;

  private statusBadge = document.getElementById('status-badge') as HTMLElement;
  private busyBox = document.getElementById('busy-box') as HTMLElement;
  private busyLabel = document.getElementById('busy-label') as HTMLElement;
  private instructionStepTag = document.getElementById('instruction-step-tag') as HTMLElement;
  private instructionText = document.getElementById('instruction-text') as HTMLElement;
  private recoveryBox = document.getElementById('recovery-box') as HTMLElement;
  private recoveryText = document.getElementById('recovery-text') as HTMLElement;
  private uncertainBox = document.getElementById('uncertain-box') as HTMLElement;
  private uncertainText = document.getElementById('uncertain-text') as HTMLElement;
  private observationText = document.getElementById('observation-text') as HTMLElement;
  private budgetChip = document.getElementById('budget-chip') as HTMLElement;
  private toastNotice = document.getElementById('toast-notice') as HTMLElement;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.motion = new MotionController();
    this.initEvents();
    this.updateBudgetDisplay();
    this.checkServerHealth();

    // Choreographed entrance
    this.motion.playEntrance();
    this.motion.initScrollReveals();
    this.motion.initCompanionPointerTracking();
  }

  private getOrCreateSessionId(): string {
    let id = sessionStorage.getItem('unstuck_web_session');
    if (!id) {
      id = 'ses_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
      sessionStorage.setItem('unstuck_web_session', id);
    }
    return id;
  }

  private initEvents(): void {
    // Dropzone click & drag events
    this.dropzone.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    ['dragenter', 'dragover'].forEach(name => {
      this.dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.add('drag-active');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      this.dropzone.addEventListener(name, (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.dropzone.classList.remove('drag-active');
      });
    });

    this.dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files.length > 0) {
        this.loadImageFile(dt.files[0]);
      }
    });

    // Clipboard paste support (Ctrl+V)
    window.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            this.loadImageFile(file);
            this.showToast('Screenshot pasted from clipboard.');
            break;
          }
        }
      }
    });

    // Goal input listener & Preset buttons
    this.goalInput.addEventListener('input', () => {
      this.handleGoalChange(this.goalInput.value);
    });

    this.btnPresetChart.addEventListener('click', () => {
      this.goalInput.value = this.defaultGoal;
      this.handleGoalChange(this.defaultGoal);
      this.showToast('Tested LibreOffice Calc task preset loaded.');
    });

    if (this.btnLoadCalcExample) {
      this.btnLoadCalcExample.addEventListener('click', (e) => {
        e.stopPropagation();
        this.loadCalcExample('ready');
      });
    }

    document.querySelectorAll<HTMLButtonElement>('.scenario-chip, .quick-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        const scenario = chip.dataset.scenario || 'ready';
        this.loadCalcExample(scenario);
      });
    });

    // Smooth scroll helper with sticky header offset
    const scrollToWorkspace = () => {
      document.querySelectorAll('.workspace-reveal').forEach(el => el.classList.add('revealed'));
      const ws = document.getElementById('workspace');
      if (ws) {
        const headerOffset = 76;
        const elementPosition = ws.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    };

    const btnHeroTry = document.getElementById('btn-hero-try');
    if (btnHeroTry) {
      btnHeroTry.addEventListener('click', (e) => {
        e.preventDefault();
        scrollToWorkspace();
      });
    }

    this.btnHeroExample.addEventListener('click', () => {
      this.loadCalcExample('ready');
      scrollToWorkspace();
    });

    // Toolbar buttons
    this.btnFreshScreenshot.addEventListener('click', () => this.fileInput.click());
    this.btnClearImage.addEventListener('click', () => this.clearImage());

    // Main action button
    this.btnAction.addEventListener('click', () => this.handleActionClick());
    this.btnCancel.addEventListener('click', () => this.cancelAnalysis());
    this.btnResetSession.addEventListener('click', () => this.resetSession());
  }

  private handleGoalChange(newGoal: string): void {
    const trimmed = newGoal.trim();
    const isPreset = trimmed === this.defaultGoal;

    if (this.goalModeChip) {
      this.goalModeChip.textContent = isPreset ? 'Preset' : 'Custom';
      this.goalModeChip.className = `goal-mode-chip ${isPreset ? 'preset' : 'custom'}`;
    }

    if (this.goalClarificationHint) {
      this.goalClarificationHint.style.display = isPreset ? 'none' : 'block';
    }

    if (trimmed !== this.currentGoal) {
      this.currentGoal = trimmed;
      // Invalidate stale guidance, history, step count, and highlights
      this.lastGuidance = null;
      this.history = [];
      this.currentStepNumber = 1;
      this.clearHighlight();

      // Reset server session turn counters without race
      this.pendingResetPromise = fetch('/api/session/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: this.sessionId })
      }).then(() => {
        this.pendingResetPromise = null;
      }).catch(() => {
        this.pendingResetPromise = null;
      });

      if (this.imageBase64) {
        this.setState('preview');
        this.instructionStepTag.textContent = 'Step 1';
        this.instructionText.textContent = 'Goal updated. Click "Find my next move" to evaluate your screen for this goal.';
        this.observationText.textContent = 'Stale session responses and highlights cleared for new goal.';
        this.canvasFooterTip.textContent = 'Click "Find my next move" to request real-time guidance.';
      } else {
        this.setState('ready');
      }
    }
  }

  private async checkServerHealth(): Promise<void> {
    try {
      const res = await fetch('/healthz');
      if (res.ok) {
        const data = await res.json();
        const statusEl = document.getElementById('system-status-text');
        if (statusEl) {
          // Truthful service status: distinguish configured key from verified live availability
          statusEl.textContent = data.hasKeyConfigured ? 'Ready (Key Configured)' : 'API Key Pending';
        }
      }
    } catch {
      const statusEl = document.getElementById('system-status-text');
      if (statusEl) statusEl.textContent = 'Server Offline';
    }
  }

  private handleFileSelect(e: Event): void {
    const target = e.target as HTMLInputElement;
    if (target.files && target.files.length > 0) {
      this.loadImageFile(target.files[0]);
    }
  }

  private loadImageFile(file: File): void {
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      this.showToast('Please select a PNG or JPEG screenshot.');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      this.showToast('Screenshot exceeds 8 MiB limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      this.setImageData(result, file.type as 'image/png' | 'image/jpeg', `${file.name} (${(file.size / 1024).toFixed(0)} KB)`);
    };
    reader.readAsDataURL(file);
  }

  private async loadCalcExample(scenario: string = 'ready'): Promise<void> {
    this.showToast('Loading clean LibreOffice Calc fixture…');
    try {
      const res = await fetch(`/api/example?scenario=${encodeURIComponent(scenario)}`);
      const data = await res.json();
      if (!data.hasExample) {
        this.showToast(data.message || 'Example screenshot not found on server.');
        return;
      }

      const dataUri = `data:${data.mimeType};base64,${data.imageBase64}`;
      const label = data.label || 'Calc Fixture';
      this.setImageData(dataUri, data.mimeType, `Clean Fixture: ${label}`);
      if (data.goal) {
        this.goalInput.value = data.goal;
        this.handleGoalChange(data.goal);
      }
      this.showToast(`${label} loaded (clean screenshot, no coach overlays).`);
    } catch (err) {
      this.showToast('Failed to fetch example screenshot.');
    }
  }

  private setImageData(dataUri: string, mime: 'image/png' | 'image/jpeg', metaLabel: string): void {
    document.querySelectorAll('.workspace-reveal').forEach(el => el.classList.add('revealed'));
    this.imageBase64 = dataUri;
    this.imageMime = mime;

    // Image arrival animation
    this.previewImg.classList.remove('arriving');
    this.previewImg.onload = () => {
      this.previewImg.classList.add('arriving');
    };
    this.previewImg.src = dataUri;
    if (this.previewImg.complete) {
      this.previewImg.classList.add('arriving');
    }

    this.dropzone.style.display = 'none';
    this.previewContainer.style.display = 'flex';
    this.btnFreshScreenshot.style.display = 'inline-block';
    this.btnClearImage.style.display = 'inline-block';
    if (this.scenarioQuickLinks) {
      this.scenarioQuickLinks.style.display = 'inline-flex';
    }
    this.imageMetaBadge.textContent = metaLabel;

    // Clear previous highlight on new image load, but preserve task history and last guidance for step verification
    this.clearHighlight();

    if (this.state === 'ready' || this.state === 'complete' || this.state === 'error' || this.state === 'guidance' || this.state === 'recovery' || this.state === 'uncertain') {
      this.setState('preview');
      this.instructionStepTag.textContent = `Step ${this.currentStepNumber}`;
      this.instructionText.textContent = 'Screenshot loaded. Click "Find my next move" to inspect the spreadsheet.';
      this.observationText.textContent = 'Image loaded and ready for OCR grounding and vision analysis.';
      this.canvasFooterTip.textContent = 'Click "Find my next move" to request real-time guidance.';
    } else {
      this.canvasFooterTip.textContent = 'Fresh screenshot loaded. Click "Check my progress" to verify your step.';
    }
  }

  private clearImage(): void {
    this.imageBase64 = null;
    this.previewImg.src = '';
    this.clearHighlight();
    this.lastGuidance = null;
    this.history = [];

    this.dropzone.style.display = 'flex';
    this.previewContainer.style.display = 'none';
    this.btnFreshScreenshot.style.display = 'none';
    this.btnClearImage.style.display = 'none';
    if (this.scenarioQuickLinks) {
      this.scenarioQuickLinks.style.display = 'none';
    }
    this.imageMetaBadge.textContent = 'No image loaded';
    this.candidateCountBadge.style.display = 'none';
    this.canvasFooterTip.textContent = 'Upload a screenshot of your active application to begin.';

    this.setState('ready');
    this.instructionStepTag.textContent = 'Step 1';
    this.instructionText.textContent = 'Upload a screenshot and click "Find my next move" to begin.';
    this.observationText.textContent = 'Awaiting your screenshot upload to inspect the spreadsheet state.';
  }

  private clearHighlight(): void {
    this.highlightOverlay.innerHTML = '';
  }

  private renderGroundedHighlight(targetBox: [number, number, number, number], labelText: string): void {
    this.clearHighlight();

    const [ymin, xmin, ymax, xmax] = targetBox;
    const topPct = (ymin / 10).toFixed(2);
    const leftPct = (xmin / 10).toFixed(2);
    const widthPct = Math.max(1, (xmax - xmin) / 10).toFixed(2);
    const heightPct = Math.max(1, (ymax - ymin) / 10).toFixed(2);

    const bracket = document.createElement('div');
    bracket.className = 'target-bracket';
    bracket.style.top = `${topPct}%`;
    bracket.style.left = `${leftPct}%`;
    bracket.style.width = `${widthPct}%`;
    bracket.style.height = `${heightPct}%`;

    const label = document.createElement('div');
    label.className = 'target-bracket-label';
    label.textContent = labelText || 'Target';
    bracket.appendChild(label);

    this.highlightOverlay.appendChild(bracket);
  }

  private async handleActionClick(): Promise<void> {
    if (this.state === 'complete') {
      this.resetSession();
      return;
    }

    if (!this.imageBase64) {
      this.showToast('Please upload a screenshot first.');
      return;
    }

    const goal = this.goalInput.value.trim();
    if (goal.length < 3) {
      this.showToast('Please describe your goal before checking.');
      return;
    }

    await this.runAnalysis();
  }

  private async runAnalysis(): Promise<void> {
    if (this.state === 'analysing') return;

    // Await any pending reset to guarantee no race between session reset and check
    if (this.pendingResetPromise) {
      await this.pendingResetPromise;
    }

    this.setState('analysing');
    const requestId = ++this.inFlightRequestId;
    this.abortController = new AbortController();

    const previousInstruction = this.lastGuidance ? this.lastGuidance.instruction : null;

    // Motion: show analysis progress and scan line
    this.motion.setAnalysisProgress(true);
    this.motion.setPanelIndicatorAnalysing(true);

    const previewWrapper = document.getElementById('preview-wrapper');
    if (previewWrapper) {
      this.motion.showScanLine(previewWrapper);
    }

    try {
      const response = await fetch('/api/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId: this.sessionId,
          goal: this.goalInput.value.trim(),
          tutorialUrl: this.tutorialUrlInput?.value.trim() || undefined,
          imageBase64: this.imageBase64,
          previousInstruction,
          history: this.history
        }),
        signal: this.abortController.signal
      });

      // Stale response guard
      if (requestId !== this.inFlightRequestId) {
        return;
      }

      const data: CheckResponse = await response.json();

      // Motion: hide analysis indicators
      this.motion.setAnalysisProgress(false);
      this.motion.setPanelIndicatorAnalysing(false);

      if (!response.ok || !data.success || !data.guidance) {
        this.clearHighlight();
        if (response.status === 429) {
          this.setState('error');
          this.showToast(data.error || 'Rate limit reached. Please wait a moment.');
          this.instructionText.textContent = data.error || 'Request pacing limit reached. Context preserved.';
          return;
        }

        this.setState('error');
        this.instructionText.textContent = data.error || 'Failed to analyze screenshot.';
        this.showToast(data.error || 'Analysis failed.');
        return;
      }

      const guidance = data.guidance;
      this.lastGuidance = guidance;
      if (typeof data.stepNumber === 'number') {
        this.currentStepNumber = data.stepNumber;
      }
      if (typeof data.checkCount === 'number') {
        this.checkCount = data.checkCount;
      }
      if (typeof data.maxChecks === 'number') {
        this.maxChecks = data.maxChecks;
      }

      this.updateBudgetDisplay();

      // Show candidate count badge
      if (typeof data.candidatesFound === 'number') {
        this.candidateCountBadge.style.display = 'inline-block';
        this.candidateCountBadge.textContent = `${data.candidatesFound} OCR targets`;
      }

      // Record to history
      this.history.push({
        turnNumber: this.checkCount,
        instruction: guidance.instruction,
        assessment: guidance.assessment,
        status: guidance.status,
        selectedCandidateText: guidance.targetLabel
      });

      // Animate coach content transition
      this.motion.animateCoachContent();

      // Dispatch state based on model response status
      if (guidance.status === 'complete') {
        this.setState('complete');
        this.clearHighlight();
        this.instructionStepTag.textContent = '✓ Complete';
        this.instructionText.textContent = guidance.instruction;
        this.observationText.textContent = guidance.observation;
        this.canvasFooterTip.textContent = 'Workflow verified! Your chart is visibly inserted in the spreadsheet.';
      } else if (guidance.status === 'recover') {
        this.setState('recovery');
        this.instructionStepTag.textContent = `Correction`;
        this.instructionText.textContent = guidance.instruction;
        this.recoveryText.textContent = guidance.reason || 'Observed deviation from expected chart path. Let us correct it.';
        this.observationText.textContent = guidance.observation;

        // Animate recovery entrance
        this.motion.animateRecoveryEntrance();

        if (guidance.hasTargetHighlight && guidance.targetBox) {
          this.renderGroundedHighlight(guidance.targetBox, guidance.targetLabel || 'Target');
        } else {
          this.clearHighlight();
        }
        this.canvasFooterTip.textContent = 'Correct the step in your software, then upload a fresh screenshot and check.';
      } else if (guidance.status === 'uncertain') {
        this.setState('uncertain');
        this.clearHighlight();
        this.instructionStepTag.textContent = 'Uncertain';
        this.instructionText.textContent = guidance.instruction;
        this.uncertainText.textContent = 'Screen observation is ambiguous. Please bring LibreOffice Calc forward and ensure menus are visible.';
        this.observationText.textContent = guidance.observation;
        this.canvasFooterTip.textContent = 'Adjust your window view and check again.';
      } else {
        // Normal guidance step
        this.setState('guidance');
        this.instructionStepTag.textContent = `Step ${this.currentStepNumber}`;
        this.instructionText.textContent = guidance.instruction;
        this.observationText.textContent = guidance.observation;

        if (guidance.hasTargetHighlight && guidance.targetBox) {
          this.renderGroundedHighlight(guidance.targetBox, guidance.targetLabel || 'Click here');
        } else {
          this.clearHighlight();
        }
        this.canvasFooterTip.textContent = 'Execute this step, then upload a fresh screenshot to verify progress.';
      }
    } catch (err: unknown) {
      this.motion.setAnalysisProgress(false);
      this.motion.setPanelIndicatorAnalysing(false);

      if (err instanceof Error && err.name === 'AbortError') {
        this.setState('preview');
        this.showToast('Analysis cancelled.');
        return;
      }
      this.clearHighlight();
      this.setState('error');
      this.instructionText.textContent = 'Connection error. Please check your network and try again.';
      this.showToast('Network connection failed.');
    } finally {
      this.abortController = null;
    }
  }

  private cancelAnalysis(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private async resetSession(): Promise<void> {
    this.inFlightRequestId++;
    this.checkCount = 0;
    this.currentStepNumber = 1;
    this.history = [];
    this.lastGuidance = null;
    this.clearHighlight();

    this.pendingResetPromise = fetch('/api/session/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId })
    }).then(() => {
      this.pendingResetPromise = null;
    }).catch(() => {
      this.pendingResetPromise = null;
    });

    await this.pendingResetPromise;
    this.updateBudgetDisplay();

    if (this.imageBase64) {
      this.setState('preview');
      this.instructionStepTag.textContent = 'Step 1';
      this.instructionText.textContent = 'Session reset. Click "Find my next move" to begin coaching.';
      this.observationText.textContent = 'Ready for initial screen evaluation.';
    } else {
      this.setState('ready');
    }

    this.showToast('Session reset cleanly.');
  }

  private setState(newState: AppState): void {
    this.state = newState;
    this.statusBadge.className = `status-badge ${newState}`;

    // Update status badge copy
    switch (newState) {
      case 'ready':
        this.statusBadge.textContent = 'Ready';
        this.btnActionLabel.textContent = 'Find my next move';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'preview':
        this.statusBadge.textContent = 'Image Ready';
        this.btnActionLabel.textContent = this.history.length === 0 ? 'Find my next move' : 'Check my progress';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'analysing':
        this.statusBadge.textContent = 'Analysing';
        this.busyBox.style.display = 'flex';
        this.busyLabel.textContent = 'Analysing your screenshot…';
        this.btnAction.disabled = true;
        this.btnCancel.style.display = 'inline-block';
        break;
      case 'guidance':
        this.statusBadge.textContent = `Step ${this.currentStepNumber}`;
        this.btnActionLabel.textContent = 'Check my progress';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'recovery':
        this.statusBadge.textContent = 'Correction';
        this.btnActionLabel.textContent = 'Check my progress';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'block';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'uncertain':
        this.statusBadge.textContent = 'Uncertain';
        this.btnActionLabel.textContent = 'Check again';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'block';
        this.btnCancel.style.display = 'none';
        break;
      case 'complete':
        this.statusBadge.textContent = 'Complete';
        this.btnActionLabel.textContent = 'Start new task';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.recoveryBox.style.display = 'none';
        this.uncertainBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
      case 'error':
        this.statusBadge.textContent = 'Error';
        this.btnActionLabel.textContent = 'Retry check';
        this.btnAction.disabled = false;
        this.busyBox.style.display = 'none';
        this.btnCancel.style.display = 'none';
        break;
    }

    this.canvasStepNum.textContent = String(this.currentStepNumber);
  }

  private updateBudgetDisplay(): void {
    const remaining = Math.max(0, this.maxChecks - this.checkCount);
    this.budgetChip.textContent = `${remaining} checks left`;
  }

  private showToast(message: string): void {
    this.toastNotice.textContent = message;
    this.toastNotice.style.display = 'block';
    setTimeout(() => {
      this.toastNotice.style.display = 'none';
    }, 3800);
  }
}

// Keep the public web companion behind a same-origin, HttpOnly server session.
// The access token is sent only to the sign-in endpoint and is never persisted.
window.addEventListener('DOMContentLoaded', () => {
  const gate = document.getElementById('web-auth-gate') as HTMLElement;
  const form = document.getElementById('web-auth-form') as HTMLFormElement;
  const input = document.getElementById('web-access-token') as HTMLInputElement;
  const error = document.getElementById('web-auth-error') as HTMLElement;
  const signout = document.getElementById('web-signout') as HTMLButtonElement;
  let app: MINDORAWebApp | null = null;
  const unlock = () => {
    gate.hidden = true; signout.hidden = true;
    if (!app) app = new MINDORAWebApp();
    window.dispatchEvent(new Event('mindora:authenticated'));
  };
  void fetch('/api/auth/me', { credentials: 'same-origin', cache: 'no-store' })
    .then((response) => { if (response.ok) unlock(); else gate.hidden = false; })
    .catch(() => { gate.hidden = false; });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    button.disabled = true; error.hidden = true;
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: input.value })
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
      input.value = ''; unlock();
    } catch (cause) { error.textContent = cause instanceof Error ? cause.message : 'Sign-in failed.'; error.hidden = false; }
    finally { button.disabled = false; }
  });
  signout.addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.reload();
  });
});
