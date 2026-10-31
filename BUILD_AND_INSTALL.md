# Build and Install

Canonical deployment notes: [docs/mindora/DEPLOYMENT.md](docs/mindora/DEPLOYMENT.md).

Build prerequisites: Windows, Node.js/npm, installed dependencies, and network access for the Windows packaging tools. From the repository root:

```powershell
npm ci
npm run typecheck
npm test
npm run test:integration
npm run build:win
```

The verified installer is `dist/MINDORA-Setup-x64.exe` (129,356,379 bytes; SHA-256 `e8beba40346f4f491555db5e078f7781e563233f91ba95819cc3b770f44b13ca`). On 2026-10-31, the build passed typecheck, 172 unit tests, 7 integration tests, Windows x64 NSIS packaging, and the isolated install/Start Menu shortcut/launch/independent MIKO/main-window-close/quit/uninstall/user-data-preservation smoke test. The installer is not code-signed. Gemini live checks were skipped without a configured Gemini key; TinyFish was not configured during the installer smoke test. No paid TinyFish requests were made.

Desktop launch from source: `npm start`. Optional web companion: `npm run build:web`, then `npm run start:web`; configure a private `MINDORA_WEB_ACCESS_TOKEN` before exposing it. The web app is optional and does not provide Electron IPC or desktop screen observation.
