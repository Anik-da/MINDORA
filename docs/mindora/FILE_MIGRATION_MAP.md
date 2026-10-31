# MINDORA File Migration Map

Implementation map for the MINDORA rebrand. Product identity and user-data migration have now been implemented; preserve behavior while completing verification.

| Area | Current files | Planned treatment / risk |
|---|---|---|
| Package and installer identity | `package.json`, `package-lock.json` | Implemented: package/product/author, app ID `com.mindora.desktop`, executable name, installer shortcut/uninstall names and icon resource. |
| Main-process self-identification | `electron/main.ts`, `electron/window-scoping.ts` | Implemented: MINDORA process/title detection plus legacy Unstuck title handling. |
| IPC/preload naming | `electron/preload.cjs`, `electron/overlay.html`, `electron/main.ts`, renderer JS | Implemented: overlay bridge renamed to `mindoraOverlay`; sender/listener contract updated together. |
| Electron desktop UI | `electron/launch.html`, `launch.js`, `launch.css`, `coach.html`, `coach.js`, `coach.css`, `tokens.css`, `fonts.css` | Implemented: visible product copy/titles now use MINDORA; controls and state behavior are preserved. |
| Mascot artwork and references | `electron/assets/mindora.png`, `electron/launch.html`, `electron/coach.html`, CSS | Implemented: generated a new transparent companion illustration and updated visible labels/alt text without changing layout. |
| Web companion identity/mascot | `web/index.html`, `web/app.ts`, `web/styles/*.css`, `web/assets/mindora*`, `web/favicon.svg` | Implemented: title, description, theme color, favicon, visible copy, companion selectors and artwork use MINDORA; client interactions remain. |
| Asset copy and installer icon | `scripts/copy-assets.mjs`, `scripts/copy-web-assets.mjs`, `package.json` | Implemented: recursive copy scripts pick up replacement artwork and favicon; package references MINDORA icon. |
| Tests and fixtures | `tests/ui-redesign.unit.test.ts`, `tests/application-agnostic.unit.test.ts`, `tests/user-data-migration.unit.test.ts`, `tests/web-server.unit.test.ts` | Implemented: updated identity assertions and added user-data migration tests. |
| Product/docs/release references | `README.md`, `AGENTS.md`, `docs/*.md`, `Unstuck_Blueprint.md`, `Unstuck_Overnight_Pipeline.md`, deployment comments | Update active operator/product documentation and public-facing repo/release metadata. Mark historical notes rather than silently rewriting evidence. Some documents report stale file paths, capabilities or test counts. |
| Server identity/config | `server/server.ts`, `server/gemini-service.ts`, `Dockerfile`, `Procfile`, `railway.json` | Change health service identifier and deployment labels only if MINDORA web companion remains in scope. Preserve validation, session and OCR flows. |
| Shared model terminology | `shared/gemini-config.ts`, `shared/contracts.ts`, `shared/tutorial-service.ts` | Update assistant naming in prompts/comments while retaining response schema and anti-injection behavior. Avoid changing Gemini model/API behavior during a branding-only pass. |
| Persistence and caches | `electron/key-storage.ts`, `electron/target-resolver.ts`, `server/ocr-service.ts`, `shared/api-budget.ts`, `electron/main.ts`, `electron/user-data-migration.ts` | Implemented idempotent old `<appData>/Unstuck` to new `<appData>/MINDORA` copy-before-window startup. Existing files win, legacy source remains intact, and ciphertext is preserved only after safeStorage verification when available. Persistent budget helper path remains cwd based; interactive desktop budget is in-memory. |

## Identity search terms

At minimum search case-insensitively for `unstuck`, `nori`, `com.unstuck.coach`, `unstuckOverlay`, `unstuck-web`, `Unstuck Team`, repository URLs, installer filenames, userData notes, and names in image alt text. Include CSS selectors/classes, test expectations, build scripts, screenshots and historical docs.

## Suggested migration group order

1. Confirm MINDORA product naming, app ID policy, mascot source assets, web companion scope and whether old data must remain discoverable.
2. Change package/installer/app identity and self-window filtering as one reviewed group; preserve or migrate old `userData` credentials.
3. Replace/copy mascot artwork and update desktop UI references/accessibility; retain existing interactions and DOM IDs.
4. Update web identity/assets and static copy scripts, preserving screenshot upload and server contracts.
5. Update tests and active docs; maintain behavior-focused checks for capture/OCR/Gemini/overlay/session/key paths.
6. Build, typecheck, unit/integration tests, packaged installer and web container; run native Windows capture/overlay checks on a live session.

This order is a planning recommendation, not authorization to implement these changes in the baseline phase.
