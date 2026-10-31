import { TinyFishClient } from './client.js';
import { TinyFishJson } from './types.js';

export interface ProfileCreateRequest { name: string; setAsDefault?: boolean; proxyCountryCode?: string | null }
export function listProfiles(client: TinyFishClient, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('agent', '/v1/profiles', { signal, retryable: true }); }
export function createProfile(client: TinyFishClient, input: ProfileCreateRequest, signal?: AbortSignal): Promise<TinyFishJson> {
  return client.request('agent', '/v1/profiles', { method: 'POST', body: { name: input.name, ...(input.setAsDefault !== undefined ? { set_as_default: input.setAsDefault } : {}), ...(input.proxyCountryCode !== undefined ? { proxy_country_code: input.proxyCountryCode } : {}) }, signal, retryable: false });
}
export function getProfile(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}`, { signal, retryable: true }); }
export function updateProfile(client: TinyFishClient, id: string, patch: Partial<ProfileCreateRequest>, signal?: AbortSignal): Promise<TinyFishJson> {
  return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}`, { method: 'PATCH', body: { ...(patch.name ? { name: patch.name } : {}), ...(patch.setAsDefault !== undefined ? { set_as_default: patch.setAsDefault } : {}), ...(patch.proxyCountryCode !== undefined ? { proxy_country_code: patch.proxyCountryCode } : {}) }, signal, retryable: false });
}
export function deleteProfile(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<void> { return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}`, { method: 'DELETE', signal, retryable: false }); }
export function deleteProfileDomain(client: TinyFishClient, id: string, domain: string, signal?: AbortSignal): Promise<void> { return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}/domains/${encodeURIComponent(domain)}`, { method: 'DELETE', signal, retryable: false }); }
export function startProfileSetup(client: TinyFishClient, id: string, input: { url?: string; timeoutSeconds?: number }, signal?: AbortSignal): Promise<TinyFishJson> {
  return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}/setup-session`, { method: 'POST', body: { ...(input.url ? { url: input.url } : {}), ...(input.timeoutSeconds ? { timeout_seconds: input.timeoutSeconds } : {}) }, signal, retryable: false });
}
export function cancelProfileSetup(client: TinyFishClient, id: string, sessionId: string, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}/setup-session/cancel`, { method: 'POST', body: { session_id: sessionId }, signal, retryable: false }); }
export function saveProfileSetup(client: TinyFishClient, id: string, sessionId: string, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}/save`, { method: 'POST', body: { session_id: sessionId }, signal, retryable: false }); }
export function uploadProfileState(client: TinyFishClient, id: string, state: { cookies?: unknown[]; local_storage?: Record<string, unknown>; session_storage?: Record<string, unknown> }, signal?: AbortSignal): Promise<TinyFishJson> { return client.request('agent', `/v1/profiles/${encodeURIComponent(id)}/upload`, { method: 'POST', body: state, signal, retryable: false }); }
