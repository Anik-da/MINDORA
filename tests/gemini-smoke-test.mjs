import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// 1. Read local .env from project root without external dependencies
function loadEnv() {
  const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(projectRoot, '.env')
  ];
  const envPath = possiblePaths.find(p => fs.existsSync(p));
  if (!envPath) return {};
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

const KNOWN_PLACEHOLDERS = new Set([
  'your_gemini_api_key_here',
  'your_actual_key_here',
  'your_key_here',
  'placeholder',
  'todo',
  'api_key'
]);

function isValidKey(key) {
  if (!key || typeof key !== 'string') return false;
  const clean = key.trim().toLowerCase();
  if (clean.length < 10) return false;
  if (KNOWN_PLACEHOLDERS.has(clean)) return false;
  return true;
}

const localEnv = loadEnv();
const rawKey = process.env.GEMINI_API_KEY || localEnv.GEMINI_API_KEY || '';
const hasValidKey = isValidKey(rawKey);
const model = process.env.GEMINI_MODEL || localEnv.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const imagePath = process.argv[2];

console.log('=== Gemini API Smoke Test ===');
console.log(`Configured Model: ${model}`);
console.log(`API Key Configured: ${hasValidKey ? 'Yes (Valid key detected)' : 'No (Missing or placeholder)'}`);

if (!hasValidKey) {
  console.log('\n[PENDING] GEMINI_API_KEY is not configured or contains a placeholder value.');
  console.log('Please add your actual GEMINI_API_KEY to the local .env file before running this test.');
  process.exit(0);
}

if (!imagePath) {
  console.log('\n[INFO] No image file provided as argument.');
  console.log('Usage: node tests/gemini-smoke-test.mjs [path/to/screenshot.png]');
  console.log('Running text-only verification ping...');
}

async function runTest() {
  // Use credential-free URL: pass API key via x-goog-api-key header to prevent credential leakage in logs or URLs
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  const parts = [];

  if (imagePath) {
    if (!fs.existsSync(imagePath)) {
      console.error(`[ERROR] Specified image file not found: ${imagePath}`);
      process.exit(1);
    }
    const mimeType = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
    const imageBytes = fs.readFileSync(imagePath);
    const base64Data = imageBytes.toString('base64');
    parts.push({
      inlineData: {
        mimeType,
        data: base64Data
      }
    });
    parts.push({
      text: 'Describe what software is visible on this screen and identify any visible menus or controls.'
    });
    console.log(`Sending image (${(imageBytes.length / 1024).toFixed(1)} KB) to ${model}...`);
  } else {
    parts.push({
      text: 'Respond with "PONG" and confirm image-analysis readiness.'
    });
  }

  const startTime = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': rawKey.trim()
      },
      body: JSON.stringify({
        contents: [{ parts }]
      })
    });

    const elapsedMs = Date.now() - startTime;
    const data = await res.json();

    if (!res.ok) {
      console.error(`\n[API ERROR] Status: ${res.status} ${res.statusText}`);
      console.error('Error Details:', JSON.stringify(data.error || data, null, 2));
      process.exit(1);
    }

    console.log(`\n[SUCCESS] Response received in ${elapsedMs}ms`);
    if (data.usageMetadata) {
      console.log('Token Usage:');
      console.log(` - Prompt Tokens:     ${data.usageMetadata.promptTokenCount}`);
      console.log(` - Candidate Tokens:  ${data.usageMetadata.candidatesTokenCount}`);
      console.log(` - Total Tokens:      ${data.usageMetadata.totalTokenCount}`);
    }

    const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log('\nObserved Result:\n', candidate || '(No candidate text returned)');
  } catch (err) {
    // Sanitize any potential network error message
    console.error('[NETWORK ERROR]', err.message.replace(/key=[^&\s]+/gi, 'key=REDACTED'));
  }
}

runTest();
