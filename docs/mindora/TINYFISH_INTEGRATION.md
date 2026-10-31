# TinyFish Integration

This integration uses TinyFish's REST APIs directly. The ChatGPT TinyFish MCP connector is a separate product integration and is not used by MINDORA. TinyFish authentication is centralized in the Electron main process or trusted web server with the `X-API-Key` header. `TINYFISH_API_KEY` is read from the process environment and is never sent to renderer code.

**Verification status (2026-10-31):** endpoint wrappers and request/response mappings have mock-based tests. Official TinyFish Search and Fetch API pages were reviewed for service hosts and advertised formats; official TinyFish research material documents asynchronous research creation, status polling, events and cancellation. This workspace has no authorized TinyFish key, so live account authorization, entitlements, current limits, and account-specific optional fields have not been verified. Do not interpret mock results as provider availability evidence. Re-check the official API references before each release.

## Configuration

Set these variables in the environment inherited by the MINDORA process (or by the trusted server process when deployed as a service):

```dotenv
TINYFISH_API_KEY=
TINYFISH_BASE_URL=https://agent.tinyfish.ai
TINYFISH_WEBHOOK_SECRET=
```

`TINYFISH_BASE_URL` overrides the Agent API base URL only. Search, Fetch, and Browser use their documented service hosts unless a trusted code caller supplies endpoint overrides. The blank webhook secret is reserved: TinyFish documents outgoing webhook URLs, but the reviewed documentation does not define webhook signing or a secret-validation scheme. MINDORA therefore does not consume this variable or expose an inbound webhook endpoint. Never put actual credentials in source control, renderer code, URLs, browser storage, or logs.

## Implemented endpoints

All calls use `X-API-Key`; the common client validates secure service URLs, applies timeouts, bounded retries for retry-safe requests, cancellation, concurrency control, request pacing, and rolling service rate limits. Current defaults mirror the documented personal Search (30 calls/minute) and Fetch (150 URLs/minute) limits; account-specific limits can differ. Set `rateLimitsPerMinute` in trusted client construction for a different entitlement. Logs contain service, path, status, duration, attempt, and provider error code only.

| Capability | API | Request/response coverage |
| --- | --- | --- |
| Search | `GET https://api.search.tinyfish.ai/` | `query`, `purpose`, `location`, `language`, `include_domains`, `exclude_domains`, `recency_minutes`, `after_date`, `before_date`, `domain_type` (`web`, `news`, `research_paper`), `pub_year_min`, `pub_year_max`, `page` (0–10). Search wrapper validates documented filter combinations. |
| Fetch | `POST https://api.fetch.tinyfish.ai/` | `urls` (1–10), `purpose`, `format` (`markdown`, `html`, `json`), `links`, `image_links`, `iframe_links`, `ttl`, `per_url_timeout_ms`, `if_none_match`, `if_modified_since`, `include_etag_and_last_modified`, `include_selectors`, `exclude_selectors`. Conditional validators apply to a single URL; selector lists are limited to 20. JavaScript rendering is handled by TinyFish Fetch. |
| Research start/status/history/cancel | Agent API: `POST /v1/automation/run-research-async`; `GET /v1/research-run/{id}`; `GET /v1/research-run`; `GET /v1/research-run/{id}/events`; `POST /v1/research-run/{id}/cancel` | Async research request supports `query`, `mode`, `stream`, `output_language`, `weak_sources_enabled`, `domain_type`, date/recency filters, `domain_filter`, `prior_run_id`, and `session_id`. Completed response report and citations/evidence are retained in a local history file under Electron `userData` (last 100 records). Research access may be account-gated. |
| Browser automation runs | Agent API: `POST /v1/automation/run-async`; `GET /v1/runs`; `GET /v1/runs/{id}`; `POST /v1/runs/{id}/cancel`; `GET /v1/runs/{id}/steps/{stepId}/html`; `GET /v1/runs/{id}/steps/{stepId}/screenshot` | Goal-based browser work uses `url`, `goal`, optional `output_schema`, `browser_profile`, `proxy_config`, `agent_config`, `webhook_url`, `capture_config`, `use_profile`, `profile_id`, `use_vault`, and `credential_item_ids`. Screenshot, recording, HTML, snapshots, and element capture options may be account-gated. The renderer bridge strips custom proxy credentials and does not return run streaming/video access URLs. |
| Raw Browser sessions | Browser API: `POST https://api.browser.tinyfish.ai/`; `DELETE /{session_id}` | Available only to trusted code in the integration module. Creation returns a CDP URL that is a session credential, so session creation/response is not exposed through renderer IPC. Direct CDP control requires a WebSocket/CDP client; none is bundled by this integration. |
| Browser Context Profiles | Agent API: documented `/v1/profiles` create/list/get/update/delete; `/domains` operations; `/setup-session`, `/setup-session/cancel`, `/save`, and `/upload` | Module covers documented operations. Setup-session responses can contain a CDP URL; profile setup, cookie/state upload, and session handoff are intentionally not exposed in the renderer bridge. The `use_profile`/`profile_id` fields can be used in trusted automation calls. No credential-vault management API is implemented. |
| Monitors | Agent API: `/v1/monitors` list/create/get/patch/delete; `POST /v1/monitors/{id}/runs` | Documented Page/Fetch and Topic/Search monitors, `schedule_cron`, active/paused status, and optional `webhook_url`. REST run-now responses return the triggered result; the REST API does not expose a monitor run-history list endpoint. Webhook delivery/signature verification is not implemented because signing behavior is undocumented. |
| Wallet and service usage | Agent `GET /v1/wallet`; Search `GET /usage`; Fetch `GET /usage`; Browser `GET /usage` | Wallet balance and pricing/rates, plus service usage. Wallet may return `FEATURE_NOT_AVAILABLE` for legacy billing accounts. The API's 402 insufficient-credit and free-allowance errors map to `TinyFishError.kind === 'insufficient_credits'`. |

Typed public models are in `server/integrations/tinyfish/types.ts`; service operations are split among `search.ts`, `fetch.ts`, `research.ts`, `automation.ts`, `runs.ts`, `monitors.ts`, `profiles.ts`, and `wallet.ts`. `client.ts` owns authentication and transport. Electron IPC exposes narrow methods only from MINDORA's launch and coach windows. Browser session/CDP URLs, profile setup sessions, and raw TinyFish credentials remain on the trusted side.

## Limits and unsupported items

- The Search API documents web, news, and research-paper search; it does not document arbitrary independent search engines or a universal page-size parameter. `page` is the documented pagination control and is limited to 0–10.
- Research's synchronous API uses SSE; MINDORA implements asynchronous start/status/history/cancel flows. Event stream retrieval is available in the trusted module; no renderer streaming channel is exposed yet.
- Fetch conditional requests are stateless, limited to one URL, and use caller-provided validators. No client-side cache store is claimed.
- Agent execution is goal-based. It does not expose a low-level sequence of click/fill instructions in this wrapper; those actions are requested through the documented goal API.
- Monitor REST does not offer a run-history listing endpoint. MINDORA returns monitor baseline and run-now results but does not claim historical monitor result retrieval beyond the provider response.
- Monitors accept documented HTTPS webhook URLs, but there is no documented signature scheme to validate `TINYFISH_WEBHOOK_SECRET` against.
- Browser Context Profile methods are present in trusted modules, but sensitive setup-session/CDP flows and state upload are not callable from the renderer.
- TinyFish API keys are supplied externally. This integration does not provide an invented API-key vault or store third-party website credentials locally.
- The app does not bundle a Playwright/CDP driver. The documented Browser session create/delete methods are available to trusted callers, but direct browser control needs a separately selected supported CDP client.

## Official references

- [TinyFish Search API reference](https://docs.tinyfish.ai/search-api/reference)
- [TinyFish Fetch API reference](https://docs.tinyfish.ai/fetch-api/reference)
- [TinyFish Research API reference](https://docs.tinyfish.ai/research-api/reference)
- [TinyFish Agent API reference](https://docs.tinyfish.ai/agent-api/reference)
- [Browser Context Profiles](https://docs.tinyfish.ai/agent-api/browser-context-profiles)
- [TinyFish Browser API reference](https://docs.tinyfish.ai/browser-api/reference)
- [TinyFish Monitors API reference](https://docs.tinyfish.ai/monitor/api-reference)
- [TinyFish Webhooks](https://docs.tinyfish.ai/webhooks)
- [TinyFish Error Codes](https://docs.tinyfish.ai/error-codes)
- [TinyFish Search API overview](https://www.tinyfish.ai/search)
- [TinyFish Fetch API overview](https://www.tinyfish.ai/fetch)
- [TinyFish asynchronous research API walkthrough](https://www.tinyfish.ai/blog/how-to-use-tinyresearch-for-cited-reports)

## Release validation record

- `tests/tinyfish.unit.test.ts` exercises mocked authentication, request construction, errors, cancellation, retries, research, automation, runs, screenshots, monitors, profiles and wallet/usage methods.
- The general unit suite passed in the 2026-10-31 release audit. No live TinyFish API request was made because no authorized key was configured.
- Search and Fetch are standalone REST APIs at dedicated service hosts. Deep research async endpoints and streaming/status behavior are described in TinyFish's official research material. Feature entitlement, profile/vault access, monitor schedules, wallet visibility and capture options depend on the account and provider response.
- Do not retry non-idempotent run/research/monitor creation requests automatically. Preserve returned run IDs and poll/cancel by ID. Review `retryable` settings whenever adding provider operations.
