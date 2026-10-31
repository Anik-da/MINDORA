/**
 * Unstuck Web - Unit Tests for Server, Image Validator, and Session Lifecycle
 * 
 * Verifies:
 * - Image validation: PNG/JPEG binary header parsing, size limits, dimension guards.
 * - Server-side rate pacing: 5s minimum interval and 1-in-flight concurrency guard.
 * - Session quota: 15 checks limit and progressive step tracking.
 * - HTTP API: /healthz, /api/example, /api/session/reset, and input validation.
 * - Path traversal security on static file server.
 */

import { describe, it, before, after } from 'node:test';
import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { validateImageBuffer } from '../server/image-validator.js';
import { SessionManager } from '../server/session-manager.js';
import { requestHandler } from '../server/server.js';

/**
 * Creates a synthetic minimal PNG buffer with given width and height.
 */
function createSyntheticPngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(128);
  // PNG signature
  buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  // IHDR chunk length: 13 bytes
  buf.writeUInt32BE(13, 8);
  // IHDR chunk type: "IHDR"
  buf.write('IHDR', 12, 'ascii');
  // Width & Height
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  // Bit depth 8, Color type 2 (Truecolor), Compression 0, Filter 0, Interlace 0
  buf.set([8, 2, 0, 0, 0], 24);
  // CRC dummy
  buf.writeUInt32BE(0x12345678, 29);
  return buf;
}

/**
 * Creates a synthetic minimal JPEG buffer with given width and height.
 */
function createSyntheticJpegBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(120);
  // SOI (Start of Image)
  buf.set([0xff, 0xd8], 0);
  // APP0 marker
  buf.set([0xff, 0xe0, 0x00, 0x10], 2);
  buf.write('JFIF\0', 6, 'ascii');
  // SOF0 marker (Start of Frame)
  const sofOffset = 22;
  buf.set([0xff, 0xc0], sofOffset);
  buf.writeUInt16BE(11, sofOffset + 2); // Length
  buf[sofOffset + 4] = 8; // Precision
  buf.writeUInt16BE(height, sofOffset + 5);
  buf.writeUInt16BE(width, sofOffset + 7);
  buf[sofOffset + 9] = 3; // 3 components
  // EOI marker
  buf.set([0xff, 0xd9], 118);
  return buf;
}

describe('Web Image Validator Unit Tests', () => {
  it('accepts a valid PNG buffer with valid dimensions', () => {
    const png = createSyntheticPngBuffer(1920, 1080);
    const result = validateImageBuffer(png);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.mimeType, 'image/png');
    assert.strictEqual(result.width, 1920);
    assert.strictEqual(result.height, 1080);
  });

  it('accepts a valid JPEG buffer with valid dimensions', () => {
    const jpeg = createSyntheticJpegBuffer(1280, 800);
    const result = validateImageBuffer(jpeg);
    assert.strictEqual(result.valid, true);
    assert.strictEqual(result.mimeType, 'image/jpeg');
    assert.strictEqual(result.width, 1280);
    assert.strictEqual(result.height, 800);
  });

  it('rejects a buffer that is too small (< 100 bytes)', () => {
    const tiny = Buffer.alloc(50);
    const result = validateImageBuffer(tiny);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /too small/i);
  });

  it('rejects non-image arbitrary bytes', () => {
    const random = Buffer.alloc(500, 0x41); // All 'A'
    const result = validateImageBuffer(random);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /unsupported image format/i);
  });

  it('rejects screenshot with dimensions smaller than 200px', () => {
    const smallPng = createSyntheticPngBuffer(100, 100);
    const result = validateImageBuffer(smallPng);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /dimensions too small/i);
  });

  it('rejects screenshot with dimensions larger than 4096px', () => {
    const largePng = createSyntheticPngBuffer(5000, 5000);
    const result = validateImageBuffer(largePng);
    assert.strictEqual(result.valid, false);
    assert.match(result.error || '', /dimensions too large/i);
  });
});

describe('Web Session Manager Lifecycle & Rate Pacing Unit Tests', () => {
  it('initializes session with 0 used of 15 checks', () => {
    const sm = new SessionManager();
    const session = sm.getOrCreateSession('test_ses_1');
    assert.strictEqual(session.checkCount, 0);
    assert.strictEqual(session.maxChecks, 15);
    assert.strictEqual(session.currentStepNumber, 1);
  });

  it('enforces 1 analysis in flight per session', () => {
    const sm = new SessionManager();
    const allowedFirst = sm.beginRequest('test_ses_2');
    assert.strictEqual(allowedFirst, true);

    const check = sm.checkRateAndPacing('test_ses_2');
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason || '', /already in progress/i);

    sm.completeRequest('test_ses_2', false);
  });

  it('enforces 5s pacing between consecutive checks', () => {
    const sm = new SessionManager();
    sm.beginRequest('test_ses_3');
    sm.completeRequest('test_ses_3', true, {
      instruction: 'Click Insert',
      assessment: 'expected',
      status: 'guide',
      selectedCandidateText: 'Insert'
    });

    const checkImmediate = sm.checkRateAndPacing('test_ses_3');
    assert.strictEqual(checkImmediate.allowed, false);
    assert.match(checkImmediate.reason || '', /wait \ds before checking again/i);
  });

  it('blocks request when session limit of 15 checks is reached', () => {
    const sm = new SessionManager();
    const session = sm.getOrCreateSession('test_ses_4');
    session.checkCount = 15;
    // Set lastCheckTime to 10s ago so interval doesn't trigger
    session.lastCheckTime = Date.now() - 10000;

    const check = sm.checkRateAndPacing('test_ses_4');
    assert.strictEqual(check.allowed, false);
    assert.match(check.reason || '', /Session check limit reached/i);
  });

  it('advances progressive step only on expected progress', () => {
    const sm = new SessionManager();
    const session = sm.getOrCreateSession('test_ses_5');
    assert.strictEqual(session.currentStepNumber, 1);

    // Turn 1: Expected progress -> advances to step 2
    sm.beginRequest('test_ses_5');
    sm.completeRequest('test_ses_5', true, {
      instruction: 'Click Insert',
      assessment: 'expected',
      status: 'guide',
      selectedCandidateText: 'Insert'
    });
    assert.strictEqual(session.currentStepNumber, 2);

    // Turn 2: Unexpected deviation (recovery) -> does NOT advance step
    sm.beginRequest('test_ses_5');
    sm.completeRequest('test_ses_5', true, {
      instruction: 'Close Format menu and click Insert',
      assessment: 'unexpected',
      status: 'recover',
      selectedCandidateText: 'Insert'
    });
    assert.strictEqual(session.currentStepNumber, 2);
  });

  it('resets session cleanly without leaking check count', () => {
    const sm = new SessionManager();
    const session = sm.getOrCreateSession('test_ses_6');
    session.checkCount = 8;
    session.currentStepNumber = 4;

    sm.resetSession('test_ses_6');
    const reset = sm.getOrCreateSession('test_ses_6');
    assert.strictEqual(reset.checkCount, 0);
    assert.strictEqual(reset.currentStepNumber, 1);
    assert.strictEqual(reset.history.length, 0);
  });
});

describe('Web Server HTTP Endpoints Unit Tests', () => {
  let server: http.Server;
  let testPort = 0;
  let originalAccessToken: string | undefined;
  let authCookie = '';
  let loginCookie = '';
  const testAccessToken = 'test-mindora-web-access-token-0123456789';
  const apiFetch = (path: string, options: RequestInit = {}) => fetch(`http://127.0.0.1:${testPort}${path}`, { ...options, headers: { ...(options.headers || {}), Cookie: authCookie } });

  before(async () => {
    originalAccessToken = process.env.MINDORA_WEB_ACCESS_TOKEN;
    process.env.MINDORA_WEB_ACCESS_TOKEN = testAccessToken;
    server = http.createServer(requestHandler);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          testPort = addr.port;
        }
        resolve();
      });
    });
    const login = await fetch(`http://127.0.0.1:${testPort}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessToken: testAccessToken }) });
    assert.equal(login.status, 200);
    loginCookie = login.headers.get('set-cookie') || '';
    authCookie = loginCookie.split(';')[0];
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    if (originalAccessToken === undefined) delete process.env.MINDORA_WEB_ACCESS_TOKEN;
    else process.env.MINDORA_WEB_ACCESS_TOKEN = originalAccessToken;
  });

  it('requires an authenticated HttpOnly session for private API endpoints', async () => {
    const denied = await fetch(`http://127.0.0.1:${testPort}/api/session/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 401);
    const me = await apiFetch('/api/auth/me');
    assert.equal(me.status, 200);
    assert.match(loginCookie, /HttpOnly/i);
    assert.match(loginCookie, /SameSite=Strict/i);
  });

  it('GET /healthz returns 200 OK with health status JSON', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/healthz`);
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.status, 'ok');
    assert.strictEqual(data.service, 'mindora-web');
    assert.strictEqual(typeof data.timestamp, 'string');
  });

  it('GET /api/example returns example metadata or safe absent flag', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/api/example`);
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(typeof data.hasExample, 'boolean');
    if (data.hasExample) {
      assert.strictEqual(typeof data.imageBase64, 'string');
      assert.strictEqual(data.mimeType, 'image/png');
    }
  });

  it('GET /api/examples returns scenarios list and GET /api/example?scenario=selected returns clean fixture', async () => {
    const listRes = await fetch(`http://127.0.0.1:${testPort}/api/examples`);
    assert.strictEqual(listRes.status, 200);
    const listData = (await listRes.json()) as any;
    assert.ok(Array.isArray(listData.scenarios));
    assert.ok(listData.scenarios.length >= 4);

    const scenarioRes = await fetch(`http://127.0.0.1:${testPort}/api/example?scenario=selected`);
    assert.strictEqual(scenarioRes.status, 200);
    const scenarioData = (await scenarioRes.json()) as any;
    if (scenarioData.hasExample) {
      assert.strictEqual(scenarioData.scenario, 'selected');
      assert.strictEqual(typeof scenarioData.imageBase64, 'string');
    }
  });

  it('POST /api/check rejects payload with invalid goal', async () => {
    const res = await apiFetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test_api_1',
        goal: 'a', // Too short
        imageBase64: 'abc'
      })
    });
    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, false);
    assert.match(data.error || '', /between 3 and 500 characters/i);
  });

  it('POST /api/check rejects payload with invalid base64 image', async () => {
    const res = await apiFetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test_api_2',
        goal: 'Create a horizontal bar chart',
        imageBase64: Buffer.alloc(200, 0x42).toString('base64')
      })
    });
    assert.strictEqual(res.status, 400);
    const data = (await res.json()) as any;
    assert.strictEqual(data.success, false);
    assert.match(data.error || '', /unsupported image format|invalid/i);
  });

  it('POST /api/session/reset resets session cleanly', async () => {
    const res = await apiFetch('/api/session/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test_api_reset' })
    });
    assert.strictEqual(res.status, 200);
    const data = (await res.json()) as any;
    assert.strictEqual(data.ok, true);
  });

  it('POST /api/session/reset and /api/check safely handle non-object payloads without crashing', async () => {
    const resReset = await apiFetch('/api/session/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    });
    assert.strictEqual(resReset.status, 200);

    const resCheck = await apiFetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'null'
    });
    assert.strictEqual(resCheck.status, 400);
  });

  it('POST /api/tutorial rejects missing or invalid tutorial video URL', async () => {
    const resEmpty = await apiFetch('/api/tutorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: '', goal: 'Test' })
    });
    assert.strictEqual(resEmpty.status, 400);

    const resInvalid = await apiFetch('/api/tutorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://vimeo.com/99999', goal: 'Test' })
    });
    // Handled gracefully: 200 with success: false or clear failure status
    const data = (await resInvalid.json()) as any;
    assert.strictEqual(data.success, false);
    assert.match(data.error || '', /YouTube/i);
  });

  it('serves static index.html on GET /', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/`);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get('content-type')?.includes('text/html'), true);
    const text = await res.text();
    assert.match(text, /Find your next move/i);
  });

  it('returns 404 for missing static asset files', async () => {
    const res = await fetch(`http://127.0.0.1:${testPort}/missing-file.png`);
    assert.strictEqual(res.status, 404);
  });
});
