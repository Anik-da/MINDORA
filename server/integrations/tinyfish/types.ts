export type TinyFishService = 'agent' | 'search' | 'fetch' | 'browser';
export type SearchDomainType = 'web' | 'news' | 'research_paper';
export type FetchFormat = 'markdown' | 'html' | 'json';
export type ResearchMode = 'deep' | 'max';
export type TinyFishJson = Record<string, unknown>;

export interface SearchResult {
  position?: number;
  site_name?: string;
  title?: string;
  url?: string;
  snippet?: string;
  date?: string;
  publisher?: string;
  authors?: string[];
  venue?: string;
  year?: number;
  cited_by_count?: number;
  pdf_url?: string;
  [key: string]: unknown;
}
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
  page: number;
  [key: string]: unknown;
}
export interface FetchResult {
  url: string;
  final_url?: string;
  title?: string | null;
  description?: string | null;
  language?: string | null;
  author?: string | null;
  published_date?: string | null;
  text?: string | Record<string, unknown> | null;
  links?: string[];
  image_links?: string[];
  iframe_links?: string[];
  [key: string]: unknown;
}
export interface FetchResponse { results: FetchResult[]; errors?: Array<Record<string, unknown>>; [key: string]: unknown }
export interface TinyFishRunResponse {
  run_id?: string;
  status?: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | string;
  goal?: string;
  created_at?: string;
  started_at?: string | null;
  finished_at?: string | null;
  num_of_steps?: number | null;
  result?: TinyFishJson | null;
  error?: unknown;
  [key: string]: unknown;
}
export interface ResearchRunResponse extends TinyFishJson {
  research_run_id?: string;
  run_id?: string;
  id?: string;
  status?: string;
  query?: string;
  deep_result?: { result?: string; citations?: unknown[]; [key: string]: unknown };
  evidence?: unknown[];
  [key: string]: unknown;
}
export interface TinyFishWalletResponse extends TinyFishJson {
  balance?: number;
  currency?: string;
  rates?: Record<string, number>;
}
export interface MonitorResponse extends TinyFishJson {
  monitor?: Record<string, unknown>;
  monitors?: Array<Record<string, unknown>>;
  run?: Record<string, unknown>;
}

export interface TinyFishConfig {
  apiKey: string;
  baseUrl?: string;
  endpoints?: Partial<Record<TinyFishService, string>>;
  timeoutMs?: number;
  maxRetries?: number;
  minRequestIntervalMs?: number;
  maxConcurrentRequests?: number;
  rateLimitsPerMinute?: Partial<Record<TinyFishService, number>>;
}

export interface TinyFishLogger {
  (record: { event: 'tinyfish.request'; service: TinyFishService; route: string; status?: number; duration_ms: number; attempt: number; error_code?: string }): void;
}

export interface SearchRequest {
  query: string;
  purpose?: string;
  location?: string;
  language?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  recencyMinutes?: number;
  afterDate?: string;
  beforeDate?: string;
  domainType?: SearchDomainType;
  publicationYearMin?: number;
  publicationYearMax?: number;
  page?: number;
}

export interface FetchRequest {
  urls: string[];
  purpose?: string;
  format?: FetchFormat;
  links?: boolean;
  imageLinks?: boolean;
  iframeLinks?: boolean;
  ttl?: number;
  perUrlTimeoutMs?: number;
  ifNoneMatch?: string;
  ifModifiedSince?: string;
  includeEtagAndLastModified?: boolean;
  includeSelectors?: string[];
  excludeSelectors?: string[];
}

export interface ResearchRequest {
  query: string;
  mode?: ResearchMode;
  stream?: boolean;
  outputLanguage?: string;
  weakSourcesEnabled?: boolean;
  domainType?: SearchDomainType;
  afterDate?: string;
  beforeDate?: string;
  recencyMinutes?: number;
  domainFilter?: { prefer?: string[]; require?: string[]; block?: string[] };
  priorRunId?: string;
  sessionId?: string;
}

export interface AutomationRequest {
  url: string;
  goal: string;
  outputSchema?: TinyFishJson;
  browserProfile?: 'lite' | 'stealth';
  proxyConfig?: { enabled?: boolean; type?: 'tinyfish' | 'custom'; countryCode?: string; url?: string; username?: string; password?: string };
  agentConfig?: { mode?: 'default' | 'strict'; maxSteps?: number; maxDurationSeconds?: number };
  webhookUrl?: string;
  captureConfig?: { screenshots?: boolean; recording?: boolean; html?: boolean; snapshots?: boolean; elements?: boolean };
  useProfile?: boolean;
  profileId?: string;
  useVault?: boolean;
  credentialItemIds?: string[];
}

export interface TinyFishApiErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  code?: string;
  message?: string;
  request_id?: string;
}

export interface ResearchHistoryEntry {
  researchRunId: string;
  query: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  report?: unknown;
  sources?: unknown[];
}

export interface TinyFishUsageQuery {
  limit?: number;
  page?: number;
  status?: 'completed' | 'failed';
  owner?: 'me' | 'team';
  startAfter?: string;
  endBefore?: string;
  createdAfter?: string;
  createdBefore?: string;
}
