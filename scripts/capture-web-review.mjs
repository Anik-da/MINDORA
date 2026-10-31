/**
 * Unstuck - Web Review & Screen Capture Harness
 * 
 * Captures actual website screenshots at:
 * - Large Desktop (1440x900)
 * - Ordinary Laptop (1280x800)
 * - Mobile Portrait (390x844)
 * - Reduced Motion mode
 * using Electron's native webContents.capturePage().
 * 
 * Saves screenshots into git-ignored captures/web-review/
 */

import { app, BrowserWindow } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const outDir = path.resolve(projectRoot, 'captures', 'web-review');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function waitForPaint(win) {
  await win.webContents.executeJavaScript(`
    new Promise(resolve => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setTimeout(resolve, 250);
        });
      });
    })
  `);
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.whenReady().then(async () => {
  console.log('[Web Review] Starting browser capture on http://localhost:8080...');
  const { session } = await import('electron');
  await session.defaultSession.clearCache();

  // 1. Large Desktop Window (1440 x 1800)
  const desktopWin = new BrowserWindow({
    width: 1440,
    height: 1800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await desktopWin.loadURL('http://localhost:8080');
  await new Promise((res) => setTimeout(res, 2200)); // Wait for entrance animations and fonts
  await waitForPaint(desktopWin);

  // Capture 1: Large Desktop Hero (Nori, lettering, speech bubble, copy & CTAs)
  const img1 = await desktopWin.webContents.capturePage({ x: 0, y: 0, width: 1440, height: 860 });
  fs.writeFileSync(path.join(outDir, '01-web-desktop-hero.png'), img1.toPNG());
  console.log('  ✔ Saved 01-web-desktop-hero.png');

  // Capture 1b: Workflow Demo Walkthrough section
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const demo = document.getElementById('workflow-demo');
      if (demo) window.scrollTo(0, demo.offsetTop - 40);
    })()
  `);
  await new Promise((res) => setTimeout(res, 600));
  await waitForPaint(desktopWin);
  const imgDemo = await desktopWin.webContents.capturePage({ x: 0, y: 0, width: 1440, height: 620 });
  fs.writeFileSync(path.join(outDir, '01b-web-desktop-workflow-demo.png'), imgDemo.toPNG());
  console.log('  ✔ Saved 01b-web-desktop-workflow-demo.png');

  // Click "Explore an example" in the hero, which loads clean start fixture and scrolls to workspace
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const btn = document.getElementById('btn-hero-example');
      if (btn) btn.click();
    })()
  `);
  await new Promise((res) => setTimeout(res, 1400));
  await waitForPaint(desktopWin);

  // Capture 2: Desktop Workspace with Loaded Capture
  const img2 = await desktopWin.webContents.capturePage({ x: 0, y: 68, width: 1440, height: 860 });
  fs.writeFileSync(path.join(outDir, '02-web-desktop-workspace.png'), img2.toPNG());
  console.log('  ✔ Saved 02-web-desktop-workspace.png');

  // Simulate Guidance Step state on desktop with grounded highlight
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const tag = document.getElementById('instruction-step-tag');
      const text = document.getElementById('instruction-text');
      const obs = document.getElementById('observation-text');
      const badge = document.getElementById('status-badge');
      const overlay = document.getElementById('highlight-overlay');
      const actionBtn = document.getElementById('btn-action-label');

      if (tag) tag.textContent = 'Step 2';
      if (text) text.textContent = 'Click "Insert" on the top menu bar to open chart options.';
      if (obs) obs.textContent = 'Cells A1:B5 are selected. Top menu bar is clearly visible.';
      if (actionBtn) actionBtn.textContent = 'Check my progress';
      if (badge) {
        badge.textContent = 'Step 2';
        badge.className = 'status-badge step';
      }

      if (overlay) {
        overlay.innerHTML = \`
          <div class="target-bracket" style="top: 7.2%; left: 11.5%; width: 4.8%; height: 2.6%;">
            <div class="target-bracket-label">Click 'Insert'</div>
          </div>
        \`;
      }
    })()
  `);
  await waitForPaint(desktopWin);

  const img3 = await desktopWin.webContents.capturePage({ x: 0, y: 68, width: 1440, height: 860 });
  fs.writeFileSync(path.join(outDir, '03-web-desktop-guidance-highlight.png'), img3.toPNG());
  console.log('  ✔ Saved 03-web-desktop-guidance-highlight.png');

  // Simulate Recovery state
  await desktopWin.webContents.executeJavaScript(`
    (() => {
      const tag = document.getElementById('instruction-step-tag');
      const text = document.getElementById('instruction-text');
      const obs = document.getElementById('observation-text');
      const badge = document.getElementById('status-badge');
      const recBox = document.getElementById('recovery-box');
      const recText = document.getElementById('recovery-text');
      const overlay = document.getElementById('highlight-overlay');

      if (tag) tag.textContent = 'Correction';
      if (text) text.textContent = 'Close the "Format" menu and click "Insert" on the top menu bar.';
      if (recBox) recBox.style.display = 'block';
      if (recText) recText.textContent = 'You opened the "Format" menu instead of "Insert". Let us get back to the chart creation path.';
      if (obs) obs.textContent = 'The Format dropdown menu is currently open, obscuring chart options.';
      if (badge) {
        badge.textContent = 'Correction';
        badge.className = 'status-badge recovery';
      }

      if (overlay) {
        overlay.innerHTML = \`
          <div class="target-bracket recovery-bracket" style="top: 7.2%; left: 11.5%; width: 4.8%; height: 2.6%;">
            <div class="target-bracket-label">Return to 'Insert'</div>
          </div>
        \`;
      }
    })()
  `);
  await waitForPaint(desktopWin);

  const img4 = await desktopWin.webContents.capturePage({ x: 0, y: 68, width: 1440, height: 860 });
  fs.writeFileSync(path.join(outDir, '04-web-desktop-recovery-state.png'), img4.toPNG());
  console.log('  ✔ Saved 04-web-desktop-recovery-state.png');

  desktopWin.destroy();

  // 2. Ordinary Laptop Viewport (1280 x 800)
  const laptopWin = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await laptopWin.loadURL('http://localhost:8080');
  await new Promise((res) => setTimeout(res, 2200));
  await waitForPaint(laptopWin);

  const img5 = await laptopWin.webContents.capturePage({ x: 0, y: 0, width: 1280, height: 800 });
  fs.writeFileSync(path.join(outDir, '05-web-laptop-hero.png'), img5.toPNG());
  console.log('  ✔ Saved 05-web-laptop-hero.png');
  laptopWin.destroy();

  // 3. Mobile Viewport (390 x 844 portrait)
  const mobileWin = new BrowserWindow({
    width: 390,
    height: 844,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await mobileWin.loadURL('http://localhost:8080');
  await new Promise((res) => setTimeout(res, 2200));
  await waitForPaint(mobileWin);

  // Capture 6: Mobile Hero View (top 800px)
  const img6 = await mobileWin.webContents.capturePage({ x: 0, y: 0, width: 390, height: 800 });
  fs.writeFileSync(path.join(outDir, '06-web-mobile-hero.png'), img6.toPNG());
  console.log('  ✔ Saved 06-web-mobile-hero.png');

  // Load example on mobile
  await mobileWin.webContents.executeJavaScript(`
    (() => new Promise((resolve) => {
      const btn = document.querySelector('.scenario-chip[data-scenario="ready"]');
      if (btn) btn.click();
      
      const checkLoaded = setInterval(() => {
        const preview = document.getElementById('preview-container');
        const img = document.getElementById('preview-img');
        if (preview && preview.style.display !== 'none' && img && img.src && img.complete && img.naturalWidth > 0) {
          clearInterval(checkLoaded);
          resolve();
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkLoaded);
        resolve();
      }, 3000);
    }))()
  `);
  await waitForPaint(mobileWin);

  // Scroll mobile workspace into view
  await mobileWin.webContents.executeJavaScript(`
    (() => {
      const ws = document.getElementById('workspace');
      if (ws) {
        ws.scrollIntoView();
      }
      document.querySelectorAll('.workspace-reveal').forEach(el => el.classList.add('revealed'));
    })()
  `);
  await new Promise((res) => setTimeout(res, 800));
  await waitForPaint(mobileWin);

  // Capture 7: Mobile Workspace
  const img7 = await mobileWin.webContents.capturePage({ x: 0, y: 0, width: 390, height: 844 });
  fs.writeFileSync(path.join(outDir, '07-web-mobile-workspace.png'), img7.toPNG());
  console.log('  ✔ Saved 07-web-mobile-workspace.png');

  mobileWin.destroy();

  // 4. Reduced-Motion Mode Check (Desktop 1440 x 850)
  const rmWin = new BrowserWindow({
    width: 1440,
    height: 850,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  await rmWin.loadURL('http://localhost:8080');
  await rmWin.webContents.executeJavaScript(`
    (() => {
      const style = document.createElement('style');
      style.textContent = \`
        * { animation: none !important; transition: none !important; }
        .entrance-nav, .entrance-lettering, .nori-entrance-wrap, .entrance-bubble, .entrance-copy {
          opacity: 1 !important; transform: none !important; clip-path: none !important;
        }
      \`;
      document.head.appendChild(style);
    })()
  `);
  await new Promise((res) => setTimeout(res, 500));
  await waitForPaint(rmWin);

  const img8 = await rmWin.webContents.capturePage({ x: 0, y: 0, width: 1440, height: 850 });
  fs.writeFileSync(path.join(outDir, '08-web-reduced-motion-hero.png'), img8.toPNG());
  console.log('  ✔ Saved 08-web-reduced-motion-hero.png');

  rmWin.destroy();

  console.log('[Web Review] All 8 web captures saved successfully to captures/web-review/');
  app.exit(0);
});
