import { TinyFishClient } from './client.js';
import { TinyFishRunResponse } from './types.js';

function queryString(params: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  return query.size ? `?${query}` : '';
}

export function listRuns(client: TinyFishClient, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<{ runs?: TinyFishRunResponse[]; [key: string]: unknown }> {
  return client.request('agent', `/v1/runs${queryString(params)}`, { signal, retryable: true });
}
export function getRun(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<TinyFishRunResponse> {
  return client.request('agent', `/v1/runs/${encodeURIComponent(id)}`, { signal, retryable: true });
}
export function cancelRun(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<TinyFishRunResponse> {
  return client.request('agent', `/v1/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', signal, retryable: true });
}
export function getRunStepHtml(client: TinyFishClient, id: string, stepId: string, signal?: AbortSignal): Promise<string> {
  return client.request('agent', `/v1/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/html`, { signal, retryable: true, responseType: 'text' });
}
export function getRunStepScreenshot(client: TinyFishClient, id: string, stepId: string, signal?: AbortSignal): Promise<Uint8Array> {
  return client.request('agent', `/v1/runs/${encodeURIComponent(id)}/steps/${encodeURIComponent(stepId)}/screenshot`, { signal, retryable: true, responseType: 'bytes' });
}
