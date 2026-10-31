# TinyFish Integration

Canonical implementation and endpoint notes: [docs/mindora/TINYFISH_INTEGRATION.md](docs/mindora/TINYFISH_INTEGRATION.md).

Credentials are read in Electron main/trusted server code from `TINYFISH_API_KEY`; `.env.example` contains placeholders and `.env` is ignored. Search and Fetch remain callable without a paid-operation prompt under the provided free-service assumption. Electron main-process confirmation is required before Research, Browser automation, Monitor creation and manual Monitor runs. Deep Research is also approval-gated in agent plans.

This pass did not make a paid TinyFish call. The installed smoke app had no TinyFish key available. Search/Fetch and other API contracts have mock-based coverage; account authorization, current entitlement and live data are therefore unverified. Cost estimates and configurable spending caps remain incomplete.

Official references reviewed: [Search](https://docs.tinyfish.ai/search-api/reference), [Fetch](https://docs.tinyfish.ai/fetch-api/reference), and [Agent](https://docs.tinyfish.ai/agent-api/reference). Search supports `GET https://api.search.tinyfish.ai` with documented filters; Fetch supports `POST https://api.fetch.tinyfish.ai` and up to ten HTTP(S) URLs per request; Agent automation supports async run endpoints and requires `X-API-Key`. See the canonical document for additional operations and limitations.
