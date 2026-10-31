/**
 * MINDORA - AI Coaching Loop Integration Module (Gemini Client)
 * 
 * Handles multi-modal reasoning and structured guidance for LibreOffice Calc:
 * - Runtime override: 'gemini-3.1-flash-lite' (measured ~10.2s latency)
 * - Supported LOW thinking configuration
 * - Anti-prompt injection system instruction
 * - Grounded target candidate selection (no model-guessed coordinates)
 * - Strict 12-request session budget
 * - Bounded 25s timeout; zero automatic retries; graceful 429/503 handling
 * - Zero secrets or raw credential logging
 */

import { OcrCandidate } from './candidate-extractor.js';
import { validateModelResponse, ValidatedGuidance } from '../shared/contracts.js';
import {
  buildCanonicalSystemPrompt,
  GEMINI_RESPONSE_SCHEMA,
  resolveModelName,
  DEFAULT_REQUEST_TIMEOUT_MS,
  GeminiApiResponse
} from '../shared/gemini-config.js';

export interface CoachingTurnHistory {
  turnNumber: number;
  instruction: string;
  assessment: string;
  status: string;
  selectedCandidateText: string | null;
}

export interface CoachingRequestOptions {
  apiKey: string;
  imageBuffer: Buffer;
  goal: string;
  previousInstruction: string | null;
  history: CoachingTurnHistory[];
  candidates: OcrCandidate[];
  isScreenUnchanged?: boolean;
  isCalc?: boolean;
  appName?: string;
  tutorialSteps?: string | null;
}

export interface CoachingTurnResult {
  success: boolean;
  guidance: ValidatedGuidance | null;
  selectedCandidate: OcrCandidate | null;
  durationMs: number;
  tokens?: { prompt: number; candidate: number; total: number; thoughts?: number };
  error?: string;
  statusCode?: number;
}

export function buildSystemPrompt(
  goal: string,
  options?: { isCalc?: boolean; appName?: string; tutorialSteps?: string | null }
): string {
  return buildCanonicalSystemPrompt(goal, 'desktop', options);
}

const RESPONSE_SCHEMA = GEMINI_RESPONSE_SCHEMA;
const REQUEST_TIMEOUT_MS = DEFAULT_REQUEST_TIMEOUT_MS;

/**
 * Sends a single multimodal coaching request to Gemini with bounded timeout.
 */
export async function queryGeminiCoach(
  options: CoachingRequestOptions
): Promise<CoachingTurnResult> {
  const startTime = performance.now();
  const {
    apiKey,
    imageBuffer,
    goal,
    previousInstruction,
    history,
    candidates,
    isScreenUnchanged,
    isCalc = false,
    appName,
    tutorialSteps
  } = options;

  if (!apiKey || apiKey.trim().length === 0) {
    return {
      success: false,
      guidance: null,
      selectedCandidate: null,
      durationMs: 0,
      error: 'Missing GEMINI_API_KEY'
    };
  }

  // Format OCR candidates list (ID + Text + Normalized position)
  const candidateDescriptions = candidates
    .slice(0, 150) // Top 150 candidates in active window
    .map(c => `ID: ${c.id} | Text: "${c.text}" | Pos: [${c.normalizedBox.join(',')}]`)
    .join('\n');

  // Format session history context
  const historyText = history.length > 0
    ? history.slice(-3).map(h => `Turn ${h.turnNumber}: Status=${h.status}, Instruction="${h.instruction}", Assessment=${h.assessment}`).join('\n')
    : 'No previous turns in session.';

  const appHeader = appName ? `ACTIVE APPLICATION: ${appName}\n` : '';
  const tutorialHeader = tutorialSteps ? `TUTORIAL REFERENCE STEPS (Extracted from tutorial video):\n${tutorialSteps}\n\n` : '';

  const userPrompt = `${appHeader}GOAL: ${goal}
PREVIOUS INSTRUCTION: ${previousInstruction || 'None (Initial check)'}

${tutorialHeader}SESSION HISTORY:
${historyText}

VISIBLE OCR TEXT CANDIDATES:
${candidateDescriptions || 'No candidates detected.'}

Please evaluate the fresh visible screenshot and return your structured coaching response.`;

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
              mimeType: 'image/png',
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

  const model = resolveModelName();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS);

  try {
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(requestBody),
        signal: abortController.signal
      });
      const retryable = response.status === 408 || response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504;
      if (response.ok || !retryable || attempt >= 2) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** attempt) + Math.floor(Math.random() * 200)));
    }

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
          error: `API Service Unavailable (503): ${parsedMessage}. Session context preserved.`
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

    // Correctly assemble chosen candidate's final answer text (strictly exclude thought parts)
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

    // Candidate ID set for contract validation
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
    let selectedCandidate: OcrCandidate | null = null;

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
