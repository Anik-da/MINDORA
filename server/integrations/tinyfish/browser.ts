import { TinyFishClient } from './client.js';
import { TinyFishJson } from './types.js';

/** Raw browser sessions return a secret-bearing cdp_url; keep the response in trusted code only. */
export function createBrowserSession(client: TinyFishClient, input: { url?: string; timeoutSeconds?: number; proxyConfig?: Record<string, unknown> }, signal?: AbortSignal): Promise<TinyFishJson> {
  return client.request('browser', '/', { method: 'POST', body: { ...(input.url ? { url: input.url } : {}), ...(input.timeoutSeconds ? { timeout_seconds: input.timeoutSeconds } : {}), ...(input.proxyConfig ? { proxy_config: input.proxyConfig } : {}) }, signal, timeoutMs: 90_000, retryable: false });
}

export function terminateBrowserSession(client: TinyFishClient, sessionId: string, signal?: AbortSignal): Promise<void> {
  return client.request('browser', `/${encodeURIComponent(sessionId)}`, { method: 'DELETE', signal, retryable: true });
}
