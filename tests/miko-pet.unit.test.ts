import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  MikoPetController, PetDisplay, PetRect, PetWindowPort, defaultMikoSettings,
  loadMikoSettings, mapCoachEventToMikoState, normalizeMikoSettings, PET_CATALOG, readPetVectorAsset, resolveMikoPlacement, saveMikoSettings
} from '../electron/pet/pet-controller.js';

const primary: PetDisplay = { id: '1', bounds: { x: 0, y: 0, width: 1600, height: 900 }, workArea: { x: 0, y: 0, width: 1600, height: 860 } };
const secondary: PetDisplay = { id: '2', bounds: { x: -1280, y: 0, width: 1280, height: 1024 }, workArea: { x: -1280, y: 0, width: 1280, height: 984 } };

class FakePetWindow implements PetWindowPort {
  visible = false; closed = false; ignoreMouse = false; top = true;
  bounds: PetRect; sent: Array<{ channel: string; payload: unknown }> = [];
  private moveListener: ((bounds: PetRect) => void) | null = null;
  private closedListener: (() => void) | null = null;
  isVisible(): boolean { return this.visible; }
  constructor(bounds: PetRect) { this.bounds = { ...bounds }; }
  show(): void { this.visible = true; }
  hide(): void { this.visible = false; }
  close(): void { this.closed = true; this.visible = false; this.closedListener?.(); }
  setPosition(x: number, y: number): void { this.bounds = { ...this.bounds, x, y }; }
  setSize(width: number, height: number): void { this.bounds = { ...this.bounds, width, height }; }
  setAlwaysOnTop(value: boolean): void { this.top = value; }
  setIgnoreMouseEvents(value: boolean): void { this.ignoreMouse = value; }
  send(channel: string, payload: unknown): void { this.sent.push({ channel, payload }); }
  onMove(listener: (bounds: PetRect) => void): void { this.moveListener = listener; }
  onClosed(listener: () => void): void { this.closedListener = listener; }
  move(bounds: PetRect): void { this.bounds = bounds; this.moveListener?.(bounds); }
}

describe('MIKO pet placement and preferences', () => {
  it('restores placement on the saved monitor and clamps to its work area', () => {
    const settings = { ...defaultMikoSettings(), position: { x: -4000, y: 900, displayId: '2' } };
    const position = resolveMikoPlacement(settings, [primary, secondary], primary);
    assert.deepEqual(position, { x: -1280, y: 758, width: 190, height: 226 });
  });

  it('falls back to the primary monitor when the saved display is disconnected', () => {
    const settings = { ...defaultMikoSettings(), position: { x: -1200, y: 40, displayId: 'gone' } };
    const position = resolveMikoPlacement(settings, [primary], primary);
    assert.equal(position.x, 0);
    assert.equal(position.y, 40);
  });

  it('round trips only pet preferences and never stores task or credential content', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miko-settings-'));
    try {
      const settings = { enabled: false, alwaysOnTop: false, expanded: true, position: { x: 12, y: 34, displayId: '1' } };
      saveMikoSettings(dir, settings);
      const loaded = loadMikoSettings(dir);
      assert.equal(loaded.enabled, false);
      assert.equal(loaded.alwaysOnTop, false);
      assert.equal(loaded.expanded, true);
      assert.deepEqual(loaded.position, settings.position);
      assert.equal(loaded.screenAwarenessEnabled, false);
      assert.equal(loaded.voiceEnabled, false);
      const raw = fs.readFileSync(path.join(dir, 'miko-settings.json'), 'utf8');
      assert.doesNotMatch(raw, /goal|instruction|api.?key|credential|secret/i);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('normalizes preference bounds, keeps opt-in features off and has distinct original pet assets', () => {
    const normalized = normalizeMikoSettings({ sizeScale: 99, voiceEnabled: true, voiceLanguage: 'en-US', voiceRate: 9, voiceVolume: -4, autoLockEnabled: true, autoLockAfterSeconds: 1, animationMode: 'subtle', showStatusBubbles: false, keepRunningWhenMainClosed: false });
    assert.equal(normalized.sizeScale, 1.4);
    assert.equal(normalized.voiceRate, 1.25);
    assert.equal(normalized.voiceVolume, 0);
    assert.equal(normalized.voiceLanguage, 'en-US');
    assert.equal(normalized.autoLockAfterSeconds, 300);
    assert.equal(normalized.animationMode, 'subtle');
    assert.equal(normalized.showStatusBubbles, false);
    assert.equal(normalized.keepRunningWhenMainClosed, false);
    const fresh = defaultMikoSettings();
    assert.equal(fresh.screenAwarenessEnabled, false);
    assert.equal(fresh.proactiveEnabled, false);
    assert.equal(fresh.voiceEnabled, false);
    assert.equal(fresh.autoLockEnabled, false);
    assert.equal(fresh.launchAtLogin, false);
    assert.equal(new Set(PET_CATALOG.map((pet) => pet.asset)).size, 5);
    assert.equal(PET_CATALOG.length, 5);
  });
});

describe('MIKO coaching state mapping', () => {
  it('maps real coaching events and does not claim the app executes tasks', () => {
    assert.equal(mapCoachEventToMikoState('capturing'), 'browsing');
    assert.equal(mapCoachEventToMikoState('analysing'), 'thinking');
    assert.equal(mapCoachEventToMikoState('analysing', 'Analyzing tutorial video steps'), 'researching');
    assert.equal(mapCoachEventToMikoState('recovery'), 'planning');
    assert.equal(mapCoachEventToMikoState('guidance'), 'waiting');
    assert.equal(mapCoachEventToMikoState('paused'), 'paused');
    assert.equal(mapCoachEventToMikoState('complete'), 'success');
    assert.equal(mapCoachEventToMikoState('error'), 'error');
    assert.equal(mapCoachEventToMikoState('ready'), 'idle');
    const liveStates = (['ready', 'capturing', 'analysing', 'guidance', 'recovery', 'paused', 'complete', 'error', 'text-only'] as const)
      .map((event) => mapCoachEventToMikoState(event));
    assert.equal(liveStates.includes('executing'), false);
  });
});

describe('MIKO window lifecycle and controls', () => {
  it('creates, expands, toggles click-through and always-on-top, and closes cleanly', () => {
    let settings = defaultMikoSettings();
    const windows: FakePetWindow[] = [];
    let opened = 0;
    const actions: string[] = [];
    const controller = new MikoPetController({
      createWindow: (bounds) => { const created = new FakePetWindow(bounds); windows.push(created); return created; },
      getDisplays: () => [primary, secondary], getPrimaryDisplay: () => primary,
      getDisplayForBounds: (bounds) => bounds.x < 0 ? secondary : primary,
      readSettings: () => ({ ...settings }), writeSettings: (value) => { settings = { ...value }; },
      openMainWindow: () => { opened++; }, performAction: (action) => actions.push(action)
    });
    controller.initialize();
    const window = windows[0];
    assert.ok(window);
    assert.equal(window.visible, true);
    controller.initialize();
    assert.equal(windows.length, 1, 'initialization does not create a duplicate pet window');
    window.hide();
    controller.setEnabled(true);
    assert.equal(window.visible, true, 'the companion can be restored without toggling its enabled setting');
    assert.equal(controller.isAlive(), true);
    controller.setInteractive(true);
    assert.equal(window.ignoreMouse, false);
    controller.setAlwaysOnTop(false);
    assert.equal(window.top, false);
    controller.setExpanded(true);
    assert.equal(window.bounds.height, 310);
    window.move({ x: -500, y: 200, width: 258, height: 310 });
    controller.moveTo({ x: -5000, y: 5000 });
    assert.equal(window.bounds.x, -1280);
    assert.equal(window.bounds.y, 674);
    controller.openMainWindow();
    controller.performAction('pause');
    assert.equal(opened, 1);
    assert.deepEqual(actions, ['pause']);
    const wasVisible = controller.hideForCapture();
    assert.equal(wasVisible, true);
    assert.equal(window.visible, false);
    controller.restoreAfterCapture(wasVisible);
    assert.equal(window.visible, true);
    controller.setEnabled(false);
    assert.equal(window.closed, true);
    assert.equal(controller.isAlive(), false);
    assert.equal(settings.position?.displayId, '2');
    controller.setEnabled(true);
    assert.equal(controller.isAlive(), true);
    controller.shutdown();
    assert.equal(controller.isAlive(), false);
  });

  it('retains newest state payload and cancels stale planning transitions', () => {
    const sent: Array<{ channel: string; payload: unknown }> = [];
    const window = new FakePetWindow({ x: 0, y: 0, ...{ width: 190, height: 226 } });
    const controller = new MikoPetController({
      createWindow: () => window, getDisplays: () => [primary], getPrimaryDisplay: () => primary,
      getDisplayForBounds: () => primary, readSettings: defaultMikoSettings, writeSettings: () => {},
      openMainWindow: () => {}, performAction: () => {}
    });
    controller.initialize();
    controller.showPlanningThenWait({ goal: 'make a chart', instruction: 'Next', step: 2, sessionActive: true });
    controller.setContext({ state: 'paused', paused: true });
    controller.sync();
    sent.push(...window.sent);
    const latest = sent.at(-1)?.payload as { state: string; paused: boolean };
    assert.equal(latest.state, 'paused');
    assert.equal(latest.paused, true);
    controller.shutdown();
  });

  it('resets pet position to default display bounds and updates pause tracking', () => {
    const settings = defaultMikoSettings();
    settings.position = { x: -400, y: 100, displayId: '2' };
    let currentSettings = settings;
    const windows: FakePetWindow[] = [];
    const controller = new MikoPetController({
      createWindow: (bounds) => { const created = new FakePetWindow(bounds); windows.push(created); return created; },
      getDisplays: () => [primary, secondary], getPrimaryDisplay: () => primary,
      getDisplayForBounds: (bounds) => bounds.x < 0 ? secondary : primary,
      readSettings: () => ({ ...currentSettings }), writeSettings: (value) => { currentSettings = { ...value }; },
      openMainWindow: () => {}, performAction: () => {}
    });
    controller.initialize();
    assert.equal(controller.isPaused(), false);
    controller.setContext({ paused: true, state: 'paused' });
    assert.equal(controller.isPaused(), true);

    const reset = controller.resetPosition();
    assert.equal(reset.position?.displayId, '1');
    assert.equal(windows[0].bounds.x, 1600 - 190 - 28);
    assert.equal(windows[0].bounds.y, 860 - 226 - 28);
    controller.shutdown();
  });

  it('has verified assets on disk for all 5 distinct pet companions', () => {
    const petDir = path.resolve('electron', 'pet');
    for (const pet of PET_CATALOG) {
      const assetPath = path.resolve(petDir, pet.asset);
      assert.ok(fs.existsSync(assetPath), `Asset for ${pet.name} must exist: ${assetPath}`);
      const stat = fs.statSync(assetPath);
      assert.ok(stat.size > 200, `Asset for ${pet.name} must not be empty`);
    }
  });

  it('loads only allowlisted bundled SVGs for the isolated renderer animation pipeline', () => {
    const petDir = path.resolve('electron', 'pet');
    const nova = readPetVectorAsset(petDir, 'nova');
    assert.match(nova || '', /^\s*<svg\b/);
    assert.match(nova || '', /class="pet-orbit"/);
    assert.doesNotMatch(nova || '', /\sstyle=/i, 'inline style attributes are removed to preserve the renderer CSP');
    assert.equal(readPetVectorAsset(petDir, 'miko'), null, 'the raster Miko art is not returned as SVG');
    assert.equal(readPetVectorAsset(petDir, '../package.json'), null);
    assert.equal(readPetVectorAsset(petDir, 12), null);
  });

  it('uses a floating companion surface with contextual actions instead of a permanent toolbar or panel', () => {
    const petDir = path.resolve('electron', 'pet');
    const html = fs.readFileSync(path.join(petDir, 'pet.html'), 'utf8');
    const css = fs.readFileSync(path.join(petDir, 'pet.css'), 'utf8');
    const preload = fs.readFileSync(path.join(petDir, 'preload.cjs'), 'utf8');
    const main = fs.readFileSync(path.resolve('electron', 'main.ts'), 'utf8');
    const controller = fs.readFileSync(path.join(petDir, 'pet-controller.ts'), 'utf8');
    assert.doesNotMatch(html, /class="pet-toolbar|class="expanded-controls/);
    assert.match(html, /class="pet-quick-actions/);
    assert.match(html, /class="context-bubble/);
    assert.match(css, /\.pet-shell:hover \.pet-quick-actions/);
    for (const state of ['listening', 'thinking', 'researching', 'executing', 'speaking', 'success', 'error', 'paused']) {
      assert.match(css, new RegExp(`data-state="${state}"\\] \\.state-effect`), `${state} has a specific visual cue`);
    }
    assert.match(preload, /onCommand/);
    for (const action of ['Chat with MINDORA', 'Start voice conversation', 'Hide companion', 'Exit MINDORA']) {
      assert.ok(main.includes(action), `Native pet menu includes ${action}`);
    }
    assert.match(controller, /setEnabled\(enabled: boolean\)[\s\S]*?if \(enabled\) this\.createAndShowWindow\(\)/, 'enabling an already-hidden companion restores its existing window');
  });
});
