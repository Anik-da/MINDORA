import { TinyFishClient } from './client.js';
import { TinyFishError } from './errors.js';
import { MonitorResponse } from './types.js';

export interface MonitorCreateRequest {
  type: 'fetch' | 'search';
  name?: string;
  config: Record<string, unknown>;
  scheduleCron: string;
  purpose?: string;
  webhookUrl?: string;
}

export function createMonitor(client: TinyFishClient, input: MonitorCreateRequest, signal?: AbortSignal): Promise<MonitorResponse> {
  return client.request('agent', '/v1/monitors', { method: 'POST', body: {
    type: input.type, config: input.config, schedule_cron: input.scheduleCron,
    ...(input.name ? { name: input.name } : {}), ...(input.purpose ? { purpose: input.purpose } : {}), ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {})
  }, signal, retryable: false });
}
export function listMonitors(client: TinyFishClient, signal?: AbortSignal): Promise<MonitorResponse> { return client.request('agent', '/v1/monitors', { signal, retryable: true }); }
export function getMonitor(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<MonitorResponse> { return client.request('agent', `/v1/monitors/${encodeURIComponent(id)}`, { signal, retryable: true }); }
export function updateMonitor(client: TinyFishClient, id: string, patch: { status?: 'active' | 'paused'; scheduleCron?: string; name?: string; purpose?: string; webhookUrl?: string | null; config?: Record<string, unknown> }, signal?: AbortSignal): Promise<MonitorResponse> {
  if (patch.status && (patch.scheduleCron || patch.name || patch.purpose || patch.webhookUrl !== undefined || patch.config)) throw new TinyFishError('Monitor status updates must be sent separately from edits.', 'validation');
  return client.request('agent', `/v1/monitors/${encodeURIComponent(id)}`, { method: 'PATCH', body: {
    ...(patch.status ? { status: patch.status } : {}), ...(patch.scheduleCron ? { schedule_cron: patch.scheduleCron } : {}),
    ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.purpose !== undefined ? { purpose: patch.purpose } : {}), ...(patch.webhookUrl !== undefined ? { webhook_url: patch.webhookUrl } : {}), ...(patch.config ? { config: patch.config } : {})
  }, signal, retryable: false });
}
export function deleteMonitor(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<void> { return client.request('agent', `/v1/monitors/${encodeURIComponent(id)}`, { method: 'DELETE', signal, retryable: false }); }
export function runMonitorNow(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<MonitorResponse> { return client.request('agent', `/v1/monitors/${encodeURIComponent(id)}/runs`, { method: 'POST', signal, retryable: false }); }
