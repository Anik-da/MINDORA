# Windows build and installation

## Build

Requires Windows, Node.js 20 or newer, npm, and installed repository dependencies.

```powershell
npm ci
npm run typecheck
npm run build
npm test
npm run test:integration
npm run build:win
```

The Windows packaging command builds an x64 NSIS installer and verifies/copies it to `dist/MINDORA-Setup-x64.exe`. NSIS supports choosing the install directory, creates Start Menu and desktop shortcuts, and keeps app data when uninstalled. The installer is unsigned unless signing configuration is provided.

## Install

Run `dist\MINDORA-Setup-x64.exe`, choose the per-user installation path, and finish setup. Open MINDORA from its Start Menu shortcut. The independent pet appears according to its saved enabled setting. The installer does not require a local web server or browser.

## Configuration

For agent planning and desktop Gemini features, configure a Gemini key from MINDORA Settings or set `GEMINI_API_KEY` in the trusted process environment. TinyFish operations require `TINYFISH_API_KEY`; optional `TINYFISH_BASE_URL` is supported where documented. Do not add credentials to the installer or renderer code. The optional authenticated web dashboard additionally needs `MINDORA_WEB_ACCESS_TOKEN`.

The desktop coaching key uses Electron `safeStorage` when available. Environment variables set after MINDORA has already launched are not visible to that running process; restart the app after changing user-level environment configuration.

## Verification status

Latest installer: `dist/MINDORA-Setup-x64.exe`, 129,352,356 bytes, SHA-256 `8B79F07E09AC8F0C12A13D6BA80AF62F303FA5BD92D0FF16E9EF83E858A651AE`; Authenticode status is `NotSigned`. Isolated setup, Start Menu shortcut, installed launch, explicit quit, uninstall, and test-data preservation passed. See `FINAL_AUDIT.md` and `RELEASE_CHECKLIST.md` for remaining provider and interactive desktop validation. A successful source build does not establish that live provider accounts or every Windows display, voice, capture, and migration scenario were validated.
