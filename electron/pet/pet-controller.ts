import * as fs from 'node:fs';
import * as path from 'node:path';

export type MikoState =
  | 'idle' | 'listening' | 'thinking' | 'planning' | 'researching' | 'browsing' | 'speaking'
  | 'executing' | 'waiting' | 'success' | 'error' | 'paused'
  | 'greeting' | 'sleeping' | 'waving' | 'dancing' | 'attention';

export type PetAction = 'pause' | 'resume' | 'stop';
export type PetCharacter = 'miko' | 'nova' | 'pixel' | 'oliver' | 'pip';

export interface PetRect { x: number; y: number; width: number; height: number }
export interface PetDisplay { id: string; bounds: PetRect; workArea: PetRect }

export interface MikoSettings {
  enabled: boolean;
  alwaysOnTop: boolean;
  expanded: boolean;
  position: { x: number; y: number; displayId: string } | null;
  character?: PetCharacter;
  sizeScale?: number;
  soundsEnabled?: boolean;
  voiceEnabled?: boolean;
  voiceName?: string;
  voiceLanguage?: string;
  voiceRate?: number;
  voiceVolume?: number;
  continuousConversation?: boolean;
  pushToTalk?: boolean;
  microphoneDeviceId?: string;
  muted?: boolean;
  screenAwarenessEnabled?: boolean;
  screenObservationPaused?: boolean;
  observationIntervalSeconds?: 30 | 60 | 120;
  excludedApplications?: string[];
  proactiveEnabled?: boolean;
  doNotDisturb?: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  suggestionCooldownMinutes?: number;
  autoLockEnabled?: boolean;
  autoLockAfterSeconds?: number;
  autoLockWarningSeconds?: number;
  reducedMotion?: boolean;
  launchAtLogin?: boolean;
  showStatusBubbles?: boolean;
  animationMode?: 'full' | 'subtle';
  keepRunningWhenMainClosed?: boolean;
  dismissedSuggestionUntil?: Record<string, number>;
}

export interface MikoViewState {
  state: MikoState;
  goal: string;
  instruction: string;
  step: number;
  sessionActive: boolean;
  paused: boolean;
  settings: Pick<MikoSettings, 'expanded' | 'alwaysOnTop'> & { character: PetCharacter; sizeScale: number; screenAwarenessEnabled: boolean; screenObservationPaused: boolean; voiceEnabled: boolean; soundsEnabled: boolean; proactiveEnabled: boolean; doNotDisturb: boolean; reducedMotion: boolean; launchAtLogin: boolean; showStatusBubbles: boolean; animationMode: 'full' | 'subtle'; pushToTalk: boolean; continuousConversation: boolean };
  voice?: { voiceName: string; language: string; rate: number; volume: number };
  suggestion?: import('../companion/activity.js').AssistanceSuggestion;
  lockCountdown?: number;
}

export interface PetWindowPort {
  isVisible(): boolean;
  show(): void;
  hide(): void;
  close(): void;
  setPosition(x: number, y: number): void;
  setSize(width: number, height: number): void;
  setAlwaysOnTop(enabled: boolean): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  send(channel: string, payload: unknown): void;
  onMove(listener: (bounds: PetRect) => void): void;
  onClosed(listener: () => void): void;
}

export interface MikoPetDependencies {
  createWindow(bounds: PetRect, alwaysOnTop: boolean): PetWindowPort;
  getDisplays(): PetDisplay[];
  getPrimaryDisplay(): PetDisplay;
  getDisplayForBounds(bounds: PetRect): PetDisplay;
  readSettings(): MikoSettings;
  writeSettings(settings: MikoSettings): void;
  openMainWindow(): void;
  performAction(action: PetAction): void;
}

export const MIKO_COMPACT_SIZE = { width: 190, height: 226 } as const;
export const MIKO_EXPANDED_SIZE = { width: 258, height: 310 } as const;
export const PET_CATALOG: ReadonlyArray<{ id: PetCharacter; name: string; species: string; personality: string; color: string; asset: string; greeting: string }> = [
  { id: 'miko', name: 'MIKO', species: 'Robotic fox', personality: 'Intelligent and friendly', color: '#df8156', asset: 'miko.png', greeting: 'Ready when you are.' },
  { id: 'nova', name: 'NOVA', species: 'Space robot', personality: 'Curious and bright', color: '#75b6ce', asset: 'assets/nova.svg', greeting: 'Let’s explore this together.' },
  { id: 'pixel', name: 'PIXEL', species: 'Robot cat', personality: 'Playful and attentive', color: '#9f88ba', asset: 'assets/pixel.svg', greeting: 'I’m all ears.' },
  { id: 'oliver', name: 'OLIVER', species: 'Friendly owl', personality: 'Calm and observant', color: '#bd965e', asset: 'assets/oliver.svg', greeting: 'Take your time. I’m here.' },
  { id: 'pip', name: 'PIP', species: 'Penguin companion', personality: 'Cheerful and steady', color: '#5e9bb0', asset: 'assets/pip.svg', greeting: 'We can do this one step at a time.' }
];

export function petAssetPath(character: PetCharacter): string {
  return PET_CATALOG.find((pet) => pet.id === character)?.asset || PET_CATALOG[0].asset;
}

/** Reads only a catalogued local SVG so the isolated pet renderer can animate its vector parts inline. */
export function readPetVectorAsset(petDirectory: string, character: unknown): string | null {
  if (typeof character !== 'string') return null;
  const pet = PET_CATALOG.find((candidate) => candidate.id === character);
  if (!pet || !pet.asset.endsWith('.svg')) return null;
  const root = path.resolve(petDirectory);
  const target = path.resolve(root, pet.asset);
  if (!target.startsWith(`${root}${path.sep}`)) return null;
  const svg = fs.readFileSync(target, 'utf8');
  if (!/^\s*<svg\b/i.test(svg) || /<script\b|\son[a-z]+\s*=|javascript:/i.test(svg)) {
    throw new Error('The bundled companion vector asset failed validation.');
  }
  return svg.replace(/\sstyle="[^"]*"/gi, '');
}

export function mapCoachEventToMikoState(state: 'ready' | 'capturing' | 'analysing' | 'guidance' | 'recovery' | 'paused' | 'complete' | 'error' | 'text-only', instruction = ''): MikoState {
  switch (state) {
    case 'capturing': return 'browsing';
    case 'analysing': return /tutorial|video reference/i.test(instruction) ? 'researching' : 'thinking';
    case 'guidance': case 'text-only': return 'waiting';
    case 'recovery': return 'planning';
    case 'paused': return 'paused';
    case 'complete': return 'success';
    case 'error': return 'error';
    case 'ready': return 'idle';
  }
}

export function defaultMikoSettings(): MikoSettings {
  return {
    enabled: true, alwaysOnTop: true, expanded: false, position: null, character: 'miko', sizeScale: 1,
    soundsEnabled: false, voiceEnabled: false, voiceName: '', voiceLanguage: '', voiceRate: 1, voiceVolume: 0.8, continuousConversation: false, pushToTalk: false, microphoneDeviceId: '', muted: false, screenAwarenessEnabled: false, screenObservationPaused: false,
    observationIntervalSeconds: 60, excludedApplications: [], proactiveEnabled: false, doNotDisturb: false,
    quietHoursStart: '22:00', quietHoursEnd: '08:00', suggestionCooldownMinutes: 30,
    autoLockEnabled: false, autoLockAfterSeconds: 600, autoLockWarningSeconds: 30, reducedMotion: false, launchAtLogin: false,
    showStatusBubbles: true, animationMode: 'full', keepRunningWhenMainClosed: true, dismissedSuggestionUntil: {}
  };
}

export function normalizeMikoSettings(parsed: Partial<MikoSettings>): MikoSettings {
  const defaults = defaultMikoSettings();
  const position = parsed.position;
  const dismissed = parsed.dismissedSuggestionUntil && typeof parsed.dismissedSuggestionUntil === 'object'
    ? Object.fromEntries(Object.entries(parsed.dismissedSuggestionUntil).filter(([key, value]) => key.length <= 60 && Number.isFinite(value)).slice(0, 100)) : {};
  const interval = parsed.observationIntervalSeconds;
  return {
    ...defaults, ...parsed,
    enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
    alwaysOnTop: typeof parsed.alwaysOnTop === 'boolean' ? parsed.alwaysOnTop : true,
    expanded: typeof parsed.expanded === 'boolean' ? parsed.expanded : false,
    position: position && Number.isFinite(position.x) && Number.isFinite(position.y) && typeof position.displayId === 'string' ? { x: position.x, y: position.y, displayId: position.displayId } : null,
    character: PET_CATALOG.some((pet) => pet.id === parsed.character) ? parsed.character : 'miko',
    sizeScale: Number.isFinite(parsed.sizeScale) ? Math.max(0.65, Math.min(1.4, parsed.sizeScale!)) : 1,
    soundsEnabled: typeof parsed.soundsEnabled === 'boolean' ? parsed.soundsEnabled : false,
    voiceEnabled: typeof parsed.voiceEnabled === 'boolean' ? parsed.voiceEnabled : false,
    voiceName: typeof parsed.voiceName === 'string' ? parsed.voiceName.slice(0, 120) : '',
    voiceLanguage: typeof parsed.voiceLanguage === 'string' && /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(parsed.voiceLanguage) ? parsed.voiceLanguage : '',
    voiceRate: Number.isFinite(parsed.voiceRate) ? Math.max(0.75, Math.min(1.25, parsed.voiceRate!)) : 1,
    voiceVolume: Number.isFinite(parsed.voiceVolume) ? Math.max(0, Math.min(1, parsed.voiceVolume!)) : 0.8,
    continuousConversation: parsed.continuousConversation === true,
    pushToTalk: parsed.pushToTalk === true,
    microphoneDeviceId: typeof parsed.microphoneDeviceId === 'string' ? parsed.microphoneDeviceId.slice(0, 256) : '',
    muted: parsed.muted === true,
    screenAwarenessEnabled: typeof parsed.screenAwarenessEnabled === 'boolean' ? parsed.screenAwarenessEnabled : false,
    screenObservationPaused: typeof parsed.screenObservationPaused === 'boolean' ? parsed.screenObservationPaused : false,
    observationIntervalSeconds: interval === 30 || interval === 120 ? interval : 60,
    excludedApplications: Array.isArray(parsed.excludedApplications) ? [...new Set(parsed.excludedApplications.filter((item) => typeof item === 'string').map((item) => item.trim().slice(0, 80)).filter(Boolean))].slice(0, 30) : [],
    proactiveEnabled: typeof parsed.proactiveEnabled === 'boolean' ? parsed.proactiveEnabled : false,
    doNotDisturb: typeof parsed.doNotDisturb === 'boolean' ? parsed.doNotDisturb : false,
    quietHoursStart: /^\d{2}:\d{2}$/.test(parsed.quietHoursStart || '') ? parsed.quietHoursStart! : defaults.quietHoursStart,
    quietHoursEnd: /^\d{2}:\d{2}$/.test(parsed.quietHoursEnd || '') ? parsed.quietHoursEnd! : defaults.quietHoursEnd,
    suggestionCooldownMinutes: Number.isFinite(parsed.suggestionCooldownMinutes) ? Math.max(5, Math.min(240, parsed.suggestionCooldownMinutes!)) : 30,
    autoLockEnabled: typeof parsed.autoLockEnabled === 'boolean' ? parsed.autoLockEnabled : false,
    autoLockAfterSeconds: Number.isFinite(parsed.autoLockAfterSeconds) ? Math.max(300, Math.min(86_400, parsed.autoLockAfterSeconds!)) : 600,
    autoLockWarningSeconds: Number.isFinite(parsed.autoLockWarningSeconds) ? Math.max(30, Math.min(180, parsed.autoLockWarningSeconds!)) : 30,
    reducedMotion: typeof parsed.reducedMotion === 'boolean' ? parsed.reducedMotion : false,
    launchAtLogin: typeof parsed.launchAtLogin === 'boolean' ? parsed.launchAtLogin : false,
    showStatusBubbles: typeof parsed.showStatusBubbles === 'boolean' ? parsed.showStatusBubbles : true,
    animationMode: parsed.animationMode === 'subtle' ? 'subtle' : 'full',
    keepRunningWhenMainClosed: typeof parsed.keepRunningWhenMainClosed === 'boolean' ? parsed.keepRunningWhenMainClosed : true,
    dismissedSuggestionUntil: dismissed
  };
}

export function clampPetPosition(position: { x: number; y: number }, workArea: PetRect, size: { width: number; height: number }): { x: number; y: number } {
  const maxX = workArea.x + Math.max(0, workArea.width - size.width);
  const maxY = workArea.y + Math.max(0, workArea.height - size.height);
  return {
    x: Math.max(workArea.x, Math.min(maxX, Math.round(position.x))),
    y: Math.max(workArea.y, Math.min(maxY, Math.round(position.y)))
  };
}

export function resolveMikoPlacement(settings: MikoSettings, displays: PetDisplay[], primary: PetDisplay): PetRect {
  const baseSize = settings.expanded ? MIKO_EXPANDED_SIZE : MIKO_COMPACT_SIZE;
  const scale = Math.max(0.65, Math.min(1.4, settings.sizeScale || 1));
  const size = { width: Math.round(baseSize.width * scale), height: Math.round(baseSize.height * scale) };
  const display = settings.position
    ? displays.find((item) => item.id === settings.position?.displayId) || primary
    : primary;
  const fallbackPosition = {
    x: display.workArea.x + display.workArea.width - size.width - 28,
    y: display.workArea.y + display.workArea.height - size.height - 28
  };
  const position = clampPetPosition(settings.position || fallbackPosition, display.workArea, size);
  return { ...position, ...size };
}

export function loadMikoSettings(userDataPath: string): MikoSettings {
  const filePath = path.join(userDataPath, 'miko-settings.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<MikoSettings>;
    return normalizeMikoSettings(parsed);
  } catch {
    return defaultMikoSettings();
  }
}

export function saveMikoSettings(userDataPath: string, settings: MikoSettings): void {
  const filePath = path.join(userDataPath, 'miko-settings.json');
  fs.mkdirSync(userDataPath, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

/** Owns MIKO's window lifecycle, persisted placement, mode and truthful state payload. */
export class MikoPetController {
  private settings: MikoSettings;
  private window: PetWindowPort | null = null;
  private viewState: MikoViewState = {
    state: 'idle', goal: '', instruction: 'Ready when you are.', step: 1,
    sessionActive: false, paused: false, settings: { expanded: false, alwaysOnTop: true, character: 'miko', sizeScale: 1, screenAwarenessEnabled: false, screenObservationPaused: false, voiceEnabled: false, soundsEnabled: false, proactiveEnabled: false, doNotDisturb: false, reducedMotion: false, launchAtLogin: false, showStatusBubbles: true, animationMode: 'full', pushToTalk: false, continuousConversation: false }, voice: { voiceName: '', language: '', rate: 1, volume: 0.8 }
  };
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionId = 0;
  private captureWasVisible = false;

  constructor(private readonly dependencies: MikoPetDependencies) {
    this.settings = dependencies.readSettings();
    this.syncSettingsToView();
  }

  initialize(): void {
    if (this.settings.enabled) this.createAndShowWindow();
  }

  isEnabled(): boolean { return this.settings.enabled; }
  isAlive(): boolean { return Boolean(this.window); }
  isPaused(): boolean {
    return Boolean(this.viewState.paused || this.viewState.state === 'paused');
  }
  getPublicSettings(): MikoSettings {
    return { ...this.settings, position: this.settings.position ? { ...this.settings.position } : null, excludedApplications: [...(this.settings.excludedApplications || [])], dismissedSuggestionUntil: { ...(this.settings.dismissedSuggestionUntil || {}) } };
  }

  updatePreferences(patch: Partial<MikoSettings>): MikoSettings {
    const wasEnabled = this.settings.enabled;
    this.settings = normalizeMikoSettings({ ...this.settings, ...patch });
    this.syncSettingsToView();
    if (wasEnabled && !this.settings.enabled) this.destroyWindow();
    else if (this.settings.enabled && (!wasEnabled || !this.window)) this.createAndShowWindow();
    if (patch.alwaysOnTop !== undefined) this.window?.setAlwaysOnTop(this.settings.alwaysOnTop);
    if (patch.expanded !== undefined || patch.sizeScale !== undefined) this.resizeAndClamp();
    this.persist(); this.sync();
    return this.getPublicSettings();
  }

  setEnabled(enabled: boolean): void {
    if (this.settings.enabled === enabled) {
      if (enabled) this.createAndShowWindow();
      return;
    }
    this.settings.enabled = enabled;
    this.persist();
    if (enabled) this.createAndShowWindow();
    else this.destroyWindow();
  }

  setExpanded(expanded: boolean): void {
    if (this.settings.expanded === expanded) return;
    this.settings.expanded = expanded;
    this.viewState.settings.expanded = expanded;
    this.resizeAndClamp();
    this.persist();
    this.sync();
  }

  setAlwaysOnTop(alwaysOnTop: boolean): void {
    this.settings.alwaysOnTop = alwaysOnTop;
    this.viewState.settings.alwaysOnTop = alwaysOnTop;
    this.window?.setAlwaysOnTop(alwaysOnTop);
    this.persist();
    this.sync();
  }

  resetPosition(): MikoSettings {
    this.settings.position = null;
    this.resizeAndClamp();
    this.persist();
    this.sync();
    return this.getPublicSettings();
  }

  refreshPlacement(): void { this.resizeAndClamp(); }

  setInteractive(interactive: boolean): void {
    this.window?.setIgnoreMouseEvents(!interactive);
  }

  /** Moves from renderer drag coordinates after clamping to the display work area. */
  moveTo(screenPosition: { x: number; y: number }): void {
    if (!this.window || !Number.isFinite(screenPosition.x) || !Number.isFinite(screenPosition.y)) return;
    const display = this.dependencies.getDisplayForBounds({ x: screenPosition.x, y: screenPosition.y, width: 1, height: 1 });
    const position = clampPetPosition(screenPosition, display.workArea, this.getSize());
    this.window.setPosition(position.x, position.y);
    this.handleMove({ ...position, ...this.getSize() });
  }

  openMainWindow(): void { this.dependencies.openMainWindow(); }
  performAction(action: PetAction): void { this.dependencies.performAction(action); }

  setContext(next: Partial<MikoViewState> & { state?: MikoState }): void {
    this.transitionId++;
    this.viewState = {
      ...this.viewState,
      ...next,
      settings: { ...this.viewState.settings, ...next.settings }
    };
    this.sync();
  }

  showPlanningThenWait(context: Pick<MikoViewState, 'goal' | 'instruction' | 'step' | 'sessionActive'>): void {
    const id = ++this.transitionId;
    this.viewState = { ...this.viewState, ...context, state: 'planning', paused: false };
    this.sync();
    setTimeout(() => {
      if (this.window && id === this.transitionId && this.viewState.state === 'planning') {
        this.viewState.state = 'waiting';
        this.sync();
      }
    }, 900);
  }

  handleMove(bounds: PetRect): void {
    const display = this.dependencies.getDisplayForBounds(bounds);
    const size = this.getSize();
    const position = clampPetPosition(bounds, display.workArea, size);
    this.settings.position = { ...position, displayId: display.id };
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.persist();
    }, 240);
  }

  hideForCapture(): boolean {
    this.captureWasVisible = this.window?.isVisible() || false;
    this.window?.hide();
    return this.captureWasVisible;
  }

  restoreAfterCapture(wasVisible = this.captureWasVisible): void {
    if (wasVisible && this.settings.enabled) this.window?.show();
    this.captureWasVisible = false;
  }

  sync(): void {
    this.window?.send('miko:state', this.viewState);
  }

  shutdown(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
      this.persist();
    }
    this.destroyWindow();
  }

  private getSize(): { width: number; height: number } {
    const base = this.settings.expanded ? MIKO_EXPANDED_SIZE : MIKO_COMPACT_SIZE;
    const scale = this.settings.sizeScale || 1;
    return { width: Math.round(base.width * scale), height: Math.round(base.height * scale) };
  }

  private createAndShowWindow(): void {
    if (this.window) {
      this.window.show();
      this.sync();
      return;
    }
    const bounds = resolveMikoPlacement(this.settings, this.dependencies.getDisplays(), this.dependencies.getPrimaryDisplay());
    const window = this.dependencies.createWindow(bounds, this.settings.alwaysOnTop);
    this.window = window;
    window.onMove((movedBounds) => this.handleMove(movedBounds));
    window.onClosed(() => {
      if (this.window === window) this.window = null;
    });
    window.setIgnoreMouseEvents(true);
    window.show();
    this.sync();
  }

  private resizeAndClamp(): void {
    if (!this.window) return;
    const displays = this.dependencies.getDisplays();
    const primary = this.dependencies.getPrimaryDisplay();
    const bounds = resolveMikoPlacement(this.settings, displays, primary);
    this.window.setSize(bounds.width, bounds.height);
    this.window.setPosition(bounds.x, bounds.y);
    const display = this.settings.position ? displays.find((item) => item.id === this.settings.position?.displayId) || primary : primary;
    this.settings.position = { x: bounds.x, y: bounds.y, displayId: display.id };
  }

  private destroyWindow(): void {
    const current = this.window;
    this.window = null;
    current?.close();
  }

  private persist(): void {
    this.dependencies.writeSettings(this.settings);
  }

  private syncSettingsToView(): void {
    this.viewState.settings = {
      expanded: this.settings.expanded, alwaysOnTop: this.settings.alwaysOnTop,
      character: this.settings.character || 'miko', sizeScale: this.settings.sizeScale || 1,
      screenAwarenessEnabled: Boolean(this.settings.screenAwarenessEnabled),
      screenObservationPaused: Boolean(this.settings.screenObservationPaused), voiceEnabled: Boolean(this.settings.voiceEnabled),
      soundsEnabled: Boolean(this.settings.soundsEnabled), proactiveEnabled: Boolean(this.settings.proactiveEnabled),
      doNotDisturb: Boolean(this.settings.doNotDisturb), reducedMotion: Boolean(this.settings.reducedMotion), launchAtLogin: Boolean(this.settings.launchAtLogin),
      showStatusBubbles: this.settings.showStatusBubbles !== false, animationMode: this.settings.animationMode === 'subtle' ? 'subtle' : 'full',
      pushToTalk: Boolean(this.settings.pushToTalk), continuousConversation: Boolean(this.settings.continuousConversation)
    };
    this.viewState.voice = { voiceName: this.settings.voiceName || '', language: this.settings.voiceLanguage || '', rate: this.settings.voiceRate || 1, volume: this.settings.voiceVolume ?? 0.8 };
  }
}
