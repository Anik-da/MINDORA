import { TinyFishClient } from './client.js';
import { FetchRequest, FetchResponse } from './types.js';
import { TinyFishError } from './errors.js';

export function fetchUrls(client: TinyFishClient, input: FetchRequest, signal?: AbortSignal): Promise<FetchResponse> {
  if (!Array.isArray(input.urls) || input.urls.length < 1 || input.urls.length > 10) throw new TinyFishError('Fetch requires 1 to 10 URLs.', 'validation');
  for (const raw of input.urls) {
    let url: URL;
    try { url = new URL(raw); } catch { throw new TinyFishError('Each fetch URL must be a valid public HTTP or HTTPS URL.', 'validation'); }
    if (!['http:', 'https:'].includes(url.protocol) || ['localhost', '127.0.0.1', '::1'].includes(url.hostname)) throw new TinyFishError('Each fetch URL must be a public HTTP or HTTPS URL.', 'validation');
  }
  if (input.ifNoneMatch && input.urls.length !== 1) throw new TinyFishError('ifNoneMatch is supported only for a single URL.', 'validation');
  if (input.ifModifiedSince && input.urls.length !== 1) throw new TinyFishError('ifModifiedSince is supported only for a single URL.', 'validation');
  if ((input.includeSelectors?.length || 0) > 20 || (input.excludeSelectors?.length || 0) > 20) throw new TinyFishError('Selector lists support at most 20 entries.', 'validation');
  const body = {
    urls: input.urls,
    ...(input.purpose ? { purpose: input.purpose } : {}),
    ...(input.format ? { format: input.format } : {}),
    ...(input.links !== undefined ? { links: input.links } : {}),
    ...(input.imageLinks !== undefined ? { image_links: input.imageLinks } : {}),
    ...(input.iframeLinks !== undefined ? { iframe_links: input.iframeLinks } : {}),
    ...(input.ttl !== undefined ? { ttl: input.ttl } : {}),
    ...(input.perUrlTimeoutMs !== undefined ? { per_url_timeout_ms: input.perUrlTimeoutMs } : {}),
    ...(input.ifNoneMatch ? { if_none_match: input.ifNoneMatch } : {}),
    ...(input.ifModifiedSince ? { if_modified_since: input.ifModifiedSince } : {}),
    ...(input.includeEtagAndLastModified !== undefined ? { include_etag_and_last_modified: input.includeEtagAndLastModified } : {}),
    ...(input.includeSelectors ? { include_selectors: input.includeSelectors } : {}),
    ...(input.excludeSelectors ? { exclude_selectors: input.excludeSelectors } : {})
  };
  return client.request('fetch', '/', { method: 'POST', body, signal, retryable: false, timeoutMs: 150_000, rateLimitCost: input.urls.length });
}
