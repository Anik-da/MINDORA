# MINDORA

**Your personal AI. Beyond assistance.**

MINDORA is primarily an installable Electron desktop application for Windows, with an optional authenticated web dashboard kept separate from the desktop product. The installed desktop app opens its own local Electron windows, works without Chrome or Edge, provides user-triggered screen guidance and an agent workspace, and runs MIKO as an independent floating companion. AI provider operations need an internet connection; local settings, the desktop shell, and pet preferences remain on the device. The web dashboard is not required and cannot observe a user's desktop.

> This repository is not a published production release. Local verification is recorded below; live provider accounts, Windows upgrade behavior, and code signing still require release-owner validation. No current MINDORA installer download is published here.

## Product capabilities

- **Desktop screen coaching:** user-triggered screen capture, local OCR, Gemini guidance, progress verification, recovery steps, and Calc-scoped OCR-grounded overlays. Other desktop applications receive text-only guidance. The app does not click/type automatically.
- **Agent tasks:** Gemini planning, typed tool selection, dependency-aware execution, evidence, task history, pause/resume/cancel, retries for safe operations, and approvals for consequential writes.
- **Web research and browser work:** TinyFish Search/Fetch, asynchronous research, goal-based browser runs, provider monitors, usage/profile information where enabled by account. Features can be unavailable due to provider entitlement, balance, or service configuration.
- **MIKO:** independent transparent desktop companion, hover-only quick actions, native context menu, event-driven task bubble, saved multi-monitor placement, click-through behavior, and bundled selectable mascots. Current chat and voice requests enter the task workflow; persistent conversational chat and mouse/keyboard control are not implemented.
- **Web dashboard:** shared-token authenticated Tasks, Browser, Research, Monitors, History and Settings pages with authenticated HTTP and task-event streaming. Desktop capture remains on the Electron app; the web screen-coaching flow accepts an explicit image upload.

See [Architecture](docs/mindora/ARCHITECTURE.md), [User Guide](docs/mindora/USER_GUIDE.md), and [Security Review](docs/mindora/SECURITY_REVIEW.md) for boundaries and limitations.

## Run from source

Prerequisites: Node.js 20 or newer and npm. Windows 10/11 is required for native desktop capture/overlay behavior. The web app and test suite also run on supported Node platforms.

```powershell
npm ci
npm run build
npm start
```

For development: `npm run mock-ui` opens the offline coach state selector; `npm run coach` opens the coach surface. MIKO remains visible independently until disabled or MINDORA is quit from the application menu.

### Web dashboard

```powershell
npm ci
npm run build:web
$env:MINDORA_WEB_ACCESS_TOKEN = "use-a-random-token-at-least-24-characters"
npm run web
```

Open `http://localhost:8080` and sign in with that token. This is a local development setup; production needs TLS, private access, a strong token, and durable private storage. The web service currently has a shared token, in-memory sessions/active task state, and no tenant separation; it is not a public multi-user service.

## Configuration and credentials

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Trusted server/desktop agent planner and web screenshot guidance. Desktop screen coaching can use its encrypted Gemini-key settings dialog instead. |
| `GEMINI_MODEL` | Optional Gemini model override. |
| `TINYFISH_API_KEY` | Trusted Electron main process or web service key for web operations. |
| `TINYFISH_BASE_URL` | Optional Agent API base URL override. |
| `TINYFISH_WEBHOOK_SECRET` | Reserved; MINDORA does not consume it or verify inbound webhooks. |
| `MINDORA_WEB_ACCESS_TOKEN` | Required web dashboard shared access token (24+ characters). |
| `MINDORA_WEB_DATA_DIR` | Optional private directory for web task/research history. |
| `PORT` | Web service port (default 8080). |

Configure secrets in the trusted process environment or deployment secret manager. Do not commit `.env` or enter API keys in task text. The desktop Gemini coaching key uses Electron `safeStorage` where available and falls back to session-only memory; agent/TinyFish credentials are environment configuration. See [Deployment](docs/mindora/DEPLOYMENT.md).

## Verification

After build, run:

```powershell
npm run typecheck
npm test
npm run test:integration
npm run build
npm run build:win
```

`npm test` executes the compiled unit suite; run `npm run build` first after source changes. `npm run test:integration` runs fixture OCR and attempts one live Gemini request only when a valid `.env` key is available; otherwise the Gemini API call is explicitly skipped. TinyFish behavior is mocked in tests. Neither skipped/live-credential-dependent suite is evidence of successful provider authorization.

Audit result in this workspace (2026-10-31): typecheck passed; final unit tests passed (166/166); fixture integration tests passed (7/7) with the live Gemini request skipped because no key was configured; production build passed; Windows x64 NSIS installer built and its isolated setup/launch/shutdown/uninstall smoke test passed. See [Release Checklist](docs/mindora/RELEASE_CHECKLIST.md) for remaining provider and security validation.

## Windows installer

`npm run build:win` or `npm run dist:win` runs typecheck, build, unit tests, integration tests, Windows x64 NSIS packaging, then verifies and copies the installer to `dist/MINDORA-Setup-x64.exe`. The corresponding electron-builder artifact is in `release-build/MINDORA-Setup-x64.exe`. The build is unsigned unless signing credentials/configuration are provided. Verify the generated file and calculate SHA-256 before distribution:

```powershell
Get-AuthenticodeSignature "dist\MINDORA-Setup-x64.exe"
Get-FileHash "dist\MINDORA-Setup-x64.exe" -Algorithm SHA256
```

## Privacy and limitations

- Desktop screenshots are captured only after user action and sent to Google Gemini for the requested guidance. The overlay's grounded coordinate path is limited to tested Calc flows; MINDORA does not send mouse/keyboard input.
- Web screenshots are selected/uploaded by the user and processed by the configured web server. The web dashboard cannot access Electron IPC or local screen capture.
- TinyFish Search/Fetch and automation require a configured key. Research, profile, monitor, recording and capture features can depend on provider account entitlements. No live TinyFish API was verified for this audit.
- Desktop capture/overlay are primary-display oriented. MIKO placement supports multiple displays, but full multi-monitor screen guidance has not been verified.
- The web service uses one shared access token, in-memory session registry and active task execution. It does not provide accounts, per-user data isolation, horizontal scaling coordination or global provider quota enforcement.
- Windows installer is unsigned; clean-install, upgrade, and legacy credential migration verification remain required before general distribution.

## Project documentation

- [Architecture](docs/mindora/ARCHITECTURE.md)
- [Security review](docs/mindora/SECURITY_REVIEW.md)
- [TinyFish integration](docs/mindora/TINYFISH_INTEGRATION.md)
- [Deployment](docs/mindora/DEPLOYMENT.md)
- [User guide](docs/mindora/USER_GUIDE.md)
- [Release checklist](docs/mindora/RELEASE_CHECKLIST.md)
- [MIKO design and lifecycle](docs/mindora/MIKO.md)
