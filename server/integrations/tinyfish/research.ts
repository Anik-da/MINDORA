import * as fs from 'node:fs';
import * as path from 'node:path';
import { TinyFishClient } from './client.js';
import { TinyFishError } from './errors.js';
import { ResearchHistoryEntry, ResearchRequest, ResearchRunResponse, TinyFishJson } from './types.js';

function toBody(input: ResearchRequest): TinyFishJson {
  if (!input.query.trim() || input.query.length > 10_000) throw new TinyFishError('Research query must contain 1 to 10,000 characters.', 'validation');
  if (input.recencyMinutes && (input.afterDate || input.beforeDate)) throw new TinyFishError('recencyMinutes cannot be combined with date filters.', 'validation');
  if (input.domainType === 'research_paper' && (input.recencyMinutes || input.afterDate || input.beforeDate)) throw new TinyFishError('Date and recency filters are unavailable for research paper searches.', 'validation');
  if (input.sessionId && input.priorRunId) throw new TinyFishError('sessionId and priorRunId cannot be combined.', 'validation');
  return {
    query: input.query.trim(), ...(input.mode ? { mode: input.mode } : {}), ...(input.stream !== undefined ? { stream: input.stream } : {}),
    ...(input.outputLanguage ? { output_language: input.outputLanguage } : {}), ...(input.weakSourcesEnabled !== undefined ? { weak_sources_enabled: input.weakSourcesEnabled } : {}),
    ...(input.domainType ? { domain_type: input.domainType } : {}), ...(input.afterDate ? { after_date: input.afterDate } : {}), ...(input.beforeDate ? { before_date: input.beforeDate } : {}),
    ...(input.recencyMinutes ? { recency_minutes: input.recencyMinutes } : {}), ...(input.domainFilter ? { domain_filter: input.domainFilter } : {}),
    ...(input.priorRunId ? { prior_run_id: input.priorRunId } : {}), ...(input.sessionId ? { session_id: input.sessionId } : {})
  };
}

export class ResearchHistoryStore {
  constructor(private readonly filePath: string) {}
  list(): ResearchHistoryEntry[] {
    try { const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8')); return Array.isArray(data) ? data as ResearchHistoryEntry[] : []; }
    catch { return []; }
  }
  upsert(entry: ResearchHistoryEntry): void {
    const history = this.list().filter((item) => item.researchRunId !== entry.researchRunId);
    history.unshift(entry);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(history.slice(0, 100), null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temp, this.filePath);
  }
}

export async function startResearch(client: TinyFishClient, input: ResearchRequest, history?: ResearchHistoryStore, signal?: AbortSignal): Promise<ResearchRunResponse> {
  const body = toBody(input);
  const result = await client.request<TinyFishJson>('agent', '/v1/automation/run-research-async', { method: 'POST', body, signal, retryable: false });
  const id = String(result.research_run_id || result.run_id || result.id || '');
  if (id && history) history.upsert({ researchRunId: id, query: input.query.trim(), status: String(result.status || 'QUEUED'), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  return result;
}

export async function getResearch(client: TinyFishClient, id: string, history?: ResearchHistoryStore, signal?: AbortSignal): Promise<ResearchRunResponse> {
  const result = await client.request<TinyFishJson>('agent', `/v1/research-run/${encodeURIComponent(id)}`, { signal, retryable: true });
  if (history) {
    const current = history.list().find((item) => item.researchRunId === id);
    const deepResult = result.deep_result && typeof result.deep_result === 'object' ? result.deep_result as Record<string, unknown> : undefined;
    const citations = deepResult?.citations;
    history.upsert({
      researchRunId: id, query: String(result.query || current?.query || ''), status: String(result.status || 'UNKNOWN'),
      createdAt: String(result.created_at || current?.createdAt || new Date().toISOString()), updatedAt: new Date().toISOString(),
      report: result.report || deepResult?.result || result.synthesis || current?.report,
      sources: Array.isArray(result.sources) ? result.sources : Array.isArray(result.evidence) ? result.evidence : Array.isArray(citations) ? citations : current?.sources
    });
  }
  return result;
}

export function listResearch(client: TinyFishClient, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<TinyFishJson> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) query.set(key, String(value));
  return client.request('agent', `/v1/research-run${query.size ? `?${query}` : ''}`, { signal, retryable: true });
}

export function cancelResearch(client: TinyFishClient, id: string, signal?: AbortSignal): Promise<ResearchRunResponse> {
  return client.request('agent', `/v1/research-run/${encodeURIComponent(id)}/cancel`, { method: 'POST', signal, retryable: true });
}
