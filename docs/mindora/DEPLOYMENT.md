# MINDORA deployment

## Required and optional environment

| Variable | Surface | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Web service; optional desktop agent planner | Gemini-backed agent planning and web screenshot guidance. Desktop screen coaching can instead use the encrypted key configured in its Gemini dialog. |
| `GEMINI_MODEL` | Trusted Electron/server process | Optional Gemini model override. |
| `TINYFISH_API_KEY` | Trusted Electron/server process | Search, Fetch, research, browser runs, profiles, monitors, wallet and usage. |
| `TINYFISH_BASE_URL` | Trusted Electron/server process | Optional TinyFish Agent API base URL; does not replace Search/Fetch/Browser hosts. |
| `TINYFISH_WEBHOOK_SECRET` | Not currently consumed | Reserved only. MINDORA has no inbound TinyFish webhook signature verification. |
| `MINDORA_WEB_ACCESS_TOKEN` | Web service | Required shared dashboard sign-in token; minimum 24 characters. Use a random secret. |
| `MINDORA_WEB_DATA_DIR` | Web service | Optional private writable directory for web task and research history. |
| `PORT` | Web service | Optional HTTP port; defaults to 8080. |

Do not commit `.env`, real keys, task-history files, screenshots or capture data. The Electron app reads TinyFish and agent-planner values from its launching process environment; shell-only variables may not be inherited by Start Menu launches. Configure them in the user's environment before starting MINDORA. Electron's built-in Gemini coaching-key dialog stores its key in OS-protected `safeStorage` when supported.

## Windows desktop release

Prerequisites: Node.js 20+ (CI used Node 24), npm, Windows x64, and network access for installer dependencies.

```powershell
npm ci
npm run build:win
```

`npm run build:win` and its alias `npm run dist:win` run typecheck, compile/copy assets, unit tests, integration tests, electron-builder NSIS x64 packaging, and artifact verification. The final installer is copied to `dist/MINDORA-Setup-x64.exe`; the raw electron-builder output is `release-build/MINDORA-Setup-x64.exe`. The blockmap remains alongside the raw installer. Build output is unsigned unless signing configuration and a valid certificate are provided. The desktop app launches local Electron windows and does not require the optional web service or a browser. Gemini/TinyFish operations require internet access and valid provider configuration; local preferences, the desktop shell, the companion and local screen classification do not require a hosted MINDORA frontend. No automatic-update mechanism is configured.

Check signature and hash with:

```powershell
Get-AuthenticodeSignature "dist\MINDORA-Setup-x64.exe"
Get-FileHash "dist\MINDORA-Setup-x64.exe" -Algorithm SHA256
```

Before publishing, install on a clean supported Windows profile, launch without a development `.env`, test MIKO and the app menu, check the Gemini credential lifecycle, upgrade from a copied legacy Unstuck profile, and verify uninstall preserves app data. Keep the old userData folder and backup until the migrated credential is proven usable. Do not distribute the local build as a signed or provider-verified release.

## Web service

The root Dockerfile builds a Node 22 container and starts `node dist/server/server.js`. Railway configuration uses the Dockerfile and `/healthz`. Deploy behind TLS and a private network/access proxy. Set the shared access token and provider keys as the hosting platform's secrets, not as Docker build arguments. Point `MINDORA_WEB_DATA_DIR` to private durable storage.

The current auth model has one shared token and in-memory sessions/task execution. Run one service instance: horizontal replicas do not share sessions, pending approvals, active agent state or SSE events. History is file-backed but must use persistent private storage. The service currently has no global account or task quota. Do not expose it as a public multi-tenant service.

For local web development:

```powershell
npm ci
npm run build:web
$env:MINDORA_WEB_ACCESS_TOKEN = "a-local-random-token-of-at-least-24-chars"
npm run web
```

Open `http://localhost:8080`. This local HTTP setup is for development only; production must use HTTPS. The web app accepts user-selected screenshot uploads but cannot access the local desktop.

## Release evidence for this workspace

On 2026-10-31, typecheck, unit tests, web/Electron TypeScript build, and Windows x64 NSIS packaging completed. The live Gemini test was skipped because no key was configured. TinyFish tests used mocks; no live TinyFish key was configured. GUI install/upgrade, signing, and live API smoke tests remain release-owner tasks. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).
