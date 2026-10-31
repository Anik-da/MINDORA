/**
 * Unstuck - UI Review & Image Capture Harness
 * 
 * Renders Unstuck's own UI windows (Launch Window and Coach Panel in all 9 states)
 * using Electron's native webContents.capturePage().
 * 
 * Saves pristine window screenshots into git-ignored captures/ui-review/
 * with zero desktop recording or external API calls.
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const outDir = path.resolve(projectRoot, 'captures', 'ui-review');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const launchHtml = path.resolve(projectRoot, 'dist', 'electron', 'launch.html');
const coachHtml = path.resolve(projectRoot, 'dist', 'electron', 'coach.html');
const preloadPath = path.resolve(projectRoot, 'dist', 'electron', 'preload.cjs');

// Prevent app from quitting when windows close sequentially
app.on('window-all-closed', (e) => {
  e.preventDefault();
});

// Provide mock IPC handler for Launch window target detector
ipcMain.handle('get-target-info', async () => ({
  title: 'Untitled 1 - LibreOffice Calc',
  process: 'soffice.bin',
  isCalc: true,
  bounds: { left: 100, top: 100, width: 1400, height: 900, right: 1500, bottom: 1000 }
}));

app.whenReady().then(async () => {
  console.log('[UI Review] Initializing Electron renderer capture...');

  // 1. Capture Launch Window
  const launchWin = new BrowserWindow({
    width: 1040,
    height: 700,
    frame: false,
    backgroundColor: '#FAF6EF',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  launchWin.loadFile(launchHtml);
  await new Promise((res) => launchWin.once('ready-to-show', res));
  // Wait for fonts & SVG rendering
  await new Promise((res) => setTimeout(res, 600));

  const launchImg = await launchWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '01-launch-window.png'), launchImg.toPNG());
  console.log('  ✔ Saved 01-launch-window.png');

  // 2. Capture Coach Window across states
  const coachWin = new BrowserWindow({
    width: 390,
    height: 490,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  coachWin.loadFile(coachHtml);
  await new Promise((res) => coachWin.once('ready-to-show', res));
  await new Promise((res) => setTimeout(res, 400));

  const statesToTest = [
    { name: '02-coach-ready.png', state: 'ready' },
    { name: '03-coach-capturing.png', state: 'capturing' },
    { name: '04-coach-analysing.png', state: 'analysing' },
    { name: '05-coach-guidance.png', state: 'guidance', payload: { badge: 'Step 1' } },
    { name: '06-coach-recovery.png', state: 'recovery', payload: { badge: 'Correction' } },
    { name: '07-coach-paused.png', state: 'paused' },
    { name: '08-coach-complete.png', state: 'complete', payload: { badge: 'Complete' } },
    { name: '09-coach-error.png', state: 'error', payload: { badge: 'Error' } },
    { name: '10-coach-text-only.png', state: 'text-only', payload: { badge: 'Action' } }
  ];

  for (const item of statesToTest) {
    await coachWin.webContents.executeJavaScript(`
      new Promise((resolve) => {
        if (window.__applyMockState) {
          window.__applyMockState('${item.state}', ${JSON.stringify(item.payload || {})});
        }
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      })
    `);
    await new Promise((res) => setTimeout(res, 200));
    const img = await coachWin.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, item.name), img.toPNG());
    console.log(`  ✔ Saved ${item.name}`);
  }

  // 11. Capture Developer Mock mode with top toolbar
  const mockWin = new BrowserWindow({
    width: 380,
    height: 480,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath
    }
  });

  mockWin.loadFile(coachHtml);
  await new Promise((res) => mockWin.once('ready-to-show', res));
  await mockWin.webContents.executeJavaScript(`
    const bar = document.getElementById('mock-bar');
    if (bar) bar.classList.add('visible');
    if (window.__applyMockState) window.__applyMockState('guidance');
  `);
  await new Promise((res) => setTimeout(res, 200));
  const mockImg = await mockWin.webContents.capturePage();
  fs.writeFileSync(path.join(outDir, '11-coach-developer-mock.png'), mockImg.toPNG());
  console.log('  ✔ Saved 11-coach-developer-mock.png');

  launchWin.destroy();
  coachWin.destroy();
  mockWin.destroy();

  console.log('[UI Review] All 11 window review captures saved successfully.');
  app.exit(0);
});
