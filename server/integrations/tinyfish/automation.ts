import { TinyFishClient } from './client.js';
import { TinyFishError } from './errors.js';
import { AutomationRequest, TinyFishRunResponse, TinyFishJson } from './types.js';

function requestBody(input: AutomationRequest): TinyFishJson {
  let target: URL;
  try { target = new URL(input.url); } catch { throw new TinyFishError('Automation requires a valid target URL.', 'validation'); }
  if (!['http:', 'https:'].includes(target.protocol) || !input.goal.trim()) throw new TinyFishError('Automation requires an HTTP(S) URL and a goal.', 'validation');
  if (/\b(bypass|solve|circumvent)\b.{0,30}\b(captcha|mfa|multi.factor|security challenge)\b/i.test(input.goal)) throw new TinyFishError('Automation cannot bypass CAPTCHA, MFA, or website security controls.', 'validation');
  const safeGoal = `${input.goal.trim()}\nIf a CAPTCHA, MFA prompt, or website security control appears, stop and report that human action is required. Do not bypass or solve it.`;
  if (input.profileId && !input.useProfile) throw new TinyFishError('profileId requires useProfile=true.', 'validation');
  if (input.credentialItemIds?.length && !input.useVault) throw new TinyFishError('credentialItemIds requires useVault=true.', 'validation');
  const proxy = input.proxyConfig;
  return {
    url: target.toString(), goal: safeGoal, ...(input.outputSchema ? { output_schema: input.outputSchema } : {}),
    ...(input.browserProfile ? { browser_profile: input.browserProfile } : {}),
    ...(proxy ? { proxy_config: { ...(proxy.enabled !== undefined ? { enabled: proxy.enabled } : {}), ...(proxy.type ? { type: proxy.type } : {}), ...(proxy.countryCode ? { country_code: proxy.countryCode } : {}), ...(proxy.url ? { url: proxy.url } : {}), ...(proxy.username ? { username: proxy.username } : {}), ...(proxy.password ? { password: proxy.password } : {}) } } : {}),
    ...(input.agentConfig ? { agent_config: { ...(input.agentConfig.mode ? { mode: input.agentConfig.mode } : {}), ...(input.agentConfig.maxSteps !== undefined ? { max_steps: input.agentConfig.maxSteps } : {}), ...(input.agentConfig.maxDurationSeconds !== undefined ? { max_duration_seconds: input.agentConfig.maxDurationSeconds } : {}) } } : {}),
    ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}), ...(input.captureConfig ? { capture_config: input.captureConfig } : {}),
    ...(input.useProfile !== undefined ? { use_profile: input.useProfile } : {}), ...(input.profileId ? { profile_id: input.profileId } : {}),
    ...(input.useVault !== undefined ? { use_vault: input.useVault } : {}), ...(input.credentialItemIds ? { credential_item_ids: input.credentialItemIds } : {})
  };
}

/** Async Agent run; natural-language goals cover navigation, clicks, forms, and structured extraction. */
export function startAutomation(client: TinyFishClient, input: AutomationRequest, signal?: AbortSignal): Promise<TinyFishRunResponse> {
  return client.request('agent', '/v1/automation/run-async', { method: 'POST', body: requestBody(input), signal, retryable: false });
}

/** SSE mode is supported by TinyFish; raw event text stays in the trusted process. */
export async function startAutomationSse(client: TinyFishClient, input: AutomationRequest, signal?: AbortSignal): Promise<string> {
  const events = await client.request<string>('agent', '/v1/automation/run-sse', {
    method: 'POST', body: requestBody(input), signal, retryable: false, headers: { Accept: 'text/event-stream' }, timeoutMs: 10 * 60_000
  });
  return events;
}
