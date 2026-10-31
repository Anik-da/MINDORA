/**
 * MINDORA Web - Gemini AI Guidance Service
 * 
 * Handles multimodal AI reasoning for the web companion:
 * - Reads GEMINI_API_KEY safely from process.env or local .env (never logged or sent to client).
 * - Configurable model candidate via GEMINI_MODEL (defaults to gemini-3.1-flash-lite).
 * - Anti-prompt injection system instruction.
 * - OCR candidate grounding (no raw hallucinated coordinates).
 * - Structured response schema and strict contract validation.
 * - Bounded 25s timeout; graceful 429/503 handling with preserved session context.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { WebOcrCandidate } from './ocr-service.js';
import { validateModelResponse, ValidatedGuidance } from '../shared/contracts.js';
import {
  buildCanonicalSystemPrompt,
  GEMINI_RESPONSE_SCHEMA,
  resolveModelName,
  DEFAULT_REQUEST_TIMEOUT_MS,
  GeminiApiResponse
} from '../shared/gemini-config.js';

export interface WebCoachingTurnHistory {
  turnNumber: number;
  instruction: string;
  assessment: string;
  status: string;
  selectedCandidateText: string | null;
}

export interface WebGuidanceRequest {
  imageBuffer: Buffer;
  mimeType: 'image/png' | 'image/jpeg';
  goal: string;
  previousInstruction: string | null;
  history: WebCoachingTurnHistory[];
  candidates: WebOcrCandidate[];
  isCalc?: boolean;
  appName?: string;
  tutorialSteps?: string | null;
}

export interface WebGuidanceResult {
  success: boolean;
  guidance: ValidatedGuidance | null;
  selectedCandidate: WebOcrCandidate | null;
  durationMs: number;
  tokens?: { prompt: number; candidate: number; total: number; thoughts?: number };
  error?: string;
  statusCode?: number;
}

const REQUEST_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS;

let cachedApiKey: string | null = null;

/**
 * Safely resolves the Gemini API key from environment or local .env.
 */
export function resolveApiKey(): string | null {
  if (cachedApiKey) {
    return cachedApiKey;
  }

  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    cachedApiKey = process.env.GEMINI_API_KEY.trim();
    return cachedApiKey;
  }

  // Fallback: Read local .env if available
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('GEMINI_API_KEY=')) {
          const val = trimmed.slice('GEMINI_API_KEY='.length).trim();
          if (val && !val.includes('your_gemini_api_key_here')) {
            cachedApiKey = val;
            return cachedApiKey;
          }
        }
      }
    } catch {
      // Ignore read error
    }
  }

  return null;
}

export function getSelectedModel(): string {
  return resolveModelName();
}

export function buildSystemPrompt(
  goal: string,
  options?: { isCalc?: boolean; appName?: string; tutorialSteps?: string | null }
): string {
  return buildCanonicalSystemPrompt(goal, 'web', options);
}

const RESPONSE_SCHEMA = GEMINI_RESPONSE_SCHEMA;

/**
 * Queries Gemini for multimodal guidance on the uploaded screenshot.
 */
export async function queryWebGeminiCoach(
  request: WebGuidanceRequest
): Promise<WebGuidanceResult> {
  const startTime = performance.now();
  const apiKey = resolveApiKey();

  if (!apiKey) {
    return {
      success: false,
      guidance: null,
      selectedCandidate: null,
      durationMs: 0,
      error: 'GEMINI_API_KEY is not configured on this server.'
    };
  }

  const {
    imageBuffer,
    mimeType,
    goal,
    previousInstruction,
    history,
    candidates,
    isCalc = false,
    appName,
    tutorialSteps
  } = request;

  // Format top 150 OCR candidates
  const candidateDescriptions = candidates
    .slice(0, 150)
    .map(c => `ID: ${c.id} | Text: "${c.text}" | Pos: [${c.normalizedBox.join(',')}]`)
    .join('\n');

  // Format compact history
  const historyText = history.length > 0
    ? history.slice(-3).map(h => `Turn ${h.turnNumber}: Status=${h.status}, Instruction="${h.instruction}", Assessment=${h.assessment}`).join('\n')
    : 'No previous turns in session.';

  const appHeader = appName ? `ACTIVE APPLICATION: ${appName}\n` : '';
  const tutorialHeader = tutorialSteps ? `TUTORIAL REFERENCE STEPS (Extracted from tutorial video):\n${tutorialSteps}\n\n` : '';

  const userPrompt = `${appHeader}GOAL: ${goal}
PREVIOUS INSTRUCTION: ${previousInstruction || 'None (Initial check)'}

${tutorialHeader}SESSION HISTORY:
${historyText}

VISIBLE OCR TEXT CANDIDATES IN SCREENSHOT:
${candidateDescriptions || 'No candidates detected.'}

Please evaluate the uploaded screenshot and return your structured coaching response.`;

  const requestBody = {
    systemInstruction: {
      parts: [{ text: buildSystemPrompt(goal, { isCalc, appName, tutorialSteps }) }]
    },
    contents: [
      {
        role: 'user',
        parts: [
          { text: userPrompt },
          {
            inlineData: {
              mimeType,
              data: imageBuffer.toString('base64')
            }
          }
        ]
      }
    ],
    generationConfig: {
      thinkingConfig: {
        thinkingLevel: 'LOW'
      },
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 2048
    }
  };

  const model = getSelectedModel();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify(requestBody),
      signal: abortController.signal
    });

    clearTimeout(timeoutId);
    const durationMs = performance.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      let parsedMessage = errorText;
      try {
        const errorJson = JSON.parse(errorText);
        parsedMessage = errorJson.error?.message || errorText;
      } catch {
        // Raw text
      }

      if (response.status === 429) {
        return {
          success: false,
          guidance: null,
          selectedCandidate: null,
          durationMs,
          statusCode: 429,
          error: `API Rate Limit (429): ${parsedMessage}. Session context preserved.`
        };
      }

      if (response.status === 503) {
        return {
          success: false,
          guidance: null,
          selectedCandidate: null,
          durationMs,
          statusCode: 503,
          error: 'API Service Unavailable (503): High demand. Session context preserved.'
        };
      }

      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        statusCode: response.status,
        error: `API HTTP ${response.status}: ${parsedMessage}`
      };
    }

    const json = (await response.json()) as GeminiApiResponse;
    const candidate = json.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const candidateParts = candidate?.content?.parts || [];

    // Filter out thought parts and assemble final answer text
    const answerParts = candidateParts.filter((p) => typeof p.text === 'string' && !p.thought);
    const finalAnswerText = answerParts.map((p) => p.text || '').join('');

    const usage = json.usageMetadata;
    const tokens = usage ? {
      prompt: usage.promptTokenCount || 0,
      candidate: usage.candidatesTokenCount || 0,
      total: usage.totalTokenCount || 0,
      thoughts: usage.thoughtsTokenCount || 0
    } : undefined;

    // Structured diagnostics without logging sensitive payload content
    console.log(`[Gemini Diagnostics] Model: ${model} | Duration: ${durationMs.toFixed(0)}ms | finishReason: ${finishReason || 'UNKNOWN'} | Tokens: prompt=${tokens?.prompt ?? 0}, output=${tokens?.candidate ?? 0}, thoughts=${tokens?.thoughts ?? 0}, total=${tokens?.total ?? 0} | ExtractedTextLen: ${finalAnswerText.length}`);

    // Output token exhaustion detection (explicit failure, never fabricate)
    if (finishReason === 'MAX_TOKENS') {
      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        tokens,
        error: 'Model output truncated: max output tokens limit reached (finishReason: MAX_TOKENS). Session context preserved.'
      };
    }

    if (finishReason && finishReason !== 'STOP') {
      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        tokens,
        error: `Model generation stopped unexpectedly (finishReason: ${finishReason}). Session context preserved.`
      };
    }

    if (!finalAnswerText || finalAnswerText.trim().length === 0) {
      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        tokens,
        error: 'Model returned response without text payload.'
      };
    }

    let parsedPayload: unknown;
    try {
      parsedPayload = JSON.parse(finalAnswerText);
    } catch (parseErr) {
      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        tokens,
        error: `Failed to parse model JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
      };
    }

    // Validate using shared contract
    const candidateIdSet = new Set(candidates.map(c => c.id));
    const validationResult = validateModelResponse(parsedPayload, candidateIdSet);

    if (!validationResult.valid) {
      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        tokens,
        error: `Contract validation failed: ${validationResult.errors.join('; ')}`
      };
    }

    const guidance = validationResult.guidance;
    let selectedCandidate: WebOcrCandidate | null = null;

    if (guidance.selectedCandidateId) {
      selectedCandidate = candidates.find(c => c.id === guidance.selectedCandidateId) || null;
    }

    return {
      success: true,
      guidance,
      selectedCandidate,
      durationMs,
      tokens
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const durationMs = performance.now() - startTime;

    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        guidance: null,
        selectedCandidate: null,
        durationMs,
        error: `API Request timed out after ${REQUEST_TIMEOUT_MS / 1000}s. Upstream server took too long to respond.`
      };
    }

    const errorObj = err as any;
    const cause = errorObj?.cause;
    const causeCode = cause?.code || cause?.name || errorObj?.code || null;
    const causeMessage = cause?.message || null;

    let userFacingMessage = 'Network connection failed: unable to reach Google Gemini API.';
    let diagnosticDetail = causeCode ? `[${causeCode}]` : '';
    if (causeMessage && !causeMessage.includes(apiKey)) {
      diagnosticDetail += ` ${causeMessage}`;
    }

    if (causeCode === 'ENOTFOUND') {
      userFacingMessage = 'Network error: DNS resolution failed (no internet or host unreachable).';
    } else if (causeCode === 'ECONNRESET') {
      userFacingMessage = 'Network error: Connection reset by upstream server.';
    } else if (causeCode === 'ETIMEDOUT' || causeCode === 'UND_ERR_CONNECT_TIMEOUT') {
      userFacingMessage = 'Network error: Connection to Google Gemini API timed out.';
    } else if (causeCode === 'ECONNREFUSED') {
      userFacingMessage = 'Network error: Connection refused by target server.';
    }

    const fullErrorMessage = diagnosticDetail
      ? `${userFacingMessage} ${diagnosticDetail.trim()}`
      : `${userFacingMessage} (${errorObj?.message || String(err)})`;

    return {
      success: false,
      guidance: null,
      selectedCandidate: null,
      durationMs,
      error: fullErrorMessage
    };
  }
}
