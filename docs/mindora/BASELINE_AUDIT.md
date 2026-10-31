# MINDORA Baseline Audit

**Audit date:** 2026-10-31  
**Repository:** supplied `Unstuck-main` checkout  
**Scope:** read-only application assessment and requested documentation. No application functionality was changed.

## Executive summary

Unstuck is a TypeScript/Electron desktop coach with a separate Node HTTP web companion. Electron's main process owns screen capture, Win32 foreground-window inspection, OCR, Gemini requests, app-key storage, session state, and three BrowserWindows (launch, coach, transparent overlay). The web companion is a separately served screenshot-upload client with its own OCR/Gemini/session pipeline, static site, and Docker/Railway deployment. Shared modules define guidance contracts, Gemini prompt/schema, coordinate/crop helpers, tutorial analysis, and API budgets.

The source is substantial and has explicit regression coverage for both products. The baseline cannot be verified in this checkout: `node_modules` and `dist` are absent. `npm run typecheck` and `npm run build` stop because `tsc` is unavailable; `npm test` stops because its runner expects `dist/tests` and build did not produce it. These are setup/build sequencing failures, not evidence that the source itself passes or fails compilation/tests.

## Repository inventory

- Root configuration/deployment: `package.json`, `package-lock.json`, `tsconfig.json`, `.env.example`, `.gitignore`, `Dockerfile`, `Procfile`, `railway.json`.
- Electron: `electron/main.ts`, `preload.cjs`, `launch.html/js/css`, `coach.html/js/css`, `overlay.html`, `key-storage.ts`, `gemini-coach.ts`, `candidate-extractor.ts`, `target-resolver.ts`, `window-scoping.ts`, tokens/fonts and Nori artwork.
- Web companion: `server/` HTTP handler, image validation, OCR, Gemini service and session manager; `web/` page, TypeScript client, styles, fonts and Nori assets.
- Shared: `shared/contracts.ts`, coordinates/crop geometry, Gemini config, lifecycle, tutorial service and budget.
- Tests: 15 test files (unit, integration and live/manual diagnostic scripts); synthetic/Calc image fixtures under `fixtures/`; historical demonstration images in `docs/images/`.
- Existing documentation includes architecture, blueprint, foundation, demo, handoff, status and judging documents. Several contain stale paths, claims, and prior-machine observations; treat source as the current implementation authority.

## Stack and build configuration

- Package is ESM (`type: module`), TypeScript NodeNext, strict mode, ES2022 target; output is `dist/`.
- Dependencies: Electron 44, electron-builder, TypeScript 7 and Tesseract.js 7.
- `npm run build`: `tsc`, then copies non-TS Electron assets and web assets/fixtures.
- `npm run build:web`: `tsc`, then web asset copy.
- `npm run typecheck`: `tsc --noEmit`.
- `npm test`: custom Node runner discovers only `dist/tests/*.unit.test.js`; it assumes a prior successful build. `test:integration` likewise runs compiled integration files and can require live Gemini configuration depending on the suite.
- `build:installer` uses electron-builder Windows NSIS x64; `pack` builds unpacked Electron output. Web deployment is Docker/Railway-compatible.
- TypeScript includes `shared`, `tests`, `electron`, `server`, `web`. Static HTML, JS, CSS, fonts and artwork are copied separately.

## Verification performed

| Command | Result |
|---|---|
| `npm run typecheck` | Failed before TypeScript ran: `'tsc' is not recognized`; dependencies are not installed in this checkout. |
| `npm test` | Failed before test discovery: `ENOENT` for `dist/tests`; `dist` is absent and the script does not build first. |
| `npm run build` | Failed before compilation: `'tsc' is not recognized`; no production output generated. |

No install, integration/live API call, GUI run, installer build, or additional test invocation was performed. Historical pass counts in README and older notes are not current results.

## Existing working feature surface (as implemented/documented)

- Desktop task/goal launch, target-application discovery, Start/Check/Pause/Resume/Stop/Reset controls and shortcuts.
- On-demand primary-display screenshot capture while coach and overlay hide; foreground-window filtering and application-window crop.
- Local Tesseract OCR candidate extraction; Gemini chooses an OCR candidate ID, and Calc-only overlay geometry comes from that candidate's pixel box. Non-Calc guidance is text-only.
- Structured Gemini responses, state validation, progress/recovery/uncertain/completion states, history and request/session guards.
- Optional public YouTube tutorial reference analysis once per session with screenshot-only fallback.
- User Gemini-key setup/test/remove; Electron `safeStorage` encrypted persistence where available; masked status over IPC; session-memory fallback.
- Local instruction speech through browser Web Speech API.
- Web screenshot upload/drag-drop, OCR, Gemini guidance, candidate-based canvas highlight, scenarios, rate/session controls, reset, tutorial endpoint and static web experience.
- Mock UI and UI-review capture scripts; fixture-oriented regression tests.

These are source-level capabilities, not independently revalidated runtime results in this environment.

## Key limitations and baseline concerns

- Desktop capture is primary-display-oriented. Window and geometry movement after capture can stale an overlay; display metrics clear highlights but do not track target-window movement. Multi-monitor support is not a demonstrated product guarantee.
- OCR grounds text controls; it cannot identify non-text targets or spreadsheet cell ranges reliably, so some instructions intentionally have no overlay.
- Current Calc overlay is tied to application classification and OCR candidate selection. Do not expand its scope without evidence and test coverage.
- Web companion handles uploaded screenshots, not native screen capture. It is a separate security/deployment surface and may use server-configured Gemini credentials.
- Test runner requires compiled output but `npm test` itself does not build. Integration/live model checks have network/key and fixture assumptions.
- No dependencies installed means no current compile/test/build evidence. Installer and OS-level capture behavior remain unverified in this audit.
- Documentation and tests contain hard-coded Nori/Unstuck expectations; replacing mascot/name without updating them will break deliberate contract checks.
- `shared/api-budget.ts` contains a persistent `.api_budget.json` manager, but the interactive desktop path shown uses the in-memory `defaultSessionBudget`; comments describing persistent interactive usage are stale/misleading.
- The old `docs/architecture.md` describes model-supplied normalized boxes, but current desktop/web Gemini code selects OCR candidate IDs. Update architecture docs before using them as implementation guidance.

## Branding, identity and persistence inventory

- Package/product/author: `package.json` (`unstuck`, `Unstuck`, `Unstuck Team`); electron-builder app ID `com.unstuck.coach`; NSIS shortcut/uninstall names and output identity.
- GitHub project links, repository URLs, page titles/copy and app labels across README, web, Electron, docs and tests.
- Mascot: `electron/assets/nori.png`; `web/assets/nori*`; references in launch/coach/web HTML and CSS, image-review scripts, UI tests and historical images/docs.
- App self-window detection: `electron/window-scoping.ts` process/title matching (`unstuck`/`Unstuck`) must migrate in lockstep with product identity.
- Persistent Gemini credential: Electron `app.getPath('userData')/gemini_credential.enc`; default Electron app identity affects the resolved userData path. Node tests fallback to cwd `.gemini_credential.enc`.
- OCR cache: Electron userData `tesseract`; web OCR cache cwd `.cache/tesseract`.
- Persistent build/test budget helper defaults to cwd `.api_budget.json`; interactive desktop budget is in memory; server sessions are in-memory with TTL. `.env` and environment variables are additional configuration sources.
- Installer currently preserves app data on uninstall (`deleteAppDataOnUninstall: false`). Changing app ID/userData path may make existing user keys appear absent; migration/compatibility behavior must be designed explicitly.

## Highest regression risks

1. Capture hide/restore and stale-request invalidation; no self-capture or stale overlay after Pause/Stop/reset.
2. OCR crop offsets, DPI/negative origins, candidate IDs and overlay mapping; Calc-only scoping and text-only fallback.
3. Gemini request schema, prompt, auth/header, timeout/error parsing and key secrecy.
4. `preload.cjs` path/copy behavior and the narrow `electronAPI`/`unstuckOverlay` bridges.
5. Launch/coach UI DOM identifiers, visual state contracts, TTS, responsive behavior and reduced-motion CSS.
6. Key encryption, source precedence, storage path changes, remove semantics and IPC validation.
7. Web upload size/dimension validation, path traversal/static serving, session pacing/in-flight lock, tutorial flow and fixture copies.
8. Installer identity, shortcuts, app-data retention, icon/mascot packaging and deployment container inputs.
9. Unit test runner's dependency on `dist`; fixture integration tests reference `captures/` paths even though this checkout stores corresponding assets in `fixtures/` (verify against actual test path before relying on them).

See `ARCHITECTURE.md`, `FILE_MIGRATION_MAP.md`, `SECURITY_REVIEW.md` and `IMPLEMENTATION_TRACKER.md` for detailed planning.
