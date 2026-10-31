import { TinyFishClient } from './client.js';
import { SearchRequest, SearchResponse } from './types.js';
import { TinyFishError } from './errors.js';

function validateDate(value: string | undefined, name: string): void {
  if (value !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TinyFishError(`${name} must use YYYY-MM-DD format.`, 'validation');
}

export function searchWeb(client: TinyFishClient, input: SearchRequest, signal?: AbortSignal): Promise<SearchResponse> {
  if (!input.query.trim()) throw new TinyFishError('Search query is required.', 'validation');
  if (input.recencyMinutes !== undefined && (input.afterDate || input.beforeDate)) throw new TinyFishError('recencyMinutes cannot be combined with date filters.', 'validation');
  if (input.domainType === 'research_paper' && input.recencyMinutes !== undefined) throw new TinyFishError('recencyMinutes is unavailable for research paper search.', 'validation');
  validateDate(input.afterDate, 'afterDate'); validateDate(input.beforeDate, 'beforeDate');
  if (input.afterDate && input.beforeDate && input.afterDate > input.beforeDate) throw new TinyFishError('afterDate must be no later than beforeDate.', 'validation');
  if (input.page !== undefined && (!Number.isInteger(input.page) || input.page < 0 || input.page > 10)) throw new TinyFishError('page must be an integer from 0 to 10.', 'validation');
  const params = new URLSearchParams({ query: input.query.trim() });
  const set = (name: string, value: string | number | undefined) => { if (value !== undefined) params.set(name, String(value)); };
  set('purpose', input.purpose); set('location', input.location); set('language', input.language);
  set('include_domains', input.includeDomains?.join(',')); set('exclude_domains', input.excludeDomains?.join(','));
  set('recency_minutes', input.recencyMinutes); set('after_date', input.afterDate); set('before_date', input.beforeDate);
  set('domain_type', input.domainType); set('pub_year_min', input.publicationYearMin); set('pub_year_max', input.publicationYearMax); set('page', input.page);
  return client.request('search', `/?${params.toString()}`, { signal, retryable: true, rateLimitCost: 1 });
}
