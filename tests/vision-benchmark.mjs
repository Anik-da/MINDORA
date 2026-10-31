import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Read local .env
function loadEnv() {
  const envPath = path.resolve(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;

if (!apiKey || apiKey.trim().length < 10) {
  console.error('[ERROR] Valid GEMINI_API_KEY required in .env');
  process.exit(1);
}

const imagePath = path.resolve(projectRoot, 'captures', 'calc-test.png');
if (!fs.existsSync(imagePath)) {
  console.error(`[ERROR] Image fixture not found at: ${imagePath}`);
  process.exit(1);
}

const imageBuffer = fs.readFileSync(imagePath);
const base64Image = imageBuffer.toString('base64');

// Models to benchmark strictly in sequence
const MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash'
];

const PROMPT_TEXT = 'Locate the visible Insert menu in the top menu bar. Return only its label and tight bounding box. Coordinates must be [ymin, xmin, ymax, xmax], normalized to 0–1000 relative to this exact image. If it cannot be located confidently, return null. Do not describe other interface elements.';

const GENERATION_CONFIG = {
  responseMimeType: 'application/json',
  responseSchema: {
    type: 'OBJECT',
    properties: {
      targetLabel: { type: 'STRING' },
      targetBox: {
        type: 'ARRAY',
        items: { type: 'NUMBER' },
        nullable: true
      }
    },
    required: ['targetLabel', 'targetBox']
  },
  maxOutputTokens: 256,
  thinkingConfig: {
    thinkingLevel: 'LOW'
  }
};

async function benchmarkModel(modelName) {
  console.log(`\n========================================`);
  console.log(`Benchmarking model: ${modelName}`);
  console.log(`========================================`);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image
            }
          },
          {
            text: PROMPT_TEXT
          }
        ]
      }
    ],
    generationConfig: GENERATION_CONFIG
  };

  const t0 = performance.now();
  let timeToHeadersMs = 0;
  let totalTimeMs = 0;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey.trim()
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60000)
    });

    timeToHeadersMs = performance.now() - t0;
    const rawText = await res.text();
    totalTimeMs = performance.now() - t0;

    if (!res.ok) {
      console.error(`[FAIL] HTTP ${res.status} ${res.statusText}`);
      let parsedError = rawText;
      try {
        parsedError = JSON.parse(rawText);
      } catch (_) {}
      return {
        model: modelName,
        success: false,
        status: res.status,
        error: parsedError,
        timeToHeadersMs,
        totalTimeMs
      };
    }

    const data = JSON.parse(rawText);
    const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = data.usageMetadata || {};

    let parsedGuidance = null;
    let schemaValid = false;
    let parseError = null;

    try {
      parsedGuidance = JSON.parse(candidateText);
      schemaValid = (
        typeof parsedGuidance === 'object' &&
        parsedGuidance !== null &&
        typeof parsedGuidance.targetLabel === 'string' &&
        (parsedGuidance.targetBox === null || (
          Array.isArray(parsedGuidance.targetBox) &&
          parsedGuidance.targetBox.length === 4 &&
          parsedGuidance.targetBox.every(n => typeof n === 'number' && Number.isFinite(n))
        ))
      );
    } catch (e) {
      parseError = e.message;
    }

    return {
      model: modelName,
      success: true,
      status: 200,
      timeToHeadersMs,
      totalTimeMs,
      candidateText,
      parsedGuidance,
      schemaValid,
      parseError,
      usage,
      generationConfig: GENERATION_CONFIG
    };
  } catch (err) {
    totalTimeMs = performance.now() - t0;
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error(`[ERROR] ${isTimeout ? 'Request timed out after 60s' : err.message}`);
    return {
      model: modelName,
      success: false,
      status: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
      error: err.message,
      timeToHeadersMs: timeToHeadersMs || totalTimeMs,
      totalTimeMs
    };
  }
}

async function runAll() {
  console.log(`Starting Live Vision Benchmark`);
  console.log(`Screenshot: ${imagePath} (${(imageBuffer.length / 1024).toFixed(1)} KB)`);

  const results = [];
  for (const model of MODELS) {
    const res = await benchmarkModel(model);
    results.push(res);
  }

  const outputPath = path.resolve(projectRoot, 'captures', 'benchmark-results.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
  console.log(`\nBenchmark complete. Saved raw data to: ${outputPath}`);
}

runAll();
