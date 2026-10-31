import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { TinyFishClient, tinyFishClientFromEnv } from '../server/integrations/tinyfish/client.js';
import { TinyFishError } from '../server/integrations/tinyfish/errors.js';
import { searchWeb } from '../server/integrations/tinyfish/search.js';
import { fetchUrls } from '../server/integrations/tinyfish/fetch.js';
import { ResearchHistoryStore, getResearch, startResearch } from '../server/integrations/tinyfish/research.js';
import { startAutomation } from '../server/integrations/tinyfish/automation.js';
import { cancelRun, getRunStepHtml, getRunStepScreenshot } from '../server/integrations/tinyfish/runs.js';
import { createMonitor, updateMonitor } from '../server/integrations/tinyfish/monitors.js';
import { createBrowserSession, terminateBrowserSession } from '../server/integrations/tinyfish/browser.js';

const calls: Array<{ url: URL; init: RequestInit }> = [];
let responders: Array<(url: URL, init: RequestInit) => Response | Promise<Response>> = [];
const logRecords: unknown[] = [];
const tempDirs: string[] = [];

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}
const mockFetch: typeof fetch = async (input, init = {}) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  calls.push({ url, init });
  const responder = responders.shift();
  if (responder) return responder(url, init);
  return json({ ok: true });
};
function client(options: { maxRetries?: number; timeoutMs?: number } = {}): TinyFishClient {
  return new TinyFishClient({
    apiKey: 'sk-tinyfish-mock-never-log',
    endpoints: { agent: 'https://mock.agent', search: 'https://mock.search', fetch: 'https://mock.fetch', browser: 'https://mock.browser' },
    minRequestIntervalMs: 0, maxConcurrentRequests: 6, ...options
  }, { fetchImpl: mockFetch, logger: (record) => logRecords.push(record) });
}

afterEach(() => { calls.length = 0; responders = []; logRecords.length = 0; for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

describe('TinyFish client security and transport', () => {
  it('uses centralized X-API-Key auth and omits secrets from structured logs', async () => {
    const api = client();
    await api.request('agent', '/v1/runs/run-1');
    assert.equal(new Headers(calls[0].init.headers).get('x-api-key'), 'sk-tinyfish-mock-never-log');
    assert.doesNotMatch(JSON.stringify(logRecords), /sk-tinyfish-mock-never-log/);
    assert.equal((logRecords[0] as { route: string }).route, '/v1/runs/run-1');
  });

  it('requires an API key and reads environment config without exposing it', () => {
    assert.throws(() => new TinyFishClient({ apiKey: '' }), (error) => error instanceof TinyFishError && error.kind === 'configuration');
    assert.throws(() => tinyFishClientFromEnv({ TINYFISH_API_KEY: '' }), (error) => error instanceof TinyFishError && error.kind === 'configuration');
    assert.equal(tinyFishClientFromEnv({ TINYFISH_API_KEY: 'valid', TINYFISH_BASE_URL: 'https://proxy.example' }) instanceof TinyFishClient, true);
  });

  it('normalizes insufficient-credit errors and does not retry non-idempotent POST requests', async () => {
    responders.push(() => json({ error: { code: 'INSUFFICIENT_CREDITS', message: 'Balance low' } }, 402));
    await assert.rejects(client().request('agent', '/v1/automation/run-async', { method: 'POST', body: {}, retryable: false }),
      (error) => error instanceof TinyFishError && error.kind === 'insufficient_credits' && error.status === 402);
    assert.equal(calls.length, 1);
  });

  it('retries idempotent GET on transient provider errors', async () => {
    responders.push(() => json({ error: { code: 'BACKEND_UNAVAILABLE' } }, 503), () => json({ ready: true }));
    const value = await client({ maxRetries: 1 }).request<{ ready: boolean }>('agent', '/v1/runs');
    assert.equal(value.ready, true);
    assert.equal(calls.length, 2);
  });

  it('honors cancellation before starting a provider request', async () => {
    const controller = new AbortController(); controller.abort();
    await assert.rejects(client().request('agent', '/v1/runs', { signal: controller.signal }), (error) => error instanceof TinyFishError && error.kind === 'cancelled');
    assert.equal(calls.length, 0);
  });
});

describe('TinyFish Search and Fetch', () => {
  it('maps verified search filters to the documented query string', async () => {
    await searchWeb(client(), {
      query: 'robotics', location: 'IN', language: 'en', includeDomains: ['arxiv.org'], excludeDomains: ['forum.example'],
      domainType: 'research_paper', publicationYearMin: 2020, publicationYearMax: 2026, page: 2
    });
    const query = calls[0].url.searchParams;
    assert.equal(calls[0].url.hostname, 'mock.search');
    assert.equal(query.get('include_domains'), 'arxiv.org');
    assert.equal(query.get('exclude_domains'), 'forum.example');
    assert.equal(query.get('domain_type'), 'research_paper');
    assert.equal(query.get('page'), '2');
  });

  it('rejects incompatible search date and recency parameters before network access', async () => {
    assert.throws(() => searchWeb(client(), { query: 'x', recencyMinutes: 20, afterDate: '2026-01-01' }), TinyFishError);
    assert.throws(() => searchWeb(client(), { query: 'x', page: 11 }), TinyFishError);
    assert.equal(calls.length, 0);
  });

  it('sends documented fetch format, selector, conditional and content metadata controls', async () => {
    await fetchUrls(client(), {
      urls: ['https://example.org/article'], format: 'markdown', links: true, imageLinks: true, iframeLinks: true,
      ttl: 0, includeEtagAndLastModified: true, includeSelectors: ['main'], excludeSelectors: ['nav']
    });
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(calls[0].url.hostname, 'mock.fetch');
    assert.equal(body.format, 'markdown');
    assert.equal(body.iframe_links, true);
    assert.deepEqual(body.include_selectors, ['main']);
    assert.equal(body.ttl, 0);
  });

  it('rejects non-public protocols and invalid conditional batches', () => {
    assert.throws(() => fetchUrls(client(), { urls: ['file:///etc/passwd'] }), TinyFishError);
    assert.throws(() => fetchUrls(client(), { urls: ['https://a.example', 'https://b.example'], ifNoneMatch: 'etag' }), TinyFishError);
    assert.equal(calls.length, 0);
  });
});

describe('TinyFish Research and automation', () => {
  it('starts async research, stores history locally, and retains cited report data', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tinyfish-history-')); tempDirs.push(dir);
    const history = new ResearchHistoryStore(path.join(dir, 'research.json'));
    responders.push(() => json({ research_run_id: 'research-1', status: 'QUEUED' }));
    await startResearch(client(), { query: 'Current robotics research', mode: 'deep', domainType: 'research_paper' }, history);
    responders.push(() => json({ research_run_id: 'research-1', status: 'COMPLETED', query: 'Current robotics research', deep_result: { result: 'Findings', citations: ['https://example.org/paper'] }, evidence: [{ url: 'https://example.org/paper' }] }));
    await getResearch(client(), 'research-1', history);
    assert.equal(history.list()[0].status, 'COMPLETED');
    assert.equal(history.list()[0].query, 'Current robotics research');
    assert.deepEqual(history.list()[0].sources, [{ url: 'https://example.org/paper' }]);
    assert.doesNotMatch(fs.readFileSync(path.join(dir, 'research.json'), 'utf8'), /api.?key|secret/i);
  });

  it('starts documented async automation and maps structured output, profile and capture options', async () => {
    await startAutomation(client(), {
      url: 'https://example.org', goal: 'Navigate, inspect the page, and return title', outputSchema: { type: 'object' },
      useProfile: true, profileId: 'profile-2', captureConfig: { screenshots: true, html: true, recording: true }
    });
    const body = JSON.parse(String(calls[0].init.body));
    assert.equal(calls[0].url.pathname, '/v1/automation/run-async');
    assert.equal(body.profile_id, 'profile-2');
    assert.equal(body.capture_config.screenshots, true);
    assert.equal(body.output_schema.type, 'object');
    assert.match(body.goal, /If a CAPTCHA, MFA prompt, or website security control appears, stop/i);
    assert.throws(() => startAutomation(client(), { url: 'https://example.org', goal: 'Bypass the MFA prompt' }), TinyFishError);
  });

  it('uses documented monitor/profile/browser/run endpoints and binary screenshot responses', async () => {
    await createMonitor(client(), { type: 'search', config: { query: 'MINDORA' }, scheduleCron: '0 9 * * *' });
    await updateMonitor(client(), 'monitor-1', { status: 'paused' });
    await createBrowserSession(client(), { url: 'https://example.org' });
    await terminateBrowserSession(client(), 'session-1');
    await cancelRun(client(), 'run-1');
    responders.push(() => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { 'content-type': 'image/jpeg' } }));
    const shot = await getRunStepScreenshot(client(), 'run-1', 'step-1');
    assert.deepEqual([...shot], [0xff, 0xd8, 0xff]);
    responders.push(() => new Response('<html>captured</html>', { headers: { 'content-type': 'text/html' } }));
    assert.equal(await getRunStepHtml(client(), 'run-1', 'step-1'), '<html>captured</html>');
    assert.equal(calls[0].url.pathname, '/v1/monitors');
    assert.equal(calls[1].init.method, 'PATCH');
    assert.equal(calls[2].url.hostname, 'mock.browser');
    assert.equal(calls[3].init.method, 'DELETE');
  });

  it('rejects combined monitor lifecycle and edit patches and supports clearing webhook URLs', async () => {
    assert.throws(() => updateMonitor(client(), 'monitor-1', { status: 'paused', name: 'Renamed' }), TinyFishError);
    await updateMonitor(client(), 'monitor-1', { webhookUrl: null });
    assert.deepEqual(JSON.parse(String(calls[0].init.body)), { webhook_url: null });
  });
});
