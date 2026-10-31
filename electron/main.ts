/**
 * MINDORA - AI Desktop Coach Desktop Application
 * 
 * Main Electron process managing:
 * - Launch Window (Product entry, task selection, knot-to-clear centerpiece)
 * - Active Coach Window (Draggable compact 360px paper panel)
 * - Transparent Pass-Through Overlay (Grounded Moss outlines with dark contrast stroke)
 * - Target Scoping & Calc Geometry Guard (HWND & process identity)
 * - Window Cropping & Coordinate Offset Mapping
 * - Persistent 12-Request API Budget & 5s Pacing (.api_budget.json)
 * - Secret Isolation (GEMINI_API_KEY handled exclusively in main process)
 * - Deterministic Mock UI Developer Mode (--mock-ui)
 */

import { app, BrowserWindow, desktopCapturer, globalShortcut, screen, ipcMain, nativeImage, Menu, safeStorage, powerMonitor, session, Notification, dialog } from 'electron';
import { execFile, execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { convertCapturePixelRect, DisplayBounds } from '../shared/coordinates.js';
import { resolveTargetInCapture, terminateTesseractWorker, getTesseractWorker } from './target-resolver.js';
import { getForegroundWindowInfo, getVisibleTargetWindows, isValidTargetWindow } from './window-scoping.js';
import { extractOcrCandidates } from './candidate-extractor.js';
import { queryGeminiCoach, CoachingTurnHistory } from './gemini-coach.js';
import { calculateWindowCrop } from '../shared/crop-geometry.js';
import { classifyActivity, isWithinQuietHours, matchesExcludedApplication, suggestionForActivity } from './companion/activity.js';
import { defaultApiBudget, defaultSessionBudget } from '../shared/api-budget.js';
import { analyzeTutorialVideo } from '../shared/tutorial-service.js';
import { resolveModelName } from '../shared/gemini-config.js';
import { migrateLegacyUserData as migrateUserData } from './user-data-migration.js';
import {
  MikoPetController,
  loadMikoSettings,
  saveMikoSettings,
  mapCoachEventToMikoState,
  readPetVectorAsset,
  PetWindowPort,
  PetAction
} from './pet/pet-controller.js';
import type { ActivityClassification, AssistanceSuggestion } from './companion/activity.js';
import {
  TinyFishClient,
  tinyFishClientFromEnv,
  searchWeb,
  fetchUrls,
  startResearch,
  getResearch,
  listResearch,
  cancelResearch,
  startAutomation,
  listRuns,
  getRun,
  cancelRun,
  getRunStepHtml,
  getRunStepScreenshot,
  listMonitors,
  getMonitor,
  createMonitor,
  updateMonitor,
  deleteMonitor,
  runMonitorNow,
  listProfiles,
  getProfile,
  createProfile,
  updateProfile,
  deleteProfile,
  getWallet,
  listSearchUsage,
  listFetchUsage,
  listBrowserUsage,
  ResearchHistoryStore
} from '../server/integrations/tinyfish/index.js';
import type { AutomationRequest, FetchRequest, ResearchRequest, SearchRequest } from '../server/integrations/tinyfish/types.js';
import { AgentOrchestrator, AgentPlanner, AgentTaskManager, AgentToolRegistry, createGeminiAnswerModel, createGeminiPlanModel, createTinyFishTools } from '../server/agent/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Capture the legacy location before applying the new Electron identity.
const isolatedUserDataPath = process.env.MINDORA_USER_DATA_DIR?.trim();
const legacyUserDataPath = isolatedUserDataPath ? '' : path.join(app.getPath('appData'), 'Unstuck');
app.setName('MINDORA');
app.setPath('userData', isolatedUserDataPath ? path.resolve(isolatedUserDataPath) : path.join(app.getPath('appData'), 'MINDORA'));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

function migrateLegacyUserData(): void {
  if (isolatedUserDataPath) {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    console.info('[Data Migration] Skipped legacy profile migration for isolated MINDORA_USER_DATA_DIR.');
    return;
  }
  migrateUserData({
    legacyPath: legacyUserDataPath,
    destinationPath: app.getPath('userData'),
    verifyEncryptedCredential: safeStorage.isEncryptionAvailable()
      ? (data) => { safeStorage.decryptString(data); }
      : undefined
  });
}

interface CliOptions {
  debugCapture: boolean;
  runOnce: boolean;
  testOverlay: boolean;
  coach: boolean;
  mockUi: boolean;
}

function parseCliArgs(): CliOptions {
  let debugCapture = false;
  let runOnce = false;
  let testOverlay = false;
  let coach = false;
  let mockUi = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === '--debug-capture') {
      debugCapture = true;
    } else if (arg === '--run-once') {
      runOnce = true;
    } else if (arg === '--test-overlay') {
      testOverlay = true;
    } else if (arg === '--coach') {
      coach = true;
    } else if (arg === '--mock-ui') {
      mockUi = true;
    }
  }

  return { debugCapture, runOnce, testOverlay, coach, mockUi };
}

const cliOptions = parseCliArgs();

import { getActiveApiKey, getKeyStatus, testKeyConnection, saveKey, removeKey, openExternalUrl } from './key-storage.js';

// Safe Runtime Asset Path Resolver (resolves sibling dist/electron assets in packaged and unpackaged environments)
function resolveAsset(relativePath: string): string {
  // 1. Check sibling to current __dirname (dist/electron)
  const distPath = path.resolve(__dirname, relativePath);
  if (fs.existsSync(distPath)) return distPath;

  // 2. Check app.getAppPath()
  const appPath = typeof app !== 'undefined' && app && typeof app.getAppPath === 'function' ? app.getAppPath() : __dirname;
  const inDist = path.resolve(appPath, 'dist', 'electron', relativePath);
  if (fs.existsSync(inDist)) return inDist;

  const inSrc = path.resolve(appPath, 'electron', relativePath);
  if (fs.existsSync(inSrc)) return inSrc;

  return distPath;
}

function setWindowTitle(win: BrowserWindow, title: string): void {
  win.setTitle(title);
}

function lockWindowToLocalPage(win: BrowserWindow, pagePath: string): void {
  const allowedPath = path.resolve(pagePath);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, destination) => {
    try {
      const target = path.resolve(fileURLToPath(new URL(destination)));
      if (target !== allowedPath) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
}

function monitorRendererLifecycle(win: BrowserWindow, pagePath: string, surface: string): void {
  let reloadAttempted = false;
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[MINDORA] ${surface} renderer stopped (${details.reason}; exit ${details.exitCode}).`);
    if (reloadAttempted || win.isDestroyed()) return;
    reloadAttempted = true;
    setTimeout(() => {
      if (!win.isDestroyed()) void win.loadFile(pagePath).catch(() => {
        console.error(`[MINDORA] ${surface} renderer recovery failed.`);
      });
    }, 500);
  });
}

function notifyTaskFinished(state: 'completed' | 'failed'): void {
  if ((launchWindow?.isVisible() && !launchWindow.isMinimized()) || !Notification.isSupported()) return;
  const settings = mikoPetController?.getPublicSettings();
  if (settings?.doNotDisturb || isWithinQuietHours(new Date(), settings?.quietHoursStart || '22:00', settings?.quietHoursEnd || '08:00')) return;
  try {
    const notif = new Notification({
      title: state === 'completed' ? 'MINDORA task complete' : 'MINDORA needs attention',
      body: state === 'completed' ? 'A task finished. Click here or your floating pet to review results.' : 'A task encountered a problem. Click here to review it.',
      icon: resolveAsset(path.join('assets', 'mindora.png'))
    });
    notif.on('click', () => {
      mikoPetController?.openMainWindow();
    });
    notif.show();
  } catch {
    console.warn('[MINDORA] Desktop notification could not be displayed.');
  }
}

function isLaunchRenderer(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return Boolean(launchWindow && BrowserWindow.fromWebContents(event.sender) === launchWindow);
}

function isCoachRenderer(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): boolean {
  return Boolean(coachWindow && BrowserWindow.fromWebContents(event.sender) === coachWindow);
}

const preloadPath = resolveAsset('preload.cjs');
const overlayHtmlPath = resolveAsset('overlay.html');
const launchHtmlPath = resolveAsset('launch.html');
const coachHtmlPath = resolveAsset('coach.html');
const mikoHtmlPath = resolveAsset(path.join('pet', 'pet.html'));
const mikoPreloadPath = resolveAsset(path.join('pet', 'preload.cjs'));

// Windows references
let launchWindow: BrowserWindow | null = null;
let coachWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let mikoWindow: BrowserWindow | null = null;
let mikoPetController: MikoPetController | null = null;
let tinyFishClient: TinyFishClient | null = null;
let agentOrchestrator: AgentOrchestrator | null = null;
let activeAgentTaskId: string | null = null;
let agentOwnsCoachingSession = false;
let screenAwarenessTimer: ReturnType<typeof setInterval> | null = null;
let screenObservationInFlight = false;
let lastScreenObservationAt = 0;
let activeSuggestionId: string | null = null;
let autoLockTimer: ReturnType<typeof setInterval> | null = null;
let autoLockDeadline = 0;
let autoLockCancelledUntilActivity = false;
let companionInactive = false;
let voicePermissionArmedUntil = 0;
let isQuitting = false;

// Operational State
let isInFlight = false;
let currentRequestId = 0;
let isPaused = false;
let currentStepNumber = 1;
let coachingGoal = '';
let coachingHistory: CoachingTurnHistory[] = [];
let previousInstruction: string | null = null;
let tutorialVideoUrl: string | null = null;
let tutorialStepsContext: string | null = null;
let isCoachingSessionActive = false;
let selectedTargetWindowHandle: number | null = null;

/**
 * Creates the Launch Window (1040x700 resizable)
 */
function createLaunchWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: scrW, height: scrH } = primaryDisplay.workAreaSize;

  const winW = Math.min(1040, scrW - 40);
  const winH = Math.min(700, scrH - 40);

  const win = new BrowserWindow({
    width: winW,
    height: winH,
    minWidth: 720,
    minHeight: 520,
    frame: false,
    icon: resolveAsset(path.join('assets', 'mindora.png')),
    backgroundColor: '#FAF6EF',
    center: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  lockWindowToLocalPage(win, launchHtmlPath);
  monitorRendererLifecycle(win, launchHtmlPath, 'main window');
  win.loadFile(launchHtmlPath);
  setWindowTitle(win, 'MINDORA');
  win.once('ready-to-show', () => win.show());
  win.on('close', (event) => {
    const preferences = mikoPetController?.getPublicSettings();
    if (!isQuitting && preferences?.enabled && preferences.keepRunningWhenMainClosed) {
      event.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { launchWindow = null; });
  return win;
}

/**
 * Creates the Active Coach Window (compact ~390px pastel panel)
 */
function createCoachWindow(isMockMode = false, showInactiveWhenReady = false): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const workArea = primaryDisplay.workArea;

  const margin = 20;
  const panelW = 390;
  const maxAvailableH = Math.max(380, workArea.height - margin * 2);
  const panelH = Math.min(500, maxAvailableH);

  let x = Math.max(workArea.x + margin, Math.min(workArea.x + workArea.width - panelW - margin, Math.round(workArea.x + workArea.width - panelW - margin)));
  const y = Math.max(workArea.y + margin, Math.min(workArea.y + workArea.height - panelH - margin, Math.round(workArea.y + workArea.height - panelH - margin)));
  // Keep the coach and floating companion visible together. Both windows are
  // topmost; placing both in the bottom-right corner made the coach cover MIKO.
  if (mikoWindow && !mikoWindow.isDestroyed()) {
    const petBounds = mikoWindow.getBounds();
    const petDisplay = screen.getDisplayMatching(petBounds);
    if (petDisplay.id === primaryDisplay.id) {
      const petIsOnRight = petBounds.x + petBounds.width / 2 >= workArea.x + workArea.width / 2;
      const preferredX = petIsOnRight
        ? workArea.x + margin
        : workArea.x + workArea.width - panelW - margin;
      x = Math.max(workArea.x + margin, Math.min(workArea.x + workArea.width - panelW - margin, preferredX));
    }
  }

  const win = new BrowserWindow({
    x,
    y,
    width: panelW,
    height: panelH,
    frame: false,
    icon: resolveAsset(path.join('assets', 'mindora.png')),
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  lockWindowToLocalPage(win, coachHtmlPath);
  monitorRendererLifecycle(win, coachHtmlPath, 'coach window');
  win.loadFile(coachHtmlPath);
  setWindowTitle(win, 'MINDORA Coach');

  win.once('ready-to-show', () => {
    if (showInactiveWhenReady) win.showInactive();
    else win.show();
    sendCoachUpdate({
      state: 'ready',
      goal: coachingGoal,
      budget: defaultSessionBudget.getRemaining(),
      isMockMode
    });
  });

  win.on('closed', () => { coachWindow = null; });
  return win;
}

/**
 * Creates the transparent click-through overlay window.
 */
function createOverlayWindow(): BrowserWindow {
  const primaryDisplay = screen.getPrimaryDisplay();
  const fullBounds = primaryDisplay.bounds;

  const win = new BrowserWindow({
    x: fullBounds.x,
    y: fullBounds.y,
    width: fullBounds.width,
    height: fullBounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });

  lockWindowToLocalPage(win, overlayHtmlPath);
  monitorRendererLifecycle(win, overlayHtmlPath, 'overlay');
  win.loadFile(overlayHtmlPath);
  setWindowTitle(win, 'MINDORA Overlay');
  win.on('closed', () => { overlayWindow = null; });
  return win;
}

function createMikoPetWindow(bounds: { x: number; y: number; width: number; height: number }, alwaysOnTop: boolean): PetWindowPort {
  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: mikoPreloadPath
    }
  });
  mikoWindow = win;
  win.setAlwaysOnTop(alwaysOnTop, 'floating');
  win.setIgnoreMouseEvents(true, { forward: true });
  lockWindowToLocalPage(win, mikoHtmlPath);
  monitorRendererLifecycle(win, mikoHtmlPath, 'companion');
  win.loadFile(mikoHtmlPath);
  win.setTitle('MIKO · MINDORA');
  win.once('ready-to-show', () => {
    if (mikoPetController?.isEnabled() && !win.isDestroyed()) win.showInactive();
  });

  return {
    isVisible: () => !win.isDestroyed() && win.isVisible(),
    show: () => { if (!win.isDestroyed()) win.showInactive(); },
    hide: () => { if (!win.isDestroyed()) win.hide(); },
    close: () => { if (!win.isDestroyed()) win.close(); },
    setPosition: (x, y) => { if (!win.isDestroyed()) win.setPosition(Math.round(x), Math.round(y)); },
    setSize: (width, height) => { if (!win.isDestroyed()) win.setSize(width, height); },
    setAlwaysOnTop: (enabled) => { if (!win.isDestroyed()) win.setAlwaysOnTop(enabled, 'floating'); },
    setIgnoreMouseEvents: (ignore) => { if (!win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true }); },
    send: (channel, payload) => { if (!win.isDestroyed()) win.webContents.send(channel, payload); },
    onMove: (listener) => win.on('move', () => {
      if (!win.isDestroyed()) {
        const bounds = win.getBounds();
        listener({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
      }
    }),
    onClosed: (listener) => win.on('closed', () => {
      if (mikoWindow === win) mikoWindow = null;
      listener();
    })
  };
}

/**
 * Helper to dispatch structured state updates to the Coach Window
 */
function sendCoachUpdate(data: {
  state: 'ready' | 'capturing' | 'analysing' | 'guidance' | 'recovery' | 'paused' | 'complete' | 'error' | 'text-only';
  instruction?: string;
  observation?: string;
  recovery?: string | null;
  badge?: string;
  goal?: string;
  budget?: number;
  isMockMode?: boolean;
}): void {
  if (!agentOwnsCoachingSession && (data.state === 'complete' || data.state === 'error')) notifyTaskFinished(data.state === 'complete' ? 'completed' : 'failed');
  if (mikoPetController) {
    const context = {
      goal: data.goal || coachingGoal,
      instruction: data.instruction || 'Ready when you are.',
      step: currentStepNumber,
      sessionActive: isCoachingSessionActive,
      paused: data.state === 'paused'
    };
    const state = mapCoachEventToMikoState(data.state, data.instruction || '');
    if (data.state === 'recovery') mikoPetController.showPlanningThenWait(context);
    else mikoPetController.setContext({ ...context, state, paused: state === 'paused' });
  }

  if (coachWindow && !coachWindow.isDestroyed()) {
    coachWindow.webContents.send('coach-state-update', {
      ...data,
      budget: data.budget !== undefined ? data.budget : defaultSessionBudget.getRemaining()
    });
  }
}

/**
 * Dismisses active outline and cancels pending operations.
 */
function handleDismiss(): void {
  currentRequestId++;
  console.log('[Lifecycle] Dismissal triggered: pending operations invalidated, overlay cleared.');
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }
}

/**
 * Resets coaching session state and in-memory session budget counter.
 * Note: Never resets or overwrites the persistent automated build budget in .api_budget.json.
 */
function handleSessionReset(): void {
  currentRequestId++;
  defaultSessionBudget.resetSession();
  coachingHistory = [];
  previousInstruction = null;
  tutorialVideoUrl = null;
  tutorialStepsContext = null;
  currentStepNumber = 1;
  isPaused = false;
  isCoachingSessionActive = false;
  console.log(`[SESSION RESET] Coaching session and in-memory budget reset.`);

  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }

  sendCoachUpdate({
    state: 'ready',
    instruction: 'Session reset. Focus your target application and click Check to begin.',
    observation: 'Ready for initial check.',
    budget: defaultSessionBudget.getRemaining()
  });
}

function pauseCoachingSession(): void {
  if (!isCoachingSessionActive || isPaused) return;
  isPaused = true;
  handleDismiss();
  sendCoachUpdate({ state: 'paused' });
}

function resumeCoachingSession(): void {
  if (!isCoachingSessionActive || !isPaused) return;
  isPaused = false;
  sendCoachUpdate({ state: 'ready', instruction: 'Resumed. Click Check when you are ready for another step.' });
}

function stopCoachingSession(): void {
  if (!isCoachingSessionActive) return;
  isCoachingSessionActive = false;
  isPaused = false;
  handleDismiss();
  handleSessionReset();
  if (coachWindow && !coachWindow.isDestroyed()) coachWindow.hide();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  if (launchWindow && !launchWindow.isDestroyed()) {
    launchWindow.show();
    launchWindow.focus();
    launchWindow.webContents.send('launch-state-reset');
  }
}

/**
 * Executes a single AI coaching turn on demand.
 */
async function executeCoachingTurn(): Promise<boolean> {
  if (isInFlight) {
    console.log('[AI Coach] Check already in flight; duplicate trigger blocked.');
    return false;
  }

  if (isPaused) {
    console.log('[AI Coach] Session is paused; click Resume to continue.');
    return false;
  }

  // Session budget allowance check
  const allowance = defaultSessionBudget.checkAllowance();
  if (!allowance.allowed) {
    console.warn(`[Budget Enforcement] ${allowance.reason}`);
    sendCoachUpdate({
      state: 'error',
      instruction: allowance.reason || 'Session check limit reached.',
      observation: 'Please wait or reset session (Ctrl+Alt+R).'
    });
    return false;
  }

  const apiKey = getActiveApiKey();
  if (!apiKey) {
    console.error('[AI Coach Error] No Gemini API key configured.');
    sendCoachUpdate({
      state: 'error',
      instruction: 'API Key missing. Please configure your personal Gemini API key in MINDORA.',
      observation: 'Secret isolation preserved.'
    });
    return false;
  }

  isInFlight = true;
  const requestId = ++currentRequestId;
  const turnIndex = coachingHistory.length + 1;
  const totalStartTime = performance.now();
  const mikoWasVisible = mikoPetController?.hideForCapture() || false;

  const restoreCaptureWindows = () => {
    if (coachWindow && !coachWindow.isDestroyed()) {
      coachWindow.show();
    }
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.showInactive();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
      overlayWindow.setIgnoreMouseEvents(true, { forward: true });
    }
    mikoPetController?.restoreAfterCapture(mikoWasVisible);
  };

  try {
    sendCoachUpdate({ state: 'capturing' });

    // 1. Clear previous outline and hide overlay & coach window before capture
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.webContents.send('clear-outline');
      overlayWindow.hide();
    }
    if (coachWindow && !coachWindow.isDestroyed()) {
      coachWindow.hide();
    }

    // 2. Allow DWM redraw
    await new Promise((resolve) => setTimeout(resolve, 150));

    if (requestId !== currentRequestId) {
      restoreCaptureWindows();
      return false;
    }

    // 3. Resolve the actual foreground application (or the most recent external
    // window beneath MINDORA if the user clicked the MINDORA coach to request a check).
    const selectedTarget = selectedTargetWindowHandle === null
      ? undefined
      : getVisibleTargetWindows().find((window) => window.hWnd === selectedTargetWindowHandle);
    const windowInfo = selectedTarget || getForegroundWindowInfo();
    console.log(`[Target Scoping] Active window: "${windowInfo.title}" (Process: ${windowInfo.process}, isCalc: ${windowInfo.isCalc})`);

    if (!isValidTargetWindow(windowInfo)) {
      console.warn(`[Target Scoping Guard] No valid target application in foreground.`);
      restoreCaptureWindows();
      sendCoachUpdate({
        state: 'error',
        instruction: 'Please switch to your target application and click Check again.',
        observation: `Current active window is "${windowInfo.title || 'Desktop'}" (${windowInfo.process || 'No target application'}). Focus your software to guide.`
      });
      return false;
    }

    // 4. Capture screen while coach and overlay windows remain strictly hidden
    const captureDisplay = screen.getDisplayMatching({
      x: windowInfo.bounds.left, y: windowInfo.bounds.top,
      width: Math.max(1, windowInfo.bounds.width), height: Math.max(1, windowInfo.bounds.height)
    });
    const runtimeBounds = captureDisplay.bounds;
    const scaleFactor = captureDisplay.scaleFactor;

    const captureStartTime = performance.now();
    const capturePhysicalWidth = Math.round(runtimeBounds.width * scaleFactor);
    const capturePhysicalHeight = Math.round(runtimeBounds.height * scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: {
        width: capturePhysicalWidth,
        height: capturePhysicalHeight
      }
    });

    const targetDisplayId = captureDisplay.id.toString();
    const matchedSource = sources.find((s) => s.display_id && s.display_id === targetDisplayId)
      // Electron can return an empty display_id on some Windows capture paths.
      // On a single-display system there is only one safe source to use.
      || (screen.getAllDisplays().length === 1 ? sources[0] : undefined);

    if (!matchedSource) {
      restoreCaptureWindows();
      sendCoachUpdate({
        state: 'error',
        instruction: 'Screen capture failed: Display surface detached.',
        observation: 'Session context preserved.'
      });
      return false;
    }

    const thumbnail = matchedSource.thumbnail;
    const captureDims = thumbnail.getSize();
    const fullImageBuffer = thumbnail.toPNG();
    const captureLatencyMs = performance.now() - captureStartTime;

    // 5. Restore coach & overlay windows NOW that screen capture buffer is safely in memory
    restoreCaptureWindows();

    if (captureDims.width === 0 || captureDims.height === 0 || fullImageBuffer.length === 0) {
      sendCoachUpdate({
        state: 'error',
        instruction: 'Display appears locked or asleep.',
        observation: 'Desktop capture surface returned zero bytes.'
      });
      return false;
    }

    if (requestId !== currentRequestId) return false;

    // 6. Target Region Cropping & Offset Calculation
    const cropCalc = calculateWindowCrop(windowInfo.bounds, captureDims, scaleFactor);
    let targetImageBuffer = fullImageBuffer;
    let cropOffset = { x: 0, y: 0 };

    if (cropCalc.isCropped) {
      const croppedNative = nativeImage.createFromBuffer(fullImageBuffer).crop(cropCalc.cropRect);
      targetImageBuffer = croppedNative.toPNG();
      cropOffset = { x: cropCalc.offsetX, y: cropCalc.offsetY };
      console.log(`[Target Cropping] Cropped capture to active window [${cropCalc.cropRect.width}x${cropCalc.cropRect.height}] with offset (+${cropOffset.x}, +${cropOffset.y})`);
    }

    sendCoachUpdate({ state: 'analysing' });

    // 7. Extract OCR Candidates within active window
    // The image is already cropped to the target window. Passing desktop-space
    // bounds here compares absolute coordinates against crop-local OCR boxes.
    const extraction = await extractOcrCandidates(targetImageBuffer, undefined, scaleFactor);

    // Map candidate pixel bounding boxes back to full capture pixel space
    if (cropCalc.isCropped) {
      for (const cand of extraction.candidates) {
        cand.pixelBbox.x += cropOffset.x;
        cand.pixelBbox.y += cropOffset.y;
      }
    }

    if (requestId !== currentRequestId || isPaused) return false;

    // 8. Query Gemini Coach with fresh screenshot & candidates
    const isCalcMode = windowInfo.isCalc;
    const targetAppName = windowInfo.title
      ? `${windowInfo.process || 'Unknown process'} (${windowInfo.title})`
      : `${windowInfo.process || 'Unknown process'} window (title unavailable)`;

    const result = await queryGeminiCoach({
      apiKey: apiKey,
      imageBuffer: targetImageBuffer,
      goal: coachingGoal,
      previousInstruction,
      history: coachingHistory,
      candidates: extraction.candidates,
      isCalc: isCalcMode,
      appName: targetAppName,
      tutorialSteps: tutorialStepsContext
    });

    // Record request in session budget
    defaultSessionBudget.recordRequest();

    if (requestId !== currentRequestId || isPaused) return false;

    const totalDurationMs = performance.now() - totalStartTime;

    if (!result.success || !result.guidance) {
      console.error(`[AI Coach Error] ${result.error}`);
      // Clear any stale highlight on error
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('clear-outline');
      }
      sendCoachUpdate({
        state: 'error',
        instruction: result.error || 'Temporary reasoning error.',
        observation: 'Session context preserved. Click Check to try again.'
      });
      return false;
    }

    const g = result.guidance;

    // 8. Grounded Overlay Highlight (scoped strictly to Calc; generic applications use text-only guidance)
    if (isCalcMode && result.selectedCandidate && (g.status === 'guide' || g.status === 'recover')) {
      const cand = result.selectedCandidate;
      const mappingResult = convertCapturePixelRect(
        cand.pixelBbox,
        captureDims,
        runtimeBounds,
        { x: runtimeBounds.x, y: runtimeBounds.y }
      );

      if (mappingResult.valid && overlayWindow && !overlayWindow.isDestroyed()) {
        const { overlayLocal } = mappingResult.value;
        overlayWindow.webContents.send('show-outline', {
          rect: overlayLocal,
          label: cand.text,
          isTest: false,
          autoExpireMs: 12000
        });
      }
    } else {
      if (overlayWindow && !overlayWindow.isDestroyed()) {
        overlayWindow.webContents.send('clear-outline');
      }
    }

    // 9. Update Step Progression (do not advance on repeated/unperformed actions)
    if (g.status === 'guide') {
      if (previousInstruction && g.instruction !== previousInstruction && g.assessment === 'expected') {
        currentStepNumber += 1;
      }
    }

    let badgeText = `Step ${currentStepNumber}`;
    if (g.status === 'recover') {
      badgeText = 'Correction';
    } else if (g.status === 'complete') {
      badgeText = 'Complete';
    } else if (g.status === 'uncertain') {
      badgeText = 'Uncertain';
    }

    // 10. Update Coach Window
    let mappedUiState: 'guidance' | 'recovery' | 'complete' | 'text-only' = 'guidance';
    if (g.status === 'recover') {
      mappedUiState = 'recovery';
    } else if (g.status === 'complete') {
      mappedUiState = 'complete';
    } else if (g.status === 'uncertain' || !isCalcMode || !result.selectedCandidate) {
      mappedUiState = 'text-only';
    }

    sendCoachUpdate({
      state: mappedUiState,
      instruction: g.instruction,
      observation: g.observation,
      recovery: g.reason,
      badge: badgeText
    });

    // Update session tracking
    previousInstruction = g.instruction;
    coachingHistory.push({
      turnNumber: currentStepNumber,
      instruction: g.instruction,
      assessment: g.assessment,
      status: g.status,
      selectedCandidateText: result.selectedCandidate?.text || null
    });

    return true;
  } catch (err) {
    restoreCaptureWindows();
    console.error('[AI Coach Fatal Error]', err);
    sendCoachUpdate({
      state: 'error',
      instruction: 'An unexpected error occurred during analysis.',
      observation: String(err)
    });
    return false;
  } finally {
    isInFlight = false;
  }
}

/**
 * Registers global keyboard shortcuts
 */
function registerShortcuts(): void {
  globalShortcut.register('CommandOrControl+Alt+U', () => {
    executeCoachingTurn();
  });

  globalShortcut.register('CommandOrControl+Alt+D', handleDismiss);
  globalShortcut.register('CommandOrControl+Alt+R', handleSessionReset);
  globalShortcut.register('Escape', handleDismiss);
}

// IPC Handlers
ipcMain.on('start-coaching', async (event, data: unknown) => {
  if (!isLaunchRenderer(event)) return;
  if (!data || typeof data !== 'object' || typeof (data as Record<string, unknown>).goal !== 'string' || !(data as Record<string, string>).goal.trim() || (data as Record<string, string>).goal.length > 4000) {
    console.warn('[Desktop guidance] Rejected start request without a valid task goal.');
    return;
  }
  {
    const payload = data as Record<string, unknown>;
    if (payload.targetHandle !== undefined) {
      const requestedHandle = Number(payload.targetHandle);
      const target = Number.isSafeInteger(requestedHandle)
        ? getVisibleTargetWindows().find((window) => window.hWnd === requestedHandle)
        : undefined;
      if (!target || !isValidTargetWindow(target)) {
        event.sender.send('target-selection-error', 'That application window is no longer available. Refresh the list and choose it again.');
        return;
      }
      selectedTargetWindowHandle = target.hWnd;
    } else {
      selectedTargetWindowHandle = null;
    }
    coachingGoal = (payload.goal as string).trim();
    if (typeof payload.tutorialUrl === 'string' && payload.tutorialUrl.trim().length > 0) {
      tutorialVideoUrl = payload.tutorialUrl.trim();
    } else {
      tutorialVideoUrl = null;
    }
  }

  // Invalidate previous session history, instructions, and outlines on start/restart
  currentRequestId++;
  isCoachingSessionActive = true;
  coachingHistory = [];
  previousInstruction = null;
  tutorialStepsContext = null;
  currentStepNumber = 1;
  isPaused = false;
  mikoPetController?.setContext({ state: 'listening', goal: coachingGoal, instruction: 'Listening to your goal.', step: currentStepNumber, sessionActive: true, paused: false });
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('clear-outline');
  }

  if (launchWindow && !launchWindow.isDestroyed()) {
    launchWindow.hide();
  }
  if (!coachWindow) {
    coachWindow = createCoachWindow(cliOptions.mockUi);
  } else {
    coachWindow.show();
    sendCoachUpdate({
      state: 'ready',
      instruction: `Goal: "${coachingGoal.slice(0, 80)}". Focus your application and click Check to begin.`,
      observation: 'Ready for initial check.',
      budget: defaultSessionBudget.getRemaining(),
      goal: coachingGoal
    });
  }
  if (!overlayWindow) {
    overlayWindow = createOverlayWindow();
  } else {
    overlayWindow.showInactive();
  }

  // If a tutorial video URL was provided, analyze it once in session
  const activeKey = getActiveApiKey();
  if (tutorialVideoUrl && activeKey) {
    sendCoachUpdate({
      state: 'analysing',
      instruction: 'Analyzing tutorial video steps...',
      observation: 'Extracting reference sequence from provided tutorial URL.',
      goal: coachingGoal
    });

    const tutorialRes = await analyzeTutorialVideo({
      url: tutorialVideoUrl,
      goal: coachingGoal,
      apiKey: activeKey,
      model: resolveModelName()
    });

    if (tutorialRes.supported && tutorialRes.stepsSummary) {
      tutorialStepsContext = tutorialRes.stepsSummary;
      sendCoachUpdate({
        state: 'ready',
        instruction: 'Tutorial reference extracted. Focus your application and click Check to begin.',
        observation: 'Tutorial video steps available as session guidance context.',
        goal: coachingGoal
      });
    } else {
      tutorialStepsContext = null;
      sendCoachUpdate({
        state: 'ready',
        instruction: tutorialRes.error || 'Tutorial video unavailable. Continuing with screenshot-only guidance.',
        observation: 'Focus your application and click Check to begin.',
        goal: coachingGoal
      });
    }
  }
});

ipcMain.handle('get-target-info', async (event) => {
  if (!isLaunchRenderer(event)) return null;
  if (selectedTargetWindowHandle !== null) {
    const selected = getVisibleTargetWindows().find((window) => window.hWnd === selectedTargetWindowHandle);
    if (selected) return selected;
  }
  return getForegroundWindowInfo();
});

ipcMain.handle('get-target-applications', async (event) => {
  if (!isLaunchRenderer(event)) return [];
  return getVisibleTargetWindows().map(({ hWnd, title, process, isCalc }) => ({ hWnd, title, process, isCalc }));
});

ipcMain.handle('get-miko-settings', async (event) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow) return null;
  return mikoPetController?.getPublicSettings() || { enabled: false, alwaysOnTop: true };
});

ipcMain.handle('set-miko-enabled', async (event, enabled: unknown) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow || typeof enabled !== 'boolean') return null;
  mikoPetController?.setEnabled(enabled);
  return mikoPetController?.getPublicSettings() || null;
});

ipcMain.handle('set-miko-always-on-top', async (event, enabled: unknown) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow || typeof enabled !== 'boolean') return null;
  mikoPetController?.setAlwaysOnTop(enabled);
  return mikoPetController?.getPublicSettings() || null;
});

const companionPreferenceKeys = new Set([
  'character', 'sizeScale', 'soundsEnabled', 'voiceEnabled', 'voiceName', 'voiceLanguage', 'voiceRate', 'voiceVolume', 'continuousConversation', 'pushToTalk', 'microphoneDeviceId', 'muted',
  'screenAwarenessEnabled', 'screenObservationPaused', 'observationIntervalSeconds', 'excludedApplications',
  'proactiveEnabled', 'doNotDisturb', 'quietHoursStart', 'quietHoursEnd', 'suggestionCooldownMinutes',
  'autoLockEnabled', 'autoLockAfterSeconds', 'autoLockWarningSeconds', 'reducedMotion', 'launchAtLogin',
  'showStatusBubbles', 'animationMode', 'keepRunningWhenMainClosed'
]);

ipcMain.handle('set-companion-settings', (event, patch: unknown) => {
  if (!isLaunchRenderer(event) || !patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const safePatch = Object.fromEntries(Object.entries(patch as Record<string, unknown>).filter(([key]) => companionPreferenceKeys.has(key)));
  const updated = mikoPetController?.updatePreferences(safePatch);
  if (safePatch.launchAtLogin !== undefined && typeof safePatch.launchAtLogin === 'boolean') {
    app.setLoginItemSettings({ openAtLogin: safePatch.launchAtLogin });
  }
  if (safePatch.proactiveEnabled === false || safePatch.doNotDisturb === true || safePatch.screenAwarenessEnabled === false) {
    activeSuggestionId = null;
    mikoPetController?.setContext({ suggestion: undefined });
  }
  return updated;
});

ipcMain.handle('reset-miko-position', (event) => {
  if (!isLaunchRenderer(event)) return null;
  return mikoPetController?.resetPosition() || null;
});

ipcMain.on('miko:ready', (event) => {
  if (mikoWindow && BrowserWindow.fromWebContents(event.sender) === mikoWindow) mikoPetController?.sync();
});

ipcMain.on('miko:set-interactive', (event, interactive: unknown) => {
  if (mikoWindow && BrowserWindow.fromWebContents(event.sender) === mikoWindow && typeof interactive === 'boolean') mikoPetController?.setInteractive(interactive);
});

ipcMain.on('miko:open-main', (event) => {
  if (mikoWindow && BrowserWindow.fromWebContents(event.sender) === mikoWindow) mikoPetController?.openMainWindow();
});

ipcMain.handle('miko:load-character-svg', (event, character: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow) throw new Error('Companion assets are only available to the MINDORA pet window.');
  return readPetVectorAsset(path.join(__dirname, 'pet'), character);
});

function openLaunchTaskView(): void {
  if (!launchWindow || launchWindow.isDestroyed()) launchWindow = createLaunchWindow();
  if (launchWindow.isMinimized()) launchWindow.restore();
  launchWindow.show();
  launchWindow.focus();
  const send = () => launchWindow?.webContents.send('open-task-page');
  if (launchWindow.webContents.isLoading()) launchWindow.webContents.once('did-finish-load', send);
  else send();
}

ipcMain.on('miko:open-expanded-task-view', (event) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow) return;
  openLaunchTaskView();
});

ipcMain.on('miko:drag-to', (event, x: unknown, y: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow || typeof x !== 'number' || typeof y !== 'number') return;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  mikoPetController?.moveTo({ x, y });
});

ipcMain.on('miko:context-menu', (event) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow) return;
  const settings = mikoPetController?.getPublicSettings();
  if (!settings) return;
  const isPausedState = Boolean(mikoPetController?.isPaused() || isPaused);
  const menu = Menu.buildFromTemplate([
    { label: 'Open MINDORA', click: () => mikoPetController?.openMainWindow() },
    { label: 'Chat with MINDORA', click: () => mikoWindow?.webContents.send('miko:command', 'chat') },
    { label: 'Start voice conversation', enabled: Boolean(settings.voiceEnabled), click: () => mikoWindow?.webContents.send('miko:command', 'voice') },
    { type: 'separator' },
    { label: 'Change pet', submenu: ['miko', 'nova', 'pixel', 'oliver', 'pip'].map((character) => ({
      label: ({ miko: 'MIKO — robotic fox', nova: 'NOVA — space robot', pixel: 'PIXEL — robot cat', oliver: 'OLIVER — owl', pip: 'PIP — penguin' } as Record<string, string>)[character],
      type: 'radio', checked: settings.character === character,
      click: () => mikoPetController?.updatePreferences({ character: character as 'miko' | 'nova' | 'pixel' | 'oliver' | 'pip' })
    })) },
    { label: isPausedState ? 'Resume' : 'Pause', click: () => mikoPetController?.performAction(isPausedState ? 'resume' : 'pause') },
    { label: 'Settings', click: () => {
      if (!launchWindow || launchWindow.isDestroyed()) launchWindow = createLaunchWindow();
      if (launchWindow.isMinimized()) launchWindow.restore();
      launchWindow.show(); launchWindow.focus();
      const send = () => launchWindow?.webContents.send('open-settings-page');
      if (launchWindow.webContents.isLoading()) launchWindow.webContents.once('did-finish-load', send); else send();
    } },
    { type: 'separator' },
    { label: 'Hide companion', click: () => mikoWindow?.hide() },
    { label: 'Exit MINDORA', click: () => app.quit() }
  ]);
  menu.popup({ window: mikoWindow });
});

ipcMain.handle('miko:chat', async (event, text: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow) throw new Error('Chat is only available from the MINDORA companion.');
  if (typeof text !== 'string' || !text.trim() || text.length > 4000) throw new Error('Enter a request under 4,000 characters.');
  try {
    const task = getAgentOrchestrator().startTask(text.trim());
    activeAgentTaskId = task.id;
    return { taskId: task.id, response: task.plan?.summary || 'Task planned. MINDORA is starting the approved workflow.' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'MINDORA could not start this request.';
    return { error: sanitizeAgentText(message) };
  }
});

ipcMain.on('miko:suggestion:accept', (event, suggestion: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow || !suggestion || typeof suggestion !== 'object') return;
  const item = suggestion as { message?: unknown; category?: unknown; id?: unknown };
  if (typeof item.message !== 'string' || typeof item.category !== 'string' || typeof item.id !== 'string' || item.id !== activeSuggestionId || !['coding', 'debugging', 'research', 'browsing', 'writing', 'studying', 'design'].includes(item.category)) return;
  const request = item.message.slice(0, 500);
  const settings = mikoPetController?.getPublicSettings();
  if (settings) mikoPetController?.updatePreferences({ dismissedSuggestionUntil: { ...settings.dismissedSuggestionUntil, [item.category]: Date.now() + (settings.suggestionCooldownMinutes || 30) * 60_000 } });
  activeSuggestionId = item.id;
  mikoPetController?.setContext({ suggestion: undefined });
  if (!launchWindow || launchWindow.isDestroyed()) launchWindow = createLaunchWindow();
  launchWindow.show(); launchWindow.focus();
  if (launchWindow.webContents.isLoading()) launchWindow.webContents.once('did-finish-load', () => launchWindow?.webContents.send('prefill-task-request', request));
  else launchWindow.webContents.send('prefill-task-request', request);
});

ipcMain.on('miko:suggestion:dismiss', (event, suggestion: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow || !suggestion || typeof suggestion !== 'object') return;
  const item = suggestion as { id?: unknown; category?: unknown };
  if (typeof item.id !== 'string' || item.id !== activeSuggestionId || typeof item.category !== 'string' || !['coding', 'debugging', 'research', 'browsing', 'writing', 'studying', 'design'].includes(item.category)) return;
  const settings = mikoPetController?.getPublicSettings();
  if (!settings) return;
  const until = Date.now() + (settings.suggestionCooldownMinutes || 30) * 60_000;
  mikoPetController?.updatePreferences({ dismissedSuggestionUntil: { ...settings.dismissedSuggestionUntil, [item.category]: until } });
  activeSuggestionId = null;
  mikoPetController?.setContext({ suggestion: undefined });
});

ipcMain.on('miko:lock:cancel', (event) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow) return;
  autoLockCancelledUntilActivity = true;
  autoLockDeadline = 0;
  mikoPetController?.setContext({ lockCountdown: undefined });
});

ipcMain.handle('miko:voice:permission', (event) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow || !mikoPetController?.getPublicSettings().voiceEnabled) return false;
  if (process.platform === 'win32' && !app.getPath('userData')) return false;
  voicePermissionArmedUntil = Date.now() + 15_000;
  return true;
});

ipcMain.on('miko:voice:text', (event, text: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow || !mikoPetController?.getPublicSettings().voiceEnabled || typeof text !== 'string') return;
  const request = text.trim().slice(0, 1000);
  mikoWindow.webContents.send('miko:voice:transcript', request);
  if (!request) return;
  if (activeAgentTaskId && agentOrchestrator) {
    const active = agentOrchestrator.getTask(activeAgentTaskId);
    if (active && !['completed', 'failed', 'cancelled'].includes(active.state)) {
      mikoPetController?.setContext({ state: 'error', instruction: 'Finish or cancel the active task before sending a follow-up voice request.' });
      return;
    }
  }
  try {
    const started = getAgentOrchestrator().startTask(request);
    activeAgentTaskId = started.id;
    mikoPetController?.setContext({ state: 'thinking', goal: request.slice(0, 180), instruction: 'I heard you. I’m working on that now.', sessionActive: true });
    return;
  } catch (error) {
    mikoPetController?.setContext({ state: 'error', instruction: sanitizeAgentText(error instanceof Error ? error.message : 'Voice request could not be sent.') });
  }
  if (!launchWindow || launchWindow.isDestroyed()) launchWindow = createLaunchWindow();
  launchWindow.show(); launchWindow.focus();
  if (launchWindow.webContents.isLoading()) launchWindow.webContents.once('did-finish-load', () => launchWindow?.webContents.send('prefill-task-request', request));
  else launchWindow.webContents.send('prefill-task-request', request);
});

ipcMain.on('miko:voice:state', (event, state: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow || !mikoPetController?.getPublicSettings().voiceEnabled) return;
  if (!['idle', 'listening', 'thinking', 'speaking', 'error'].includes(String(state))) return;
  if (state === 'idle' && (isCoachingSessionActive || activeAgentTaskId)) return;
  mikoPetController.setContext({ state: state as import('./pet/pet-controller.js').MikoState, instruction: state === 'listening' ? 'Listening. Say your request, then pause when you are finished.' : state === 'speaking' ? 'Speaking a response. Tap Stop to interrupt.' : state === 'idle' ? 'Ready when you are.' : undefined });
});

ipcMain.on('miko:action', (event, action: unknown) => {
  if (!mikoWindow || BrowserWindow.fromWebContents(event.sender) !== mikoWindow) return;
  const activeTask = activeAgentTaskId ? agentOrchestrator?.getTask(activeAgentTaskId) : undefined;
  if (activeTask && !['completed', 'failed', 'cancelled'].includes(activeTask.state)) {
    if (action === 'pause') agentOrchestrator?.pause(activeTask.id);
    else if (action === 'resume') agentOrchestrator?.resume(activeTask.id);
    else if (action === 'stop') agentOrchestrator?.cancel(activeTask.id);
    return;
  }
  if (action === 'pause') pauseCoachingSession();
  else if (action === 'resume') resumeCoachingSession();
  else if (action === 'stop') stopCoachingSession();
});

function getTinyFishCredential(): string {
  const inherited = process.env.TINYFISH_API_KEY?.trim();
  if (inherited) return inherited;
  if (process.platform !== 'win32') return '';
  try {
    // Explorer can retain an older environment after a user adds the key. Read the
    // current user's environment value inside the trusted main process only.
    const output = execFileSync('reg.exe', ['query', 'HKCU\\Environment', '/v', 'TINYFISH_API_KEY'], {
      encoding: 'utf8', windowsHide: true, timeout: 1500, stdio: ['ignore', 'pipe', 'ignore']
    });
    const row = output.split(/\r?\n/).find((line) => /\bREG_(?:SZ|EXPAND_SZ)\b/.test(line));
    return row?.replace(/^.*?\bREG_(?:SZ|EXPAND_SZ)\s+/, '').trim() || '';
  } catch {
    return '';
  }
}

function getTinyFish(): TinyFishClient {
  if (!tinyFishClient) {
    const apiKey = getTinyFishCredential();
    tinyFishClient = tinyFishClientFromEnv({ ...process.env, TINYFISH_API_KEY: apiKey });
  }
  return tinyFishClient;
}

function getResearchHistory(): ResearchHistoryStore {
  return new ResearchHistoryStore(path.join(app.getPath('userData'), 'tinyfish-research-history.json'));
}

function broadcastCompanionActivity(payload: { category: string; confidence: number; evidence: string[]; capturedAt: number; status: string }): void {
  if (mikoWindow && !mikoWindow.isDestroyed()) mikoWindow.webContents.send('miko:activity', payload);
  if (launchWindow && !launchWindow.isDestroyed()) launchWindow.webContents.send('companion-activity-update', payload);
}

async function observeForegroundLocally(): Promise<void> {
  if (process.platform !== 'win32' || screenObservationInFlight || isCoachingSessionActive || activeAgentTaskId) return;
  const settings = mikoPetController?.getPublicSettings();
  if (!settings?.enabled || !settings.screenAwarenessEnabled || settings.screenObservationPaused) return;
  const intervalMs = (settings.observationIntervalSeconds || 60) * 1000;
  if (Date.now() - lastScreenObservationAt < intervalMs) return;
  screenObservationInFlight = true;
  lastScreenObservationAt = Date.now();
  let activeWindowVisible = false;
  let coachVisible = false;
  let overlayVisible = false;
  try {
    const info = getForegroundWindowInfo();
    if (!info || !info.process || /^(electron|mindora|unstuck|explorer)$/i.test(info.process) || matchesExcludedApplication(info.process, settings.excludedApplications || [])) {
      broadcastCompanionActivity({ category: 'idle_unknown', confidence: 0, evidence: ['Screen observation skipped for this application.'], capturedAt: Date.now(), status: 'skipped' });
      return;
    }
    if (powerMonitor.getSystemIdleTime() >= 10) return;
    activeWindowVisible = Boolean(launchWindow?.isVisible());
    coachVisible = Boolean(coachWindow?.isVisible());
    overlayVisible = Boolean(overlayWindow?.isVisible());
    launchWindow?.hide(); coachWindow?.hide(); overlayWindow?.hide();
    const petWasVisible = mikoPetController?.hideForCapture() || false;
    try {
      await new Promise((resolve) => setTimeout(resolve, 150));
      const display = screen.getDisplayMatching({ x: info.bounds.left, y: info.bounds.top, width: info.bounds.width, height: info.bounds.height });
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: display.size.width, height: display.size.height }, fetchWindowIcons: false });
      const source = sources.find((item) => item.display_id === String(display.id)) || sources[0];
      if (!source || source.thumbnail.isEmpty()) return;
      const buffer = source.thumbnail.toPNG();
      const worker = await getTesseractWorker();
      const recognized = await worker.recognize(buffer, {}, { blocks: true });
      const words: string[] = [];
      for (const block of recognized.data.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
        for (const word of line.words || []) if (word.text && word.confidence >= 50) words.push(word.text);
      }
      const classification = classifyActivity({ process: info.process, title: info.title || '', text: words.join(' ').slice(0, 4000) });
      const payload = { category: classification.category, confidence: classification.confidence, evidence: classification.evidence, capturedAt: Date.now(), status: 'observed' };
      broadcastCompanionActivity(payload);
      if (classification.sensitive || classification.privateWindow || !suggestionForActivity(classification)) {
        activeSuggestionId = null;
        mikoPetController?.setContext({ suggestion: undefined });
      } else maybeOfferAssistance(classification);
      // Screenshot and OCR are ephemeral: do not write, log, or send either to a provider.
    } finally {
      mikoPetController?.restoreAfterCapture(petWasVisible);
      if (activeWindowVisible && launchWindow && !launchWindow.isDestroyed()) launchWindow.showInactive();
      if (coachVisible && coachWindow && !coachWindow.isDestroyed()) coachWindow.showInactive();
      if (overlayVisible && overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.showInactive();
    }
  } catch {
    broadcastCompanionActivity({ category: 'idle_unknown', confidence: 0, evidence: ['Local screen observation could not complete.'], capturedAt: Date.now(), status: 'error' });
  } finally {
    screenObservationInFlight = false;
  }
}

function maybeOfferAssistance(classification: ActivityClassification): void {
  const settings = mikoPetController?.getPublicSettings();
  if (!settings?.proactiveEnabled || settings.doNotDisturb || isWithinQuietHours(new Date(), settings.quietHoursStart || '22:00', settings.quietHoursEnd || '08:00')) return;
  const suggestion = suggestionForActivity(classification);
  if (!suggestion || (settings.dismissedSuggestionUntil?.[suggestion.category] || 0) > Date.now() || suggestion.id === activeSuggestionId) return;
  activeSuggestionId = suggestion.id;
  mikoPetController?.setContext({ suggestion });
  if (mikoWindow && !mikoWindow.isDestroyed()) mikoWindow.webContents.send('miko:suggestion', suggestion);
}

function startCompanionTimers(): void {
  if (screenAwarenessTimer) clearInterval(screenAwarenessTimer);
  screenAwarenessTimer = setInterval(() => { void observeForegroundLocally(); }, 3000);
  if (autoLockTimer) clearInterval(autoLockTimer);
  autoLockTimer = setInterval(() => {
    const settings = mikoPetController?.getPublicSettings();
    if (!settings?.enabled || !mikoWindow?.isVisible()) { autoLockDeadline = 0; mikoPetController?.setContext({ lockCountdown: undefined }); return; }
    let idle = 0;
    try { idle = powerMonitor.getSystemIdleTime(); } catch { return; }
    if (process.platform !== 'win32' || !settings.autoLockEnabled) {
      autoLockDeadline = 0;
      if (mikoPetController) mikoPetController.setContext({ lockCountdown: undefined });
    }
    if (isCoachingSessionActive || activeAgentTaskId) {
      autoLockDeadline = 0;
      companionInactive = false;
      mikoPetController?.setContext({ lockCountdown: undefined });
      return;
    }
    if (idle < 10) {
      autoLockDeadline = 0;
      autoLockCancelledUntilActivity = false;
      if (companionInactive) mikoPetController?.setContext({ state: 'idle', instruction: 'Ready when you are.' });
      companionInactive = false;
    } else if (idle >= 10 && !isCoachingSessionActive && !activeAgentTaskId) {
      const petSettings = mikoPetController?.getPublicSettings();
      // Ten seconds of real OS inactivity changes only the companion's pose.
      if (idle >= 10 && !autoLockCancelledUntilActivity && process.platform === 'win32' && petSettings?.autoLockEnabled) {
        const lockAt = (petSettings.autoLockAfterSeconds || 600) - (petSettings.autoLockWarningSeconds || 30);
        if (idle >= lockAt && !autoLockDeadline) autoLockDeadline = Date.now() + (petSettings.autoLockWarningSeconds || 30) * 1000;
        if (autoLockDeadline) {
          const secondsLeft = Math.max(0, Math.ceil((autoLockDeadline - Date.now()) / 1000));
          mikoPetController?.setContext({ lockCountdown: secondsLeft });
          if (secondsLeft <= 0) {
            autoLockDeadline = 0;
            autoLockCancelledUntilActivity = true;
            mikoPetController?.setContext({ lockCountdown: undefined });
            execFile('rundll32.exe', ['user32.dll,LockWorkStation'], { windowsHide: true }, () => undefined);
          }
        }
      }
      if (idle >= 10 && !companionInactive) mikoPetController?.setContext({ state: 'idle', instruction: 'Taking a quiet moment.' });
      companionInactive = true;
    }
  }, 1000);
}

function sanitizeAgentText(value: string): string {
  return value.replace(/AIza[\w-]{20,}/g, '[redacted credential]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:key|token|password|secret|signature|sig|auth)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(password|passcode|api[_ -]?key|secret|token)\s*(?:is|[:=])\s*[^\s,;]+/gi, '$1=[redacted]');
}

function publicAgentTask(task: import('../server/agent/execution-state.js').AgentTaskRecord): Record<string, unknown> {
  return {
    id: task.id, task: '[task details hidden]', state: task.state, createdAt: task.createdAt, updatedAt: task.updatedAt,
    ...(task.plan ? { plan: { summary: sanitizeAgentText(task.plan.summary), steps: task.plan.steps.map(({ input: _input, ...step }) => ({ ...step, title: sanitizeAgentText(step.title) })) } } : {}),
    steps: task.steps.map(({ input: _input, output: _output, ...step }) => ({ ...step, title: sanitizeAgentText(step.title), error: step.error ? sanitizeAgentText(step.error) : undefined })),
    evidence: task.evidence.map((item) => ({ ...item, source: sanitizeAgentText(item.source), title: item.title ? sanitizeAgentText(item.title) : undefined, url: item.url ? sanitizeAgentText(item.url) : undefined, detail: item.detail ? sanitizeAgentText(item.detail) : undefined })),
    logs: task.logs.map((entry) => ({ ...entry, message: sanitizeAgentText(entry.message) })),
    ...(task.response ? { response: sanitizeAgentText(task.response) } : {}), ...(task.error ? { error: sanitizeAgentText(task.error) } : {})
  };
}

async function observeDesktopForAgent(taskId: string, signal: AbortSignal): Promise<import('../server/agent/execution-state.js').AgentToolResult> {
  const task = agentOrchestrator?.getTask(taskId);
  const goal = task?.task?.trim();
  if (!goal) throw new Error('The agent task is unavailable for desktop observation.');
  if (isCoachingSessionActive && coachingGoal !== goal) throw new Error('Stop the active desktop coaching session before observing a different agent task.');
  if (!isCoachingSessionActive) {
    handleSessionReset();
    coachingGoal = goal;
    isCoachingSessionActive = true;
    agentOwnsCoachingSession = true;
    isPaused = false;
    currentStepNumber = 1;
    if (launchWindow && !launchWindow.isDestroyed()) launchWindow.hide();
    if (!coachWindow) coachWindow = createCoachWindow(cliOptions.mockUi, true);
    else coachWindow.showInactive();
    if (!overlayWindow) overlayWindow = createOverlayWindow();
    else overlayWindow.showInactive();
    mikoPetController?.setContext({ state: 'listening', goal: goal.slice(0, 180), instruction: 'Focus the desktop app you want MINDORA to observe.', step: 1, sessionActive: true, paused: false });
    sendCoachUpdate({ state: 'ready', goal, instruction: 'Focus your target app. MINDORA will observe it for this agent step.', observation: 'Desktop observation is limited to a user-triggered screen check.' });
  }
  if (signal.aborted) throw signal.reason || new Error('Desktop observation cancelled.');
  const abort = () => handleDismiss();
  signal.addEventListener('abort', abort, { once: true });
  try {
    if (launchWindow && !launchWindow.isDestroyed()) launchWindow.hide();
    const succeeded = await executeCoachingTurn();
    if (!succeeded) throw new Error('Desktop observation did not produce validated guidance. Focus the target application and try again.');
    const turn = coachingHistory[coachingHistory.length - 1];
    if (!turn) throw new Error('Desktop observation returned no validated coaching result.');
    const detail = `${turn.status}: ${turn.instruction}`;
    return {
      output: { status: turn.status, instruction: turn.instruction, assessment: turn.assessment, selectedCandidateText: turn.selectedCandidateText },
      needsUserAction: turn.status !== 'complete',
      evidence: [{ id: `${taskId}:desktop:${turn.turnNumber}`, type: 'desktop_observation', source: 'MINDORA desktop screenshot observation (Gemini and OCR)', title: `Observed desktop step ${turn.turnNumber}`, detail }]
    };
  } finally { signal.removeEventListener('abort', abort); }
}

function getAgentOrchestrator(): AgentOrchestrator {
  if (agentOrchestrator) return agentOrchestrator;
  const geminiKey = getActiveApiKey();
  if (!geminiKey) throw new Error('Configure a Gemini API key before starting an agent task.');
  const tools = new AgentToolRegistry();
  if (getTinyFishCredential()) {
    for (const tool of createTinyFishTools(getTinyFish()).list()) tools.register(tool);
  }
  tools.register({
    id: 'desktop.observe', capability: 'read', maxAttempts: 1,
    description: 'Use MINDORA Gemini and OCR to observe a fresh screenshot of the user-selected foreground desktop application and return grounded guidance. It does not click or type.',
    execute: (_input, context) => observeDesktopForAgent(context.taskId, context.signal)
  });
  agentOrchestrator = new AgentOrchestrator({
    planner: new AgentPlanner(createGeminiPlanModel(geminiKey), tools),
    answerModel: createGeminiAnswerModel(geminiKey),
    tools,
    tasks: new AgentTaskManager(100, undefined, path.join(app.getPath('userData'), 'agent-task-history.json'))
  });
  agentOrchestrator.events.subscribe((event) => {
    const publicEvent = { ...event, task: publicAgentTask(event.task) };
      if (launchWindow && !launchWindow.isDestroyed()) launchWindow.webContents.send('agent-task-event', publicEvent);
      if (mikoWindow && !mikoWindow.isDestroyed()) mikoWindow.webContents.send('miko:task-event', { task: publicAgentTask(event.task), type: event.type, message: event.message });
    if (event.type === 'task_created') activeAgentTaskId = event.taskId;
    if (event.taskId === activeAgentTaskId) {
      const task = event.task;
      const activeStep = task.steps.find((step) => step.state === 'running' || step.state === 'awaiting_approval' || step.state === 'retrying');
      let state: import('./pet/pet-controller.js').MikoState = 'idle';
      switch (task.state) {
        case 'created': state = 'listening'; break;
        case 'planning': case 'ready': state = 'planning'; break;
        case 'awaiting_approval': state = 'attention'; break;
        case 'running': state = 'executing'; break;
        case 'waiting_for_tool': state = activeStep?.tool === 'tinyfish.research' ? 'researching' : activeStep?.tool === 'desktop.observe' ? 'listening' : 'browsing'; break;
        case 'paused': state = 'paused'; break;
        case 'completed': state = 'success'; break;
        case 'failed': state = 'error'; break;
        case 'cancelled': state = 'idle'; break;
      }
      const completedSteps = task.steps.filter((step) => step.state === 'completed').length;
      mikoPetController?.setContext({
        state, goal: sanitizeAgentText(task.plan?.summary.slice(0, 180) || 'Working with MINDORA'), instruction: sanitizeAgentText(event.message || task.error || task.response || task.plan?.summary || 'Working on your task.'),
        step: Math.min(task.steps.length || 1, completedSteps + 1), sessionActive: !['completed', 'failed', 'cancelled'].includes(task.state),
        paused: task.state === 'paused'
      });
      if (['completed', 'failed', 'cancelled'].includes(task.state)) {
        if (task.state === 'completed' || task.state === 'failed') notifyTaskFinished(task.state);
        activeAgentTaskId = null;
        if (agentOwnsCoachingSession) {
          isCoachingSessionActive = false;
          isPaused = false;
          agentOwnsCoachingSession = false;
          coachWindow?.hide();
          overlayWindow?.hide();
        }
        if (launchWindow && !launchWindow.isDestroyed()) { launchWindow.show(); launchWindow.focus(); }
      }
    }
  });
  return agentOrchestrator;
}

function isTrustedTinyFishRenderer(event: Electron.IpcMainInvokeEvent): boolean {
  const window = BrowserWindow.fromWebContents(event.sender);
  return Boolean(window && (window === launchWindow || window === coachWindow));
}

function removeRunAccessUrls(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const run = { ...(value as Record<string, unknown>) };
  delete run.streaming_url;
  delete run.video_url;
  if (Array.isArray(run.steps)) {
    run.steps = run.steps.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const step = { ...(item as Record<string, unknown>) };
      step.screenshot_available = Boolean(step.screenshot);
      step.html_available = Boolean(step.html);
      delete step.screenshot;
      delete step.html;
      return step;
    });
  }
  return run;
}

function registerTinyFishHandler<TArgs extends unknown[], TResult>(channel: string, handler: (...args: TArgs) => TResult | Promise<TResult>): void {
  ipcMain.handle(channel, async (event, ...args: unknown[]) => {
    if (!isTrustedTinyFishRenderer(event)) throw new Error('TinyFish access is limited to MINDORA windows.');
    return handler(...args as TArgs);
  });
}

async function approveMeteredTinyFish(event: Electron.IpcMainInvokeEvent, title: string, detail: string): Promise<boolean> {
  const owner = BrowserWindow.fromWebContents(event.sender);
  if (!owner || owner.isDestroyed()) return false;
  const result = await dialog.showMessageBox(owner, {
    type: 'warning', title, message: title, detail,
    buttons: ['Cancel', 'Approve and continue'], defaultId: 0, cancelId: 0, noLink: true
  });
  return result.response === 1;
}

// TinyFish credentials remain in the main process. IPC forwards narrowly typed requests only.
registerTinyFishHandler<[SearchRequest], unknown>('tinyfish:search', (request) => searchWeb(getTinyFish(), request));
ipcMain.handle('tinyfish:search:connection', async (event) => {
  if (!isTrustedTinyFishRenderer(event)) throw new Error('TinyFish access is limited to MINDORA windows.');
  // Search is TinyFish's free read-only API (12,000 requests/day per current docs).
  return searchWeb(getTinyFish(), { query: 'MINDORA personal AI desktop application' });
});
registerTinyFishHandler<[FetchRequest], unknown>('tinyfish:fetch', (request) => fetchUrls(getTinyFish(), request));
ipcMain.handle('tinyfish:research:start', async (event, request: ResearchRequest) => {
  if (!isTrustedTinyFishRenderer(event)) throw new Error('TinyFish access is limited to MINDORA windows.');
  if (!request || typeof request.query !== 'string' || request.query.length > 10000) throw new Error('Invalid research request.');
  if (!await approveMeteredTinyFish(event, 'Approve paid TinyFish research?', 'TinyFish deep research is a metered operation. A charge may apply to your account.\n\n' + request.query.slice(0, 1000))) return { cancelled: true };
  return startResearch(getTinyFish(), request, getResearchHistory());
});
registerTinyFishHandler<[string], unknown>('tinyfish:research:get', (id) => getResearch(getTinyFish(), id, getResearchHistory()));
registerTinyFishHandler<[Record<string, string | number | undefined>], unknown>('tinyfish:research:list', (params) => listResearch(getTinyFish(), params));
registerTinyFishHandler<[], unknown>('tinyfish:research:history', () => getResearchHistory().list());
registerTinyFishHandler<[string], unknown>('tinyfish:research:cancel', (id) => cancelResearch(getTinyFish(), id));
ipcMain.handle('tinyfish:automation:start', async (event, request: AutomationRequest) => {
  if (!isTrustedTinyFishRenderer(event)) throw new Error('TinyFish access is limited to MINDORA windows.');
  if (!request || typeof request.url !== 'string' || typeof request.goal !== 'string' || request.goal.length > 10000) throw new Error('Invalid browser automation request.');
  if (request.proxyConfig?.type === 'custom' || request.proxyConfig?.url || request.proxyConfig?.username || request.proxyConfig?.password) {
    throw new Error('Custom proxy credentials can only be supplied by trusted backend code.');
  }
  if (!await approveMeteredTinyFish(event, 'Approve paid TinyFish browser automation?', 'TinyFish browser automation is a metered operation. It may interact with the website and a charge may apply to your account.\n\n' + request.goal.slice(0, 1000))) return { cancelled: true };
  return startAutomation(getTinyFish(), request);
});
registerTinyFishHandler<[Record<string, string | number | undefined>], unknown>('tinyfish:runs:list', async (params) => {
  const result = await listRuns(getTinyFish(), params);
  return { ...result, ...(Array.isArray(result.runs) ? { runs: result.runs.map(removeRunAccessUrls) } : {}) };
});
registerTinyFishHandler<[string], Promise<unknown>>('tinyfish:runs:get', async (id) => removeRunAccessUrls(await getRun(getTinyFish(), id)));
registerTinyFishHandler<[string], unknown>('tinyfish:runs:cancel', (id) => cancelRun(getTinyFish(), id));
registerTinyFishHandler<[string, string], unknown>('tinyfish:runs:html', (runId, stepId) => getRunStepHtml(getTinyFish(), runId, stepId));
registerTinyFishHandler<[string, string], unknown>('tinyfish:runs:screenshot', (runId, stepId) => getRunStepScreenshot(getTinyFish(), runId, stepId));
registerTinyFishHandler<[], unknown>('tinyfish:monitors:list', () => listMonitors(getTinyFish()));
registerTinyFishHandler<[string], unknown>('tinyfish:monitors:get', (id) => getMonitor(getTinyFish(), id));
ipcMain.handle('tinyfish:monitors:create', async (event, input: Parameters<typeof createMonitor>[1]) => {
  if (!isTrustedTinyFishRenderer(event)) throw new Error('TinyFish access is limited to MINDORA windows.');
  if (!input || typeof input !== 'object') throw new Error('Invalid monitor request.');
  if (!await approveMeteredTinyFish(event, 'Approve paid TinyFish monitor?', 'Creating a monitor schedules recurring TinyFish work and may incur usage charges.')) return { cancelled: true };
  return createMonitor(getTinyFish(), input);
});
registerTinyFishHandler<[string, Parameters<typeof updateMonitor>[2]], unknown>('tinyfish:monitors:update', (id, patch) => updateMonitor(getTinyFish(), id, patch));
registerTinyFishHandler<[string], unknown>('tinyfish:monitors:delete', (id) => deleteMonitor(getTinyFish(), id));
ipcMain.handle('tinyfish:monitors:run', async (event, id: string) => {
  if (!isTrustedTinyFishRenderer(event)) throw new Error('TinyFish access is limited to MINDORA windows.');
  if (typeof id !== 'string' || id.length > 200) throw new Error('Invalid monitor ID.');
  if (!await approveMeteredTinyFish(event, 'Approve TinyFish monitor run?', 'Running a monitor now may incur TinyFish usage charges.')) return { cancelled: true };
  return runMonitorNow(getTinyFish(), id);
});
registerTinyFishHandler<[], unknown>('tinyfish:profiles:list', () => listProfiles(getTinyFish()));
registerTinyFishHandler<[string], unknown>('tinyfish:profiles:get', (id) => getProfile(getTinyFish(), id));
registerTinyFishHandler<[Parameters<typeof createProfile>[1]], unknown>('tinyfish:profiles:create', (input) => createProfile(getTinyFish(), input));
registerTinyFishHandler<[string, Parameters<typeof updateProfile>[2]], unknown>('tinyfish:profiles:update', (id, patch) => updateProfile(getTinyFish(), id, patch));
registerTinyFishHandler<[string], unknown>('tinyfish:profiles:delete', (id) => deleteProfile(getTinyFish(), id));
registerTinyFishHandler<[], unknown>('tinyfish:wallet:get', () => getWallet(getTinyFish()));
registerTinyFishHandler<[Parameters<typeof listSearchUsage>[1]], unknown>('tinyfish:usage:search', (params) => listSearchUsage(getTinyFish(), params));
registerTinyFishHandler<[Parameters<typeof listFetchUsage>[1]], unknown>('tinyfish:usage:fetch', (params) => listFetchUsage(getTinyFish(), params));
registerTinyFishHandler<[Parameters<typeof listBrowserUsage>[1]], unknown>('tinyfish:usage:browser', (params) => listBrowserUsage(getTinyFish(), params));

ipcMain.handle('agent:task:start', (event, task: unknown) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow) throw new Error('Agent tasks can only be started from MINDORA.');
  if (typeof task !== 'string') throw new Error('Agent task must be text.');
  const active = activeAgentTaskId ? agentOrchestrator?.getTask(activeAgentTaskId) : undefined;
  if (active && !['completed', 'failed', 'cancelled'].includes(active.state)) throw new Error('Finish, pause, or cancel the active agent task before starting another.');
  return publicAgentTask(getAgentOrchestrator().startTask(task));
});
ipcMain.handle('agent:task:get', (event, taskId: unknown) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow || typeof taskId !== 'string') return null;
  const task = agentOrchestrator?.getTask(taskId);
  return task ? publicAgentTask(task) : null;
});
ipcMain.handle('agent:task:history', (event) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow) return [];
  const history = agentOrchestrator?.getHistory() || new AgentTaskManager(100, undefined, path.join(app.getPath('userData'), 'agent-task-history.json')).history();
  return history.map(publicAgentTask);
});
ipcMain.handle('agent:task:action', (event, taskId: unknown, action: unknown, approvalId?: unknown) => {
  if (BrowserWindow.fromWebContents(event.sender) !== launchWindow || typeof taskId !== 'string' || typeof action !== 'string') return null;
  const orchestrator = getAgentOrchestrator();
  let task;
  if (action === 'pause') task = orchestrator.pause(taskId);
  else if (action === 'resume') task = orchestrator.resume(taskId);
  else if (action === 'cancel') task = orchestrator.cancel(taskId);
  else if ((action === 'approve' || action === 'reject') && typeof approvalId === 'string' && orchestrator.getPendingApprovals(taskId).some((item) => item.id === approvalId)) {
    task = action === 'approve' ? orchestrator.approve(approvalId) : orchestrator.reject(approvalId);
  }
  return task ? publicAgentTask(task) : null;
});

ipcMain.handle('get-key-status', async (event) => {
  if (!isLaunchRenderer(event)) return null;
  return getKeyStatus();
});

ipcMain.handle('test-api-key', async (event, candidateKey: unknown) => {
  if (!isLaunchRenderer(event) || (candidateKey !== undefined && (typeof candidateKey !== 'string' || candidateKey.length > 512))) return { success: false, error: 'Invalid key request.' };
  return testKeyConnection(typeof candidateKey === 'string' ? candidateKey : undefined);
});

ipcMain.handle('save-api-key', async (event, candidateKey: unknown) => {
  if (!isLaunchRenderer(event) || typeof candidateKey !== 'string' || candidateKey.length > 512) return { success: false, error: 'Invalid key request.' };
  return saveKey(candidateKey);
});

ipcMain.handle('remove-api-key', async (event) => {
  if (!isLaunchRenderer(event)) return false;
  return removeKey();
});

ipcMain.handle('open-external-url', async (event, url: unknown) => {
  if (!isLaunchRenderer(event) || typeof url !== 'string' || url.length > 2048) return false;
  openExternalUrl(url);
  return true;
});

ipcMain.on('trigger-check', (event) => {
  if (!isCoachRenderer(event)) return;
  executeCoachingTurn();
});

ipcMain.on('pause-session', (event) => {
  if (!isCoachRenderer(event)) return;
  pauseCoachingSession();
});

ipcMain.on('resume-session', (event) => {
  if (!isCoachRenderer(event)) return;
  resumeCoachingSession();
});

ipcMain.on('stop-session', (event) => {
  if (!isCoachRenderer(event)) return;
  stopCoachingSession();
});

ipcMain.on('reset-session', (event) => {
  if (!isCoachRenderer(event)) return;
  handleSessionReset();
  if (coachWindow && !coachWindow.isDestroyed()) coachWindow.hide();
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.hide();
  if (launchWindow && !launchWindow.isDestroyed()) {
    launchWindow.show();
    launchWindow.focus();
    launchWindow.webContents.send('launch-state-reset');
  }
});

ipcMain.on('window-minimize', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if ((win === launchWindow || win === coachWindow) && win && !win.isDestroyed()) win.minimize();
});

ipcMain.on('window-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if ((win === launchWindow || win === coachWindow) && win && !win.isDestroyed()) win.close();
});

// App Lifecycle
app.whenReady().then(async () => {
  migrateLegacyUserData();
  if (process.platform === 'darwin') app.setName('MINDORA');
  if (process.platform === 'win32') app.setAppUserModelId('com.mindora.desktop');
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const isPet = Boolean(mikoWindow && !mikoWindow.isDestroyed() && webContents === mikoWindow.webContents);
    const mediaTypes = (details as { mediaTypes?: string[] }).mediaTypes || [];
    const isArmedMic = isPet && permission === 'media' && mediaTypes.includes('audio') && Date.now() <= voicePermissionArmedUntil && Boolean(mikoPetController?.getPublicSettings().voiceEnabled);
    if (isArmedMic) voicePermissionArmedUntil = 0;
    callback(isArmedMic);
  });
  mikoPetController = new MikoPetController({
    createWindow: createMikoPetWindow,
    getDisplays: () => screen.getAllDisplays().map((display) => ({ id: display.id.toString(), bounds: display.bounds, workArea: display.workArea })),
    getPrimaryDisplay: () => {
      const display = screen.getPrimaryDisplay();
      return { id: display.id.toString(), bounds: display.bounds, workArea: display.workArea };
    },
    getDisplayForBounds: (bounds) => {
      const display = screen.getDisplayMatching(bounds);
      return { id: display.id.toString(), bounds: display.bounds, workArea: display.workArea };
    },
    readSettings: () => loadMikoSettings(app.getPath('userData')),
    writeSettings: (settings) => saveMikoSettings(app.getPath('userData'), settings),
    openMainWindow: () => {
      if (!launchWindow || launchWindow.isDestroyed()) {
        launchWindow = createLaunchWindow();
      }
      if (launchWindow.isMinimized()) {
        launchWindow.restore();
      }
      launchWindow.show();
      launchWindow.focus();
      const sendHome = () => launchWindow?.webContents.send('open-home-page');
      if (launchWindow.webContents.isLoading()) {
        launchWindow.webContents.once('did-finish-load', sendHome);
      } else {
        sendHome();
      }
    },
    performAction: (action: PetAction) => {
      if (action === 'pause') {
        pauseCoachingSession();
        const activeTask = activeAgentTaskId ? agentOrchestrator?.getTask(activeAgentTaskId) : undefined;
        if (activeTask && !['completed', 'failed', 'cancelled'].includes(activeTask.state)) {
          agentOrchestrator?.pause(activeTask.id);
        }
        mikoPetController?.setContext({ paused: true, state: 'paused' });
      } else if (action === 'resume') {
        resumeCoachingSession();
        const activeTask = activeAgentTaskId ? agentOrchestrator?.getTask(activeAgentTaskId) : undefined;
        if (activeTask && !['completed', 'failed', 'cancelled'].includes(activeTask.state)) {
          agentOrchestrator?.resume(activeTask.id);
        }
        mikoPetController?.setContext({ paused: false, state: activeTask ? 'executing' : 'idle' });
      } else {
        stopCoachingSession();
        const activeTask = activeAgentTaskId ? agentOrchestrator?.getTask(activeAgentTaskId) : undefined;
        if (activeTask && !['completed', 'failed', 'cancelled'].includes(activeTask.state)) {
          agentOrchestrator?.cancel(activeTask.id);
        }
        mikoPetController?.setContext({ paused: false, state: 'idle', sessionActive: false });
      }
    }
  });
  const restoredSettings = mikoPetController.getPublicSettings();
  if (restoredSettings.launchAtLogin) app.setLoginItemSettings({ openAtLogin: true });
  mikoPetController.initialize();
  startCompanionTimers();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'MINDORA', submenu: [{ role: 'about', label: 'About MINDORA' }, { type: 'separator' }, { role: 'quit', label: 'Quit MINDORA' }] },
    { label: 'MIKO', submenu: [
      { label: 'Show MIKO', type: 'checkbox', checked: mikoPetController.isEnabled(), click: (item) => mikoPetController?.setEnabled(item.checked) },
      { label: 'Keep on top', type: 'checkbox', checked: mikoPetController.getPublicSettings().alwaysOnTop, click: (item) => mikoPetController?.setAlwaysOnTop(item.checked) }
    ] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] }
  ]));
  registerShortcuts();
  if (process.env.MINDORA_SMOKE_TEST === '1') {
    globalShortcut.register('Control+Shift+F12', () => app.quit());
  }

  screen.on('display-metrics-changed', () => {
    handleDismiss();
    mikoPetController?.refreshPlacement();
  });
  screen.on('display-added', () => mikoPetController?.refreshPlacement());
  screen.on('display-removed', () => mikoPetController?.refreshPlacement());

  if (cliOptions.mockUi) {
    // Launch directly into Coach Window with Mock QA Bar
    coachWindow = createCoachWindow(true);
    overlayWindow = createOverlayWindow();
  } else if (cliOptions.coach) {
    // Launch directly into Coach mode
    coachWindow = createCoachWindow(false);
    overlayWindow = createOverlayWindow();
  } else {
    // Standard product launch
    launchWindow = createLaunchWindow();
  }
});

app.on('second-instance', () => {
  if (!hasSingleInstanceLock) return;
  if (launchWindow && !launchWindow.isDestroyed()) {
    if (launchWindow.isMinimized()) launchWindow.restore();
    launchWindow.show(); launchWindow.focus();
  } else if (app.isReady()) launchWindow = createLaunchWindow();
  if (mikoPetController?.isEnabled()) mikoPetController.initialize();
});

app.on('will-quit', async () => {
  if (screenAwarenessTimer) clearInterval(screenAwarenessTimer);
  if (autoLockTimer) clearInterval(autoLockTimer);
  screenAwarenessTimer = null; autoLockTimer = null;
  voicePermissionArmedUntil = 0;
  try { mikoWindow?.webContents.send('miko:voice:shutdown'); } catch { /* renderer may already be gone */ }
  mikoPetController?.shutdown();
  globalShortcut.unregisterAll();
  await terminateTesseractWorker();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    const settings = mikoPetController?.getPublicSettings();
    if (!(settings?.enabled && settings.keepRunningWhenMainClosed)) app.quit();
  }
});
