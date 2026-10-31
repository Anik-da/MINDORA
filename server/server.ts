/**
 * MINDORA Web - HTTP Server & API Service
 * 
 * Clean, lightweight Node HTTP server compatible with Google Cloud Run:
 * - Listens on 0.0.0.0 and process.env.PORT (defaults to 8080).
 * - /healthz health check endpoint.
 * - Same-origin REST API endpoints:
 *   * GET  /healthz
 *   * GET  /api/example
 *   * POST /api/check
 *   * POST /api/session/reset
 * - Safe static file serving for web companion (HTML, CSS, JS, fonts).
 * - Zero secrets exposed to client.
 * - Single-worker OCR queue and bounded concurrency.
 * - Graceful shutdown and worker cleanup.
 */

import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validateImageBuffer } from './image-validator.js';
import { sessionManager } from './session-manager.js';
import { extractCandidatesFromBuffer, terminateWebOcrWorker } from './ocr-service.js';
import { queryWebGeminiCoach, resolveApiKey, getSelectedModel } from './gemini-service.js';
import { analyzeTutorialVideo, extractYouTubeVideoId } from '../shared/tutorial-service.js';
import { handleWebAuth, isWebAuthenticated } from './web-auth.js';
import { handleDashboardApi } from './web-dashboard.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';
const WEB_DIST_DIR = path.resolve(process.cwd(), 'dist', 'web');

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};
const STATIC_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
};

/**
 * Reads and parses JSON body from an incoming HTTP request with size cap.
 */
function readJsonBody(req: http.IncomingMessage, maxBytes = 12 * 1024 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error(`Payload exceeds maximum size of ${maxBytes / (1024 * 1024)} MiB`));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        if (!raw.trim()) {
          resolve({});
          return;
        }
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(new Error(`Invalid JSON request body: ${err instanceof Error ? err.message : String(err)}`));
      }
    });

    req.on('error', err => reject(err));
  });
}

/**
 * Sends a JSON response with status code and headers.
 */
function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(jsonStr),
    'Cache-Control': 'no-store'
  });
  res.end(jsonStr);
}

/**
 * Safe static file server from WEB_DIST_DIR.
 */
function serveStaticFile(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): void {
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.normalize(path.join(WEB_DIST_DIR, relativePath));

  // Security guard: Path traversal prevention
  if (!filePath.startsWith(WEB_DIST_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Only fallback to index.html for extensionless navigation routes
      if (!ext) {
        const fallbackPath = path.join(WEB_DIST_DIR, 'index.html');
        if (fs.existsSync(fallbackPath)) {
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache',
            ...STATIC_SECURITY_HEADERS
          });
          fs.createReadStream(fallbackPath).pipe(res);
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Cache headers: no-cache for html/css/js to guarantee fresh assets, long cache for fonts
    const cacheControl = (ext === '.html' || ext === '.css' || ext === '.js') ? 'no-cache' : 'public, max-age=3600';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl,
      ...STATIC_SECURITY_HEADERS
    });

    fs.createReadStream(filePath).pipe(res);
  });
}

/**
 * Main HTTP request handler.
 */
export const requestHandler: http.RequestListener = async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method?.toUpperCase() || 'GET';

  if (pathname === '/api/auth/login') {
    try {
      const body = await readJsonBody(req, 16 * 1024);
      handleWebAuth(req, res, pathname, method, body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {});
    } catch { sendJson(res, 400, { error: 'Invalid sign-in request.' }); }
    return;
  }
  if (handleWebAuth(req, res, pathname, method)) return;
  // Example fixtures are public and contain no user data. All dashboard and
  // screen-guidance APIs require the HttpOnly session established at sign-in.
  if (pathname.startsWith('/api/') && !['/api/examples', '/api/example'].includes(pathname) && !isWebAuthenticated(req)) {
    sendJson(res, 401, { error: 'Sign in to MINDORA to use this API.', code: 'AUTH_REQUIRED' });
    return;
  }
  if (pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(method) && req.headers.origin) {
    try {
      const requestOrigin = new URL(req.headers.origin).origin;
      const expectedOrigin = `http://${req.headers.host || 'localhost'}`;
      const expectedSecureOrigin = `https://${req.headers.host || 'localhost'}`;
      const forwardedHttps = req.headers['x-forwarded-proto'] === 'https';
      const isSecure = Boolean((req.socket as typeof req.socket & { encrypted?: boolean }).encrypted) || forwardedHttps;
      if (requestOrigin !== (isSecure ? expectedSecureOrigin : expectedOrigin)) { sendJson(res, 403, { error: 'Cross-origin API requests are not allowed.' }); return; }
    } catch { sendJson(res, 403, { error: 'Invalid request origin.' }); return; }
  }
  if (await handleDashboardApi(req, res, pathname, method, readJsonBody, sendJson)) return;

  // 1. Health check endpoint (for Cloud Run and container probes)
  if (method === 'GET' && (pathname === '/healthz' || pathname === '/health')) {
    sendJson(res, 200, {
      status: 'ok',
      service: 'mindora-web',
      model: getSelectedModel(),
      hasKeyConfigured: resolveApiKey() !== null,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // 2. Clean Example Screenshots Endpoint (for website exploration with no coach overlays)
  if (method === 'GET' && pathname === '/api/examples') {
    sendJson(res, 200, {
      scenarios: [
        {
          id: 'ready',
          label: 'Step 1: Unselected Table (Initial State)',
          description: 'Cell C6 selected; table A1:B5 unselected. Gemini guides initial data selection.'
        },
        {
          id: 'selected',
          label: 'Step 2: Data Range A1:B5 Selected',
          description: 'Data range A1:B5 highlighted; ready to open Insert -> Chart wizard.'
        },
        {
          id: 'recovery',
          label: 'Mistake Recovery: Pie Chart Deviation',
          description: 'Sheet contains a pie chart instead of a horizontal bar chart; tests correction guidance.'
        },
        {
          id: 'complete',
          label: 'Completion: Horizontal Bar Chart Created',
          description: 'Sheet contains completed horizontal bar chart with title and legend; tests goal verification.'
        }
      ]
    });
    return;
  }

  if (method === 'GET' && pathname === '/api/example') {
    const scenario = parsedUrl.searchParams.get('scenario') || 'ready';
    let targetFileName = 'calc-test.png';
    let label = 'LibreOffice Calc: Table Unselected (Step 1)';
    let description = 'Clean Calc-only capture with table unselected; prompt Gemini to recognize selection need.';

    if (scenario === 'selected') {
      targetFileName = 'calc-clean-selected.png';
      label = 'LibreOffice Calc: Data Range A1:B5 Selected (Step 2)';
      description = 'Clean Calc-only capture with A1:B5 selected; prompt Gemini to recognize selection and advance.';
    } else if (scenario === 'recovery' || scenario === 'wrong-chart' || scenario === 'pie-chart') {
      targetFileName = 'calc-clean-pie-chart.png';
      label = 'LibreOffice Calc: Wrong Chart Type (Mistake Recovery)';
      description = 'Clean Calc-only capture with a pie chart; prompt Gemini to detect wrong chart type and recover.';
    } else if (scenario === 'complete' || scenario === 'bar-chart') {
      targetFileName = 'calc-clean-bar-chart.png';
      label = 'LibreOffice Calc: Horizontal Bar Chart (Completed)';
      description = 'Clean Calc-only capture with horizontal bar chart; prompt Gemini to verify completion.';
    }

    const candidatePaths = [
      path.resolve(process.cwd(), 'fixtures', targetFileName),
      path.resolve(process.cwd(), 'captures', targetFileName),
      path.resolve(WEB_DIST_DIR, 'assets', targetFileName),
      // Fallback to calc-test.png
      path.resolve(process.cwd(), 'fixtures', 'calc-test.png'),
      path.resolve(process.cwd(), 'captures', 'calc-test.png'),
      path.resolve(WEB_DIST_DIR, 'assets', 'calc-test.png')
    ];

    let foundPath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        foundPath = p;
        break;
      }
    }

    if (!foundPath) {
      sendJson(res, 200, {
        hasExample: false,
        message: 'No example screenshot capture is bundled.'
      });
      return;
    }

    try {
      const buffer = fs.readFileSync(foundPath);
      sendJson(res, 200, {
        hasExample: true,
        scenario,
        label,
        mimeType: 'image/png',
        imageBase64: buffer.toString('base64'),
        goal: "Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.",
        description
      });
    } catch (readErr) {
      sendJson(res, 500, {
        hasExample: false,
        error: `Failed to read example capture: ${readErr instanceof Error ? readErr.message : String(readErr)}`
      });
    }
    return;
  }

  // 3. Reset Session Endpoint
  if (method === 'POST' && pathname === '/api/session/reset') {
    try {
      const body = await readJsonBody(req);
      const payload = (body && typeof body === 'object' && !Array.isArray(body)) ? (body as Record<string, unknown>) : {};
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId.trim() : null;
      if (sessionId) {
        sessionManager.resetSession(sessionId);
      }
      sendJson(res, 200, { ok: true, message: 'Session reset cleanly.' });
    } catch {
      sendJson(res, 400, { error: 'Invalid request payload.' });
    }
    return;
  }

  // 3.5. Tutorial Video Analysis Endpoint (Analyze once per session)
  if (method === 'POST' && pathname === '/api/tutorial') {
    try {
      const body = await readJsonBody(req);
      const payload = (body && typeof body === 'object' && !Array.isArray(body)) ? (body as Record<string, unknown>) : {};
      const url = typeof payload.url === 'string' ? payload.url.trim() : '';
      const goal = typeof payload.goal === 'string' ? payload.goal.trim() : 'Software task guidance';
      const sessionId = typeof payload.sessionId === 'string' && payload.sessionId.trim().length > 0
        ? payload.sessionId.trim().slice(0, 64)
        : 'default';

      if (!url) {
        sendJson(res, 400, { success: false, error: 'Missing tutorial video URL.' });
        return;
      }

      const videoId = extractYouTubeVideoId(url);
      if (!videoId) {
        sendJson(res, 200, {
          success: false,
          stepsSummary: null,
          error: 'Tutorial video guidance supports public YouTube tutorial URLs only.'
        });
        return;
      }

      const apiKey = resolveApiKey();
      if (!apiKey) {
        sendJson(res, 500, {
          success: false,
          error: 'GEMINI_API_KEY is not configured on this server.'
        });
        return;
      }

      const result = await analyzeTutorialVideo({
        url,
        goal,
        apiKey,
        model: getSelectedModel()
      });

      if (result.supported && result.stepsSummary) {
        sessionManager.setTutorialSteps(sessionId, result.stepsSummary);
      } else {
        sessionManager.setTutorialSteps(sessionId, null);
      }

      sendJson(res, 200, {
        success: result.supported,
        stepsSummary: result.stepsSummary,
        error: result.error
      });
    } catch (err) {
      sendJson(res, 500, {
        success: false,
        error: `Tutorial video processing error: ${err instanceof Error ? err.message : String(err)}`
      });
    }
    return;
  }

  // 4. Main Check Endpoint
  if (method === 'POST' && pathname === '/api/check') {
    let sessionId = 'default';
    try {
      const body = await readJsonBody(req);
      const payload = (body && typeof body === 'object' && !Array.isArray(body)) ? (body as Record<string, unknown>) : {};

      // Validate session ID
      if (typeof payload.sessionId === 'string' && payload.sessionId.trim().length > 0) {
        sessionId = payload.sessionId.trim().slice(0, 64);
      }

      // Check server-side rate pacing and session quotas
      const pacingResult = sessionManager.checkRateAndPacing(sessionId);
      if (!pacingResult.allowed) {
        sendJson(res, 429, {
          success: false,
          error: pacingResult.reason,
          retryAfterSec: pacingResult.retryAfterSec
        });
        return;
      }

      // Validate Goal
      const rawGoal = typeof payload.goal === 'string' ? payload.goal.trim() : '';
      if (rawGoal.length < 3 || rawGoal.length > 500) {
        sendJson(res, 400, {
          success: false,
          error: 'Goal must be between 3 and 500 characters.'
        });
        return;
      }

      // Validate base64 image string
      const rawBase64 = typeof payload.imageBase64 === 'string' ? payload.imageBase64.trim() : '';
      if (!rawBase64) {
        sendJson(res, 400, {
          success: false,
          error: 'Missing imageBase64 data in request payload.'
        });
        return;
      }

      // Strip data URI prefix if present
      const cleanBase64 = rawBase64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      const imageBuffer = Buffer.from(cleanBase64, 'base64');

      // Binary validation & dimension inspection
      const validation = validateImageBuffer(imageBuffer);
      if (!validation.valid || !validation.mimeType) {
        sendJson(res, 400, {
          success: false,
          error: validation.error || 'Invalid screenshot image data.'
        });
        return;
      }

      // Acquire in-flight lock for session
      sessionManager.beginRequest(sessionId);

      // Validate previous instruction & history
      const previousInstruction = typeof payload.previousInstruction === 'string' && payload.previousInstruction.trim().length > 0
        ? payload.previousInstruction.trim().slice(0, 300)
        : null;

      const history: Array<{
        turnNumber: number;
        instruction: string;
        assessment: string;
        status: string;
        selectedCandidateText: string | null;
      }> = Array.isArray(payload.history)
        ? payload.history.slice(-5).map((h: unknown, idx: number) => {
            const item = (h && typeof h === 'object') ? (h as Record<string, unknown>) : {};
            return {
              turnNumber: typeof item.turnNumber === 'number' ? item.turnNumber : idx + 1,
              instruction: typeof item.instruction === 'string' ? item.instruction.slice(0, 200) : '',
              assessment: typeof item.assessment === 'string' ? item.assessment : 'uncertain',
              status: typeof item.status === 'string' ? item.status : 'guide',
              selectedCandidateText: typeof item.selectedCandidateText === 'string' ? item.selectedCandidateText.slice(0, 50) : null
            };
          })
        : [];

      // Run OCR Candidate Extraction
      const ocrResult = await extractCandidatesFromBuffer(
        imageBuffer,
        validation.width,
        validation.height
      );

      // Determine if Calc mode or application-agnostic mode
      const isCalc = payload.isCalc !== undefined ? Boolean(payload.isCalc) : false;
      const appName = typeof payload.appName === 'string' && payload.appName.trim().length > 0
        ? payload.appName.trim().slice(0, 100)
        : (isCalc ? 'LibreOffice Calc' : 'Uploaded screen (application not identified)');

      // Tutorial context management: reuse cached steps or analyze once if URL supplied
      let tutorialSteps = sessionManager.getTutorialSteps(sessionId);
      const tutorialUrl = typeof payload.tutorialUrl === 'string' ? payload.tutorialUrl.trim() : null;

      if (!tutorialSteps && tutorialUrl) {
        const apiKey = resolveApiKey();
        if (apiKey) {
          const tutRes = await analyzeTutorialVideo({
            url: tutorialUrl,
            goal: rawGoal,
            apiKey,
            model: getSelectedModel()
          });
          if (tutRes.supported && tutRes.stepsSummary) {
            tutorialSteps = tutRes.stepsSummary;
            sessionManager.setTutorialSteps(sessionId, tutorialSteps);
          }
        }
      }

      // Query Gemini Coach
      const geminiResult = await queryWebGeminiCoach({
        imageBuffer,
        mimeType: validation.mimeType,
        goal: rawGoal,
        previousInstruction,
        history,
        candidates: ocrResult.candidates,
        isCalc,
        appName,
        tutorialSteps
      });

      if (!geminiResult.success || !geminiResult.guidance) {
        sessionManager.cancelRequest(sessionId);
        const status = geminiResult.statusCode || 500;
        sendJson(res, status, {
          success: false,
          error: geminiResult.error || 'Failed to generate guidance from screen observation.'
        });
        return;
      }

      const guidance = geminiResult.guidance;

      // Highlight geometry resolution:
      // If guidance is uncertain or complete, or generic application mode (!isCalc), highlight is strictly suppressed.
      let targetBox = guidance.targetBox;
      let hasTargetHighlight = guidance.hasTargetHighlight;

      if (!isCalc || guidance.status === 'uncertain' || guidance.status === 'complete') {
        targetBox = null;
        hasTargetHighlight = false;
      } else if (geminiResult.selectedCandidate) {
        targetBox = geminiResult.selectedCandidate.normalizedBox;
        hasTargetHighlight = true;
      }

      // Complete request in session manager and advance progressive step
      sessionManager.completeRequest(sessionId, true, {
        instruction: guidance.instruction,
        assessment: guidance.assessment,
        status: guidance.status,
        selectedCandidateText: geminiResult.selectedCandidate?.text || null
      });

      const updatedSession = sessionManager.getOrCreateSession(sessionId);

      sendJson(res, 200, {
        success: true,
        guidance: {
          assessment: guidance.assessment,
          status: guidance.status,
          observation: guidance.observation,
          instruction: guidance.instruction,
          targetLabel: guidance.targetLabel || geminiResult.selectedCandidate?.text || null,
          targetBox,
          selectedCandidateId: guidance.selectedCandidateId,
          expectedOutcome: guidance.expectedOutcome,
          reason: guidance.reason,
          hasTargetHighlight
        },
        stepNumber: updatedSession.currentStepNumber,
        checkCount: updatedSession.checkCount,
        maxChecks: updatedSession.maxChecks,
        durationMs: Math.round(geminiResult.durationMs + ocrResult.durationMs),
        ocrDurationMs: Math.round(ocrResult.durationMs),
        candidatesFound: ocrResult.candidates.length,
        imageDimensions: {
          width: validation.width,
          height: validation.height
        }
      });
    } catch (err: unknown) {
      sessionManager.cancelRequest(sessionId);
      sendJson(res, 500, {
        success: false,
        error: `Server processing error: ${err instanceof Error ? err.message : String(err)}`
      });
    }
    return;
  }

  // 5. Static file serving (HTML, CSS, JS, fonts)
  if (method === 'GET' || method === 'HEAD') {
    serveStaticFile(req, res, pathname);
    return;
  }

  // 405 Method Not Allowed
  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
};

/**
 * Starts the HTTP server.
 */
export function startServer(port = PORT, host = HOST): http.Server {
  const server = http.createServer(requestHandler);

  server.listen(port, host, () => {
    console.log(`[MINDORA Web] Server listening at http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`[MINDORA Web] Health check: http://localhost:${port}/healthz`);
  });

  // Graceful shutdown handling
  const shutdown = async () => {
    console.log('[MINDORA Web] Shutting down gracefully...');
    server.close(async () => {
      await terminateWebOcrWorker();
      console.log('[MINDORA Web] Server and OCR worker stopped.');
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

import { fileURLToPath } from 'node:url';

// Auto-start if run directly
if (process.argv[1]) {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    if (path.resolve(process.argv[1]).toLowerCase() === path.resolve(currentFile).toLowerCase()) {
      startServer();
    }
  } catch {
    // Fallback start
    startServer();
  }
}
