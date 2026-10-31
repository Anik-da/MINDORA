/**
 * MINDORA - Gemini API Key Secure Storage & Validation Module
 * 
 * Manages user personal Gemini API keys:
 * - Checks local development .env if available
 * - Encrypts and persists user-provided key in Electron's userData directory using safeStorage (DPAPI on Windows)
 * - Falls back to session-only in-memory storage if safeStorage is unavailable (never stores plaintext on disk)
 * - Tests API key connectivity against Gemini API in main process only
 * - Enforces zero-leak secret isolation (never returns full key to renderer, logs, window titles, or error messages)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveModelName } from '../shared/gemini-config.js';

// Safe runtime resolution of Electron primitives (compatible with both Electron runtime and Node test runner)
let app: any;
let safeStorage: any;
let shell: any;

try {
  // @ts-ignore
  const electronModule = await import('electron');
  app = electronModule.app || electronModule.default?.app;
  safeStorage = electronModule.safeStorage || electronModule.default?.safeStorage;
  shell = electronModule.shell || electronModule.default?.shell;
} catch {
  // Pure Node environment fallback
}

export interface KeyStatus {
  configured: boolean;
  source: 'env' | 'saved' | 'session' | 'none';
  maskedKey: string | null;
  encryptionAvailable: boolean;
}

export interface KeyTestResult {
  success: boolean;
  error?: string;
}

export interface KeySaveResult {
  success: boolean;
  error?: string;
  status: KeyStatus;
}

let sessionKey: string | null = null;

function getStoragePath(): string {
  if (typeof app !== 'undefined' && app && typeof app.getPath === 'function') {
    return path.join(app.getPath('userData'), 'gemini_credential.enc');
  }
  return path.resolve(process.cwd(), '.gemini_credential.enc');
}

/**
 * Loads key from local development .env file if present.
 */
function loadEnvKey(): string | null {
  const candidatePaths = [
    typeof app !== 'undefined' && app && typeof app.getAppPath === 'function' 
      ? path.join(app.getAppPath(), '.env') 
      : null,
    path.resolve(process.cwd(), '.env')
  ].filter(Boolean) as string[];

  for (const envPath of candidatePaths) {
    if (!fs.existsSync(envPath)) continue;
    try {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim();
          if (
            key === 'GEMINI_API_KEY' && 
            val.length > 10 && 
            !val.includes('placeholder') && 
            !val.includes('your_') &&
            !val.includes(' ')
          ) {
            return val;
          }
        }
      }
    } catch {
      // Ignore read errors
    }
  }
  return null;
}

/**
 * Loads encrypted key from userData if present.
 */
function loadSavedKey(): string | null {
  if (sessionKey) {
    return sessionKey;
  }

  const storagePath = getStoragePath();
  if (!fs.existsSync(storagePath)) {
    return null;
  }

  if (typeof safeStorage !== 'undefined' && safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
    try {
      const encrypted = fs.readFileSync(storagePath);
      const decrypted = safeStorage.decryptString(encrypted);
      if (decrypted && decrypted.trim().length > 10) {
        return decrypted.trim();
      }
    } catch (err) {
      console.warn('[KeyStorage] Failed to decrypt stored credential:', err);
    }
  }

  return null;
}

/**
 * Masks an API key for safe display, revealing only the last 4 characters.
 */
export function maskKey(rawKey: string): string {
  if (!rawKey || rawKey.length <= 8) {
    return '••••••••';
  }
  const last4 = rawKey.slice(-4);
  return `••••••••${last4}`;
}

/**
 * Returns the active usable Gemini API key (saved user key takes precedence over local .env).
 */
export function getActiveApiKey(): string | null {
  const saved = loadSavedKey();
  if (saved) return saved;

  const env = loadEnvKey();
  if (env) return env;

  return null;
}

/**
 * Retrieves the current key status for renderer without ever leaking the raw key.
 */
export function getKeyStatus(): KeyStatus {
  const encryptionAvailable = typeof safeStorage !== 'undefined' && safeStorage && typeof safeStorage.isEncryptionAvailable === 'function'
    ? safeStorage.isEncryptionAvailable()
    : false;

  if (sessionKey) {
    return {
      configured: true,
      source: 'session',
      maskedKey: maskKey(sessionKey),
      encryptionAvailable
    };
  }

  const storagePath = getStoragePath();
  if (fs.existsSync(storagePath)) {
    const saved = loadSavedKey();
    if (saved) {
      return {
        configured: true,
        source: 'saved',
        maskedKey: maskKey(saved),
        encryptionAvailable
      };
    }
  }

  const env = loadEnvKey();
  if (env) {
    return {
      configured: true,
      source: 'env',
      maskedKey: maskKey(env),
      encryptionAvailable
    };
  }

  return {
    configured: false,
    source: 'none',
    maskedKey: null,
    encryptionAvailable
  };
}

/**
 * Tests connection to Google Gemini API using the candidate key or active key.
 */
export async function testKeyConnection(candidateKey?: string): Promise<KeyTestResult> {
  const keyToTest = candidateKey !== undefined 
    ? candidateKey.trim() 
    : getActiveApiKey();

  if (!keyToTest) {
    return {
      success: false,
      error: 'Please enter a Gemini API key to test.'
    };
  }

  if (keyToTest.length < 15 || keyToTest.includes(' ')) {
    return {
      success: false,
      error: 'API key format is invalid. Please check your key from Google AI Studio.'
    };
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${resolveModelName()}:generateContent`;
    const requestBody = JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { maxOutputTokens: 8 } });
    let res: Response;
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': keyToTest },
          signal: controller.signal,
          body: requestBody
        });
      } finally { clearTimeout(timeout); }
      const retryable = res.status === 408 || res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504;
      if (res.ok || !retryable || attempt >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** attempt) + Math.floor(Math.random() * 200)));
    }
    if (res.ok) {
      return { success: true };
    }

    const errorPayload = await res.json().catch(() => null) as { error?: { message?: string; status?: string } } | null;
    const detail = String(errorPayload?.error?.message || errorPayload?.error?.status || '').replaceAll(keyToTest, '[redacted]').slice(0, 500);
    const errorMsg = detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}: Connection rejected by Gemini API.`;
    return {
      success: false,
      error: errorMsg
    };
  } catch (err: unknown) {
    const error = err as { name?: string; message?: string };
    if (error && error.name === 'AbortError') {
      return {
        success: false,
        error: 'Connection test timed out. Check your internet connection and try again.'
      };
    }
    return {
      success: false,
      error: `Network error: ${error?.message || 'Unable to reach Google Gemini API.'}`
    };
  }
}

/**
 * Saves a new Gemini API key using safeStorage.
 */
export function saveKey(rawCandidateKey: string): KeySaveResult {
  const key = typeof rawCandidateKey === 'string' ? rawCandidateKey.trim() : '';

  if (!key || key.length < 15 || key.includes(' ')) {
    return {
      success: false,
      error: 'Invalid API key format. A valid Gemini key is required.',
      status: getKeyStatus()
    };
  }

  const encryptionAvailable = typeof safeStorage !== 'undefined' && safeStorage && typeof safeStorage.isEncryptionAvailable === 'function'
    ? safeStorage.isEncryptionAvailable()
    : false;

  if (encryptionAvailable) {
    try {
      const encrypted = safeStorage.encryptString(key);
      const storagePath = getStoragePath();
      const parentDir = path.dirname(storagePath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(storagePath, encrypted);
      sessionKey = null; // Persisted safely
      return {
        success: true,
        status: getKeyStatus()
      };
    } catch (err) {
      console.warn('[KeyStorage] safeStorage encryption failed, falling back to session key:', err);
      sessionKey = key;
      return {
        success: true,
        status: getKeyStatus()
      };
    }
  } else {
    // safeStorage unavailable: session-only key, never save plaintext to disk
    sessionKey = key;
    console.log('[KeyStorage] safeStorage unavailable on this OS/user session; storing key in-memory for this session only.');
    return {
      success: true,
      status: getKeyStatus()
    };
  }
}

/**
 * Removes any saved or session API key.
 */
export function removeKey(): boolean {
  sessionKey = null;
  const storagePath = getStoragePath();
  if (fs.existsSync(storagePath)) {
    try {
      fs.unlinkSync(storagePath);
    } catch (err) {
      console.warn('[KeyStorage] Error removing credential file:', err);
    }
  }
  return true;
}

/**
 * Opens an external URL in the user's default web browser.
 */
export function openExternalUrl(targetUrl: string): void {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(targetUrl);
    }
  } catch (err) {
    console.warn('[KeyStorage] Refusing to open invalid external URL:', targetUrl);
  }
}
