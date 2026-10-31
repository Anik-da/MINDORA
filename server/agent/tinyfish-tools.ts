import { TinyFishClient } from '../integrations/tinyfish/client.js';
import { fetchUrls } from '../integrations/tinyfish/fetch.js';
import { getResearch, startResearch } from '../integrations/tinyfish/research.js';
import { searchWeb } from '../integrations/tinyfish/search.js';
import { startAutomation } from '../integrations/tinyfish/automation.js';
import { cancelRun, getRun } from '../integrations/tinyfish/runs.js';
import { AgentToolRegistry, } from './tool-registry.js';
import { AgentEvidence, AgentToolResult, waitWithSignal } from './execution-state.js';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool input must be an object.');
  return value as Record<string, unknown>;
}

function evidence(taskId: string, stepId: string, type: AgentEvidence['type'], source: string, title?: string, url?: string, detail?: string): AgentEvidence {
  return { id: `${taskId}:${stepId}:${source}:${title || ''}`, type, source, ...(title ? { title } : {}), ...(url ? { url } : {}), ...(detail ? { detail } : {}) };
}

function resultEvidence(taskId: string, stepId: string, results: unknown, baseSource: string): AgentEvidence[] {
  if (!Array.isArray(results)) return [];
  return results.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const value = item as Record<string, unknown>;
    const url = typeof value.url === 'string' ? value.url : typeof value.final_url === 'string' ? value.final_url : undefined;
    const title = typeof value.title === 'string' ? value.title : undefined;
    if (!url && !title) return [];
    return [evidence(taskId, stepId, url ? 'url' : 'provider_record', url || baseSource, title || `Result ${index + 1}`, url)];
  });
}

function requireString(input: Record<string, unknown>, field: string): string {
  if (typeof input[field] !== 'string' || !(input[field] as string).trim()) throw new Error(`Tool requires ${field}.`);
  return (input[field] as string).trim();
}

function numberOr(input: Record<string, unknown>, key: string, fallback: number): number {
  return typeof input[key] === 'number' && Number.isFinite(input[key]) ? input[key] as number : fallback;
}

export function createTinyFishTools(client: TinyFishClient, options: {
  waitMs?: number;
  maxPolls?: number;
  desktopObserve?: (input: Record<string, unknown>, context: { taskId: string; stepId: string; signal: AbortSignal }) => Promise<AgentToolResult>;
} = {}): AgentToolRegistry {
  const registry = new AgentToolRegistry();
  registry.register({
    id: 'tinyfish.search', capability: 'read', maxAttempts: 3,
    description: 'Search the public web, news, or research papers. Input fields: query (required), purpose, location, language, includeDomains, excludeDomains, recencyMinutes, afterDate, beforeDate, domainType, publicationYearMin, publicationYearMax, page.',
    async execute(raw, context) {
      const input = object(raw);
      const response = await searchWeb(client, {
        query: requireString(input, 'query'), purpose: typeof input.purpose === 'string' ? input.purpose : undefined,
        location: typeof input.location === 'string' ? input.location : undefined, language: typeof input.language === 'string' ? input.language : undefined,
        includeDomains: Array.isArray(input.includeDomains) ? input.includeDomains.filter((v): v is string => typeof v === 'string') : undefined,
        excludeDomains: Array.isArray(input.excludeDomains) ? input.excludeDomains.filter((v): v is string => typeof v === 'string') : undefined,
        recencyMinutes: typeof input.recencyMinutes === 'number' ? input.recencyMinutes : undefined,
        afterDate: typeof input.afterDate === 'string' ? input.afterDate : undefined, beforeDate: typeof input.beforeDate === 'string' ? input.beforeDate : undefined,
        domainType: input.domainType === 'news' || input.domainType === 'research_paper' ? input.domainType : 'web',
        publicationYearMin: typeof input.publicationYearMin === 'number' ? input.publicationYearMin : undefined,
        publicationYearMax: typeof input.publicationYearMax === 'number' ? input.publicationYearMax : undefined,
        page: typeof input.page === 'number' ? input.page : undefined
      }, context.signal);
      const sources = resultEvidence(context.taskId, context.stepId, response.results, 'TinyFish Search');
      if (!sources.length) sources.push(evidence(context.taskId, context.stepId, 'provider_record', 'TinyFish Search', 'Search response', undefined, `Returned ${response.total_results} result(s).`));
      return { output: response, evidence: sources };
    }
  });

  registry.register({
    id: 'tinyfish.fetch', capability: 'read', maxAttempts: 2,
    description: 'Fetch public HTTP(S) URLs and extract content. Input fields: urls (required array), purpose, format (markdown/html/json), links, imageLinks, iframeLinks, includeSelectors, excludeSelectors.',
    async execute(raw, context) {
      const input = object(raw);
      if (!Array.isArray(input.urls) || input.urls.some((url) => typeof url !== 'string')) throw new Error('Fetch tool requires a urls array.');
      const response = await fetchUrls(client, {
        urls: input.urls as string[], purpose: typeof input.purpose === 'string' ? input.purpose : undefined,
        format: input.format === 'html' || input.format === 'json' ? input.format : 'markdown',
        links: typeof input.links === 'boolean' ? input.links : undefined,
        imageLinks: typeof input.imageLinks === 'boolean' ? input.imageLinks : undefined,
        iframeLinks: typeof input.iframeLinks === 'boolean' ? input.iframeLinks : undefined,
        includeSelectors: Array.isArray(input.includeSelectors) ? input.includeSelectors.filter((v): v is string => typeof v === 'string') : undefined,
        excludeSelectors: Array.isArray(input.excludeSelectors) ? input.excludeSelectors.filter((v): v is string => typeof v === 'string') : undefined
      }, context.signal);
      const sources = resultEvidence(context.taskId, context.stepId, response.results, 'TinyFish Fetch');
      return { output: response, evidence: sources };
    }
  });

  registry.register({
    id: 'tinyfish.research', capability: 'write', maxAttempts: 1,
    description: 'Start a metered TinyFish deep research job; requires explicit user approval before any provider request. Then retrieve cited results. Input fields: query (required), mode (deep/max), outputLanguage, weakSourcesEnabled, domainType.',
    async execute(raw, context) {
      const input = object(raw);
      const started = await startResearch(client, {
        query: requireString(input, 'query'), mode: input.mode === 'max' ? 'max' : 'deep',
        outputLanguage: typeof input.outputLanguage === 'string' ? input.outputLanguage : undefined,
        weakSourcesEnabled: typeof input.weakSourcesEnabled === 'boolean' ? input.weakSourcesEnabled : undefined,
        domainType: input.domainType === 'news' || input.domainType === 'research_paper' ? input.domainType : 'web'
      }, undefined, context.signal);
      const id = String(started.research_run_id || started.run_id || started.id || '');
      if (!id) throw new Error('TinyFish Research did not return a run ID.');
      let response = started;
      const polls = options.maxPolls ?? 900;
      for (let attempt = 0; attempt < polls; attempt++) {
        if (context.signal.aborted) throw context.signal.reason;
        const status = String(response.status || '').toUpperCase();
        if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) break;
        await waitWithSignal(options.waitMs ?? 2000, context.signal);
        response = await getResearch(client, id, undefined, context.signal);
      }
      if (!['COMPLETED', 'COMPLETE', 'SUCCEEDED'].includes(String(response.status || '').toUpperCase())) throw new Error(`TinyFish Research finished with status ${String(response.status || 'unknown')}.`);
      const sources = Array.isArray(response.evidence) ? response.evidence : Array.isArray(response.sources) ? response.sources : Array.isArray(response.deep_result?.citations) ? response.deep_result.citations : [];
      const evidenceItems = sources.flatMap((source, index) => {
        if (typeof source === 'string' && /^https?:\/\//i.test(source)) return [evidence(context.taskId, context.stepId, 'url', source, `Research source ${index + 1}`, source)];
        if (!source || typeof source !== 'object') return [];
        const item = source as Record<string, unknown>;
        const url = typeof item.url === 'string' ? item.url : undefined;
        const title = typeof item.title === 'string' ? item.title : undefined;
        if (!url && !title) return [];
        return [evidence(context.taskId, context.stepId, url ? 'url' : 'provider_record', url || 'TinyFish Research', title || `Research source ${index + 1}`, url)];
      });
      if (!evidenceItems.length) evidenceItems.push(evidence(context.taskId, context.stepId, 'provider_run', `TinyFish Research run ${id}`, 'Completed research run', undefined, 'Provider reported completion; citation objects were not returned.'));
      return { output: response, evidence: evidenceItems };
    }
  });

  registry.register({
    id: 'tinyfish.automation', capability: 'write', maxAttempts: 1,
    description: 'Run an asynchronous goal-based browser task (navigation, clicking, form entry, structured extraction); requires user approval before execution. Input fields: url and goal (required), outputSchema (optional).',
    async execute(raw, context) {
      const input = object(raw);
      const goal = requireString(input, 'goal');
      if (/\b(bypass|solve|circumvent)\b.{0,30}\b(captcha|mfa|multi.factor|security challenge)\b/i.test(goal)) throw new Error('Automation cannot bypass CAPTCHA, MFA, or website security controls.');
      let runId = '';
      try {
        const started = await startAutomation(client, {
          url: requireString(input, 'url'),
          goal: `${goal}\nIf a CAPTCHA, MFA prompt, or security control appears, stop and report that human action is required. Do not bypass or solve it.`,
          outputSchema: input.outputSchema && typeof input.outputSchema === 'object' ? input.outputSchema as Record<string, unknown> : undefined,
          captureConfig: { screenshots: true, html: true, recording: false }
        }, context.signal);
        runId = String(started.run_id || '');
        if (!runId) throw new Error('TinyFish Automation did not return a run ID.');
        let response = started;
        for (let attempt = 0; attempt < (options.maxPolls ?? 900); attempt++) {
          if (context.signal.aborted) throw context.signal.reason;
          const status = String(response.status || '').toUpperCase();
          if (['COMPLETED', 'FAILED', 'CANCELLED'].includes(status)) break;
          await waitWithSignal(options.waitMs ?? 2000, context.signal);
          response = await getRun(client, runId, context.signal);
        }
        if (String(response.status || '').toUpperCase() !== 'COMPLETED') throw new Error(`TinyFish Automation finished with status ${String(response.status || 'unknown')}.`);
        const evidenceItems = [evidence(context.taskId, context.stepId, 'provider_run', `TinyFish run ${runId}`, 'Completed browser run', undefined, `Provider reported ${response.num_of_steps || 0} browser step(s).`)];
        const stepEvidence = resultEvidence(context.taskId, context.stepId, response.steps, 'TinyFish Automation');
        return { output: response, evidence: [...evidenceItems, ...stepEvidence] };
      } catch (error) {
        if (context.signal.aborted && runId) await cancelRun(client, runId).catch(() => undefined);
        throw error;
      }
    }
  });

  if (options.desktopObserve) registry.register({
    id: 'desktop.observe', capability: 'read', maxAttempts: 1,
    description: 'Observe the user-authorized foreground desktop application and return verified guidance from the existing MINDORA desktop coach.',
    execute: (input, context) => options.desktopObserve!(input, context)
  });

  return registry;
}
