import { TinyFishApiErrorBody } from './types.js';

export type TinyFishErrorKind = 'configuration' | 'validation' | 'authentication' | 'insufficient_credits' | 'rate_limited' | 'timeout' | 'cancelled' | 'provider' | 'network' | 'unknown';

export class TinyFishError extends Error {
  readonly name = 'TinyFishError';
  constructor(
    message: string,
    readonly kind: TinyFishErrorKind,
    readonly status?: number,
    readonly code?: string,
    readonly requestId?: string,
    readonly retryAfterSeconds?: number,
    readonly details?: Record<string, unknown>
  ) { super(message); }
}

export function normalizeTinyFishError(status: number, body: unknown, retryAfter: string | null): TinyFishError {
  const parsed = (body && typeof body === 'object' ? body : {}) as TinyFishApiErrorBody;
  const error = parsed.error || {};
  const code = error.code || parsed.code || 'HTTP_ERROR';
  const message = error.message || parsed.message || `TinyFish request failed (${status}).`;
  const kind: TinyFishErrorKind = status === 402 || code === 'INSUFFICIENT_CREDITS' || code === 'FREE_ALLOWANCE_EXHAUSTED'
    ? 'insufficient_credits'
    : status === 401 ? 'authentication'
      : status === 429 ? 'rate_limited'
        : status === 400 || status === 422 ? 'validation' : 'provider';
  const retryAfterSeconds = retryAfter ? (Number.isFinite(Number(retryAfter)) ? Number(retryAfter) : Math.max(0, (Date.parse(retryAfter) - Date.now()) / 1000)) : undefined;
  return new TinyFishError(message, kind, status, code, parsed.request_id, retryAfterSeconds, error.details);
}
