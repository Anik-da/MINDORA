import { TinyFishClient } from './client.js';
import { TinyFishJson, TinyFishUsageQuery } from './types.js';

function query(query: TinyFishUsageQuery = {}): string {
  const params = new URLSearchParams();
  const names: Record<string, string> = { startAfter: 'start_after', endBefore: 'end_before', createdAfter: 'created_after', createdBefore: 'created_before' };
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(names[key] || key, String(value));
  return params.size ? `?${params}` : '';
}

export function getWallet(client: TinyFishClient, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('agent', '/v1/wallet', { signal, retryable: true }); }
export function listSearchUsage(client: TinyFishClient, params: TinyFishUsageQuery = {}, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('search', `/usage${query(params)}`, { signal, retryable: true }); }
export function listFetchUsage(client: TinyFishClient, params: TinyFishUsageQuery = {}, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('fetch', `/usage${query(params)}`, { signal, retryable: true }); }
export function listBrowserUsage(client: TinyFishClient, params: TinyFishUsageQuery = {}, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('browser', `/usage${query(params)}`, { signal, retryable: true }); }
