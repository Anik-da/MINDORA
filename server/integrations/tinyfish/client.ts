import { normalizeTinyFishError, TinyFishError } from './errors.js';
import { TinyFishConfig, TinyFishLogger, TinyFishService } from './types.js';

const DEFAULT_ENDPOINTS: Record<TinyFishService, string> = {
  agent: 'https://agent.tinyfish.ai',
  search: 'https://api.search.tinyfish.ai',
  fetch: 'https://api.fetch.tinyfish.ai',
  browser: 'https://api.browser.tinyfish.ai'
};

export interface TinyFishRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  retryable?: boolean;
  headers?: Record<string, string>;
  responseType?: 'json' | 'text' | 'bytes';
  rateLimitCost?: number;
}

export class TinyFishClient {
  private readonly endpoints: Record<TinyFishService, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly minRequestIntervalMs: number;
  private readonly maxConcurrentRequests: number;
  private readonly rateLimitsPerMinute: Partial<Record<TinyFishService, number>>;
  private readonly rateEvents = new Map<TinyFishService, Array<{ time: number; cost: number }>>();
  private readonly fetchImpl: typeof fetch;
  private readonly logger: TinyFishLogger;
  private scheduleTail: Promise<void> = Promise.resolve();
  private nextAllowedAt = 0;
  private activeRequests = 0;

  constructor(private readonly config: TinyFishConfig, options: { fetchImpl?: typeof fetch; logger?: TinyFishLogger } = {}) {
    if (!config.apiKey?.trim()) throw new TinyFishError('TINYFISH_API_KEY is not configured.', 'configuration');
    this.endpoints = { ...DEFAULT_ENDPOINTS, ...(config.baseUrl ? { agent: config.baseUrl } : {}), ...config.endpoints };
    for (const [service, endpoint] of Object.entries(this.endpoints)) {
      try {
        const parsed = new URL(endpoint);
        if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') throw new Error('HTTPS is required.');
      } catch { throw new TinyFishError(`Invalid TinyFish ${service} base URL.`, 'configuration'); }
    }
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.minRequestIntervalMs = config.minRequestIntervalMs ?? 120;
    this.maxConcurrentRequests = config.maxConcurrentRequests ?? 4;
    this.rateLimitsPerMinute = { search: 30, fetch: 150, ...config.rateLimitsPerMinute };
    this.fetchImpl = options.fetchImpl || fetch;
    this.logger = options.logger || ((record) => console.info(JSON.stringify(record)));
  }

  async request<T>(service: TinyFishService, route: string, options: TinyFishRequestOptions = {}): Promise<T> {
    const method = options.method || 'GET';
    const retryable = options.retryable ?? method === 'GET';
    let attempt = 0;
    while (true) {
      await this.waitForSlot(service, options.rateLimitCost ?? 1, options.signal);
      attempt++;
      const started = Date.now();
      const controller = new AbortController();
      const abortFromCaller = () => controller.abort(options.signal?.reason);
      if (options.signal?.aborted) abortFromCaller();
      options.signal?.addEventListener('abort', abortFromCaller, { once: true });
      const timer = setTimeout(() => controller.abort(new Error('TinyFish request timed out.')), options.timeoutMs ?? this.timeoutMs);
      const url = new URL(route, `${this.endpoints[service].replace(/\/$/, '')}/`);
      try {
        const response = await this.fetchImpl(url, {
          method,
          headers: {
            'X-API-Key': this.config.apiKey,
            Accept: 'application/json',
            ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
            ...options.headers
          },
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: controller.signal
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const error = normalizeTinyFishError(response.status, body, response.headers.get('retry-after'));
          this.log(service, url, response.status, started, attempt, error.code);
          if (retryable && attempt <= this.maxRetries && this.shouldRetry(response.status)) {
            await this.delay(error.retryAfterSeconds ? Math.min(error.retryAfterSeconds * 1000, 30_000) : this.backoff(attempt), options.signal);
            continue;
          }
          throw error;
        }
        this.log(service, url, response.status, started, attempt);
        if (response.status === 204) return undefined as T;
        const contentType = response.headers.get('content-type') || '';
        if (options.responseType === 'bytes') return new Uint8Array(await response.arrayBuffer()) as T;
        if (options.responseType === 'text' || !contentType.includes('application/json')) return await response.text() as T;
        return await response.json() as T;
      } catch (error) {
        if (error instanceof TinyFishError) throw error;
        if (controller.signal.aborted) {
          const cancelled = options.signal?.aborted;
          const mapped = new TinyFishError(cancelled ? 'TinyFish request was cancelled.' : 'TinyFish request timed out.', cancelled ? 'cancelled' : 'timeout', undefined, cancelled ? 'ABORTED' : 'TIMEOUT');
          this.log(service, url, undefined, started, attempt, mapped.code);
          throw mapped;
        }
        const mapped = new TinyFishError('TinyFish could not be reached.', 'network', undefined, 'NETWORK_ERROR');
        this.log(service, url, undefined, started, attempt, mapped.code);
        if (retryable && attempt <= this.maxRetries) {
          await this.delay(this.backoff(attempt), options.signal);
          continue;
        }
        throw mapped;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abortFromCaller);
        this.activeRequests = Math.max(0, this.activeRequests - 1);
      }
    }
  }

  private async waitForSlot(service: TinyFishService, cost: number, signal?: AbortSignal): Promise<void> {
    const scheduled = this.scheduleTail.then(async () => {
      while (this.activeRequests >= this.maxConcurrentRequests) await this.delay(20, signal);
      const limit = this.rateLimitsPerMinute[service];
      if (limit !== undefined) {
        while (true) {
          const now = Date.now();
          const recent = (this.rateEvents.get(service) || []).filter((entry) => now - entry.time < 60_000);
          this.rateEvents.set(service, recent);
          const used = recent.reduce((sum, entry) => sum + entry.cost, 0);
          if (used + cost <= limit) break;
          const oldest = recent[0];
          await this.delay(oldest ? Math.max(1, oldest.time + 60_000 - now) : 60_000, signal);
        }
      }
      const delayMs = Math.max(0, this.nextAllowedAt - Date.now());
      if (delayMs) await this.delay(delayMs, signal);
      this.nextAllowedAt = Date.now() + this.minRequestIntervalMs;
      if (signal?.aborted) throw new TinyFishError('TinyFish request was cancelled.', 'cancelled', undefined, 'ABORTED');
      this.activeRequests++;
      const recent = this.rateEvents.get(service) || [];
      recent.push({ time: Date.now(), cost });
      this.rateEvents.set(service, recent);
    });
    this.scheduleTail = scheduled.catch(() => {});
    await scheduled;
  }

  private delay(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new TinyFishError('TinyFish request was cancelled.', 'cancelled', undefined, 'ABORTED')); return; }
      const timer = setTimeout(done, ms);
      function done() { signal?.removeEventListener('abort', abort); resolve(); }
      function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new TinyFishError('TinyFish request was cancelled.', 'cancelled', undefined, 'ABORTED')); }
      signal?.addEventListener('abort', abort, { once: true });
    });
  }

  private shouldRetry(status: number): boolean { return status === 429 || status === 502 || status === 503 || status === 504 || status >= 500; }
  private backoff(attempt: number): number { return Math.min(250 * 2 ** (attempt - 1) + Math.floor(Math.random() * 150), 5_000); }
  private log(service: TinyFishService, url: URL, status: number | undefined, started: number, attempt: number, error_code?: string): void {
    this.logger({ event: 'tinyfish.request', service, route: url.pathname, ...(status === undefined ? {} : { status }), duration_ms: Date.now() - started, attempt, ...(error_code ? { error_code } : {}) });
  }
}

export function tinyFishClientFromEnv(env: NodeJS.ProcessEnv = process.env, options: { fetchImpl?: typeof fetch; logger?: TinyFishLogger } = {}): TinyFishClient {
  const apiKey = env.TINYFISH_API_KEY || '';
  const baseUrl = env.TINYFISH_BASE_URL?.trim() || undefined;
  return new TinyFishClient({ apiKey, baseUrl }, options);
}
