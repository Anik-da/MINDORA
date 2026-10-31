import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Pastel UI Redesign - Tokens, Assets & Layout Contracts', () => {
  const root = process.cwd();
  const tokensPath = path.resolve(root, 'electron', 'tokens.css');
  const launchHtmlPath = path.resolve(root, 'electron', 'launch.html');
  const launchCssPath = path.resolve(root, 'electron', 'launch.css');
  const coachHtmlPath = path.resolve(root, 'electron', 'coach.html');
  const coachCssPath = path.resolve(root, 'electron', 'coach.css');
  const mindoraAssetPath = path.resolve(root, 'electron', 'assets', 'mindora.png');

  it('verifies all approved pastel colour and radius tokens exist in tokens.css', () => {
    assert.equal(fs.existsSync(tokensPath), true, 'tokens.css must exist');
    const css = fs.readFileSync(tokensPath, 'utf-8');

    // Color tokens
    assert.match(css, /--color-bg:\s*#FAF6EF/i, 'warm ivory application background token #FAF6EF');
    assert.match(css, /--color-surface:\s*#FFFCF7/i, 'warm-white surface token #FFFCF7');
    assert.match(css, /--color-lavender:\s*#DDD3FA/i, 'lavender mascot panel token #DDD3FA');
    assert.match(css, /--color-ink:\s*#24112F/i, 'deep plum text token #24112F');
    assert.match(css, /--color-ink-secondary:\s*#776980/i, 'secondary text token #776980');
    assert.match(css, /--color-coral:\s*#FF795F/i, 'coral primary action token #FF795F');
    assert.match(css, /--color-yellow:\s*#FFC443/i, 'yellow accent token #FFC443');

    // Radius tokens (32-40px for major panels, 18-24px for inputs, capsule for buttons)
    assert.match(css, /--radius-panel:\s*3[2-9]px|--radius-panel:\s*40px/i, 'panel radius in 32-40px range');
    assert.match(css, /--radius-input:\s*(1[89]|2[0-4])px/i, 'input radius in 18-24px range');
    assert.match(css, /--radius-pill:\s*9999px/i, 'capsule pill radius 9999px');
  });

  it('verifies the MINDORA companion asset exists with intact binary PNG signature', () => {
    assert.equal(fs.existsSync(mindoraAssetPath), true, 'companion asset must exist in electron/assets/mindora.png');
    const buf = fs.readFileSync(mindoraAssetPath);
    // PNG magic header: 89 50 4E 47 0D 0A 1A 0A
    assert.equal(buf[0], 0x89);
    assert.equal(buf[1], 0x50);
    assert.equal(buf[2], 0x4E);
    assert.equal(buf[3], 0x47);
    assert.ok(buf.length > 50000, 'companion asset must be high-resolution artwork');
  });

  it('verifies Welcome screen matches approved reference composition without dead buttons', () => {
    const html = fs.readFileSync(launchHtmlPath, 'utf-8');

    // Headline and copy
    assert.match(html, /Less stuck\./i, 'Headline Less stuck');
    assert.match(html, /More doing\./i, 'Headline More doing');
    assert.match(html, /Your screen\.\s*Your next step\./i, 'Supporting text');
    assert.match(html, /What are we working on\?/i, 'Goal field label');
    assert.match(html, /Describe what you want to do\.\.\./i, 'Goal placeholder');

    // MINDORA companion elements
    assert.match(html, /MEET MINDORA/i, 'Meet MINDORA badge');
    assert.match(html, /Let's<br>do this\./i, 'Speech bubble text');
    assert.match(html, /assets\/mindora\.png/i, 'MINDORA companion asset reference');

    // Application selection
    assert.match(html, /Choose an application/i, 'Application selection section');
    assert.match(html, /id="app-selector"/i, 'Interactive application selector');
    assert.match(html, /id="target-title"/i, 'Target title element');

    // Primary action & disclosure
    assert.match(html, /Start with MINDORA/i, 'Coral action button text');
    assert.match(html, /active app window image and OCR text are sent to Gemini/i, 'Desktop capture and Gemini disclosure');
    assert.match(html, /id="btn-agent-start"/i, 'Agent task launch control');
    assert.match(html, /id="btn-agent-approve"/i, 'Consequential action approval control');
    assert.match(html, /id="btn-agent-pause"/i, 'Agent task pause control');
    assert.match(html, /id="agent-task-history-list"/i, 'Task history panel');

    // Exclusion checks
    assert.doesNotMatch(html, /tutorial-url/i, 'URL field must NOT be present on welcome screen');
    assert.match(html, />History</i, 'History navigation is backed by persisted agent activity');
  });

  it('provides functional MINDORA desktop navigation and responsive feature layouts', () => {
    const html = fs.readFileSync(launchHtmlPath, 'utf-8');
    const css = fs.readFileSync(path.resolve(root, 'electron', 'launch.css'), 'utf-8');
    for (const page of ['home', 'tasks', 'browser', 'research', 'monitors', 'history', 'settings']) {
      assert.match(html, new RegExp(`data-page="${page}"`, 'i'), `${page} navigation control`);
      if (page !== 'home') assert.match(html, new RegExp(`data-view="${page}"`, 'i'), `${page} feature view`);
    }
    assert.match(html, /id="browser-run-form"/i, 'Browser execution form');
    assert.match(html, /id="research-form"/i, 'Research creation form');
    assert.match(html, /id="monitor-form"/i, 'Monitor creation form');
    assert.match(css, /@media\s*\(max-width:\s*900px\)/i, 'compact desktop width layout');
    assert.match(css, /@media\s*\(max-height:\s*600px\)/i, 'short desktop work area layout');
  });

  it('requires web sign-in and separates browser UI from Electron IPC', () => {
    const html = fs.readFileSync(path.resolve(root, 'web', 'index.html'), 'utf-8');
    const dashboard = fs.readFileSync(path.resolve(root, 'web', 'dashboard.ts'), 'utf-8');
    const css = fs.readFileSync(path.resolve(root, 'web', 'styles', 'app.css'), 'utf-8');
    assert.match(html, /id="web-auth-form"/i, 'Web sign-in form');
    for (const page of ['home', 'tasks', 'browser', 'research', 'monitors', 'history', 'settings']) {
      assert.match(html, new RegExp(`data-view="${page}"`, 'i'), `${page} web navigation`);
    }
    assert.doesNotMatch(dashboard, /electronAPI|ipcRenderer/i, 'Web dashboard uses authenticated HTTP only');
    assert.match(dashboard, /EventSource\('\/api\/events'\)/, 'Authenticated task progress stream');
    assert.match(html, /cannot observe your desktop/i, 'Web screen observation limitation disclosure');
    assert.match(css, /@media\s*\(max-width:\s*800px\)/i, 'tablet dashboard layout');
    assert.match(css, /@media\s*\(max-width:\s*620px\)/i, 'mobile dashboard layout');
  });

  it('locks Electron renderer navigation and sensitive IPC to intended windows', () => {
    const main = fs.readFileSync(path.resolve(root, 'electron', 'main.ts'), 'utf-8');
    assert.equal((main.match(/lockWindowToLocalPage\(win,/g) || []).length, 4, 'launch, coach, overlay and MIKO windows are restricted to their bundled pages');
    assert.match(main, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/, 'renderer popups are denied');
    assert.match(main, /if \(!isLaunchRenderer\(event\) \|\| typeof candidateKey !== 'string'/, 'Gemini key operations require the launch window');
    assert.match(main, /ipcMain\.on\('start-coaching',[\s\S]*?if \(!isLaunchRenderer\(event\)\) return;[\s\S]*?typeof \(data as Record<string, unknown>\)\.goal !== 'string'/, 'coaching can only be started by the launch window and requires an explicit task goal');
    assert.match(main, /if \(!isCoachRenderer\(event\)\) return;\s*executeCoachingTurn\(\)/, 'screen capture can only be requested by the coach window');
    assert.match(main, /ipcMain\.handle\('miko:chat',[\s\S]*?getAgentOrchestrator\(\)\.startTask\(text\.trim\(\)\)/, 'pet chat forwards validated requests to the real orchestrator');
    assert.match(main, /window-all-closed',[\s\S]*?keepRunningWhenMainClosed/, 'app stays alive when the selected pet is configured to outlive the dashboard');
    const petHtml = fs.readFileSync(path.resolve(root, 'electron', 'pet', 'pet.html'), 'utf-8');
    const petPreload = fs.readFileSync(path.resolve(root, 'electron', 'pet', 'preload.cjs'), 'utf-8');
    assert.match(petHtml, /id="pet-chat-form"/, 'floating pet contains a compact chat form');
    assert.match(petHtml, /id="pet-voice-button"/, 'floating pet exposes voice action');
    assert.match(petPreload, /submitChat: \(text\) => ipcRenderer\.invoke\('miko:chat'/, 'pet chat uses a narrow invoke bridge');
    assert.doesNotMatch(petPreload, /require\(['"](?:fs|child_process|node:)/, 'pet preload does not expose privileged Node modules');
  });

  it('verifies Coach screen has compact pastel layout, MINDORA avatar, and prominent guidance', () => {
    const html = fs.readFileSync(coachHtmlPath, 'utf-8');

    assert.match(html, /assets\/mindora\.png/i, 'MINDORA avatar in coach header');
    assert.match(html, /MINDORA Coach/i, 'Coach header title');
    assert.match(html, /id="status-badge"/i, 'Status badge element');
    assert.match(html, /id="goal-label"/i, 'Goal label element');
    assert.match(html, /id="instruction-text"/i, 'Dominant instruction text element');
    assert.match(html, /id="recovery-box"/i, 'Correction/recovery box');
    assert.match(html, /What I noticed/i, 'Observation section');
    assert.match(html, /Reading your screen…/i, 'Analysing indicator');
    assert.match(html, /Check my progress/i, 'Check progress button');
    assert.match(html, /id="btn-pause"/i, 'Pause button');
    assert.match(html, /id="btn-stop"/i, 'Stop button');
    assert.match(html, /id="budget-chip"/i, 'Budget telemetry chip');
  });

  it('verifies CSS files include prefers-reduced-motion accessibility fallbacks', () => {
    const launchCss = fs.readFileSync(launchCssPath, 'utf-8');
    const coachCss = fs.readFileSync(coachCssPath, 'utf-8');

    assert.match(launchCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'launch.css has reduced-motion rule');
    assert.match(coachCss, /@media\s*\(prefers-reduced-motion:\s*reduce\)/i, 'coach.css has reduced-motion rule');
  });
});
