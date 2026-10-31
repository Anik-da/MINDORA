# MINDORA Implementation Tracker

Phased checklist for MINDORA work. Phase 0 audit is complete and the rebrand/data migration are implemented; feature behavior remains preserved.

## Phase 0 — Baseline audit and architecture

- [x] Inspect repository structure, package scripts, TypeScript configuration and deployment files.
- [x] Trace Electron main process, preload bridges, launch/coach/overlay renderers and key persistence.
- [x] Trace desktop screenshot capture, foreground scoping, crop geometry, OCR candidate extraction and overlay.
- [x] Trace desktop and web Gemini integrations, shared contracts and tutorial URL flow.
- [x] Inventory Nori and Unstuck branding, identifiers, installer config and persistence/cache paths.
- [x] Inspect test suite and regression risks.
- [x] Attempt typecheck, unit tests and production build; record environment failures.
- [x] Create baseline audit, architecture, migration map, security review and this tracker.

## Phase 1 — Product identity and safe data migration

- [x] Set package/product name and Electron application ID to `com.mindora.desktop`.
- [x] Set MINDORA executable, installer shortcut and uninstall labels.
- [x] Set app name, menus, window titles, web metadata/favicon and visible branding.
- [x] Migrate old userData before startup; preserve legacy source and never overwrite destination files.
- [x] Validate encrypted credentials with safeStorage when available and copy ciphertext unchanged.
- [x] Add tests for migration idempotence, destination precedence and unverifiable credential retention.

## Phase 2 — Product decisions and MINDORA specification

- [x] Confirm MINDORA name, tagline, product description and desktop/web scope.
- [x] Create the MINDORA companion artwork and add transparent PNG assets with accessible labels.
- [x] Set application identifier and implement old userData migration for compatible data/credentials.
- [x] Keep the existing visual system and update brand/mascot assets without a full redesign.
- [x] Preserve existing platform scope, capture behavior and privacy disclosures.
- [x] Preserve current workflows and architecture.

## Phase 3 — Environment baseline and regression gate

- [x] Install locked dependencies with `npm ci`.
- [x] Run typecheck, production build and unit tests (124 passed). Live integration tests were not run.
- [ ] Run existing UI review harness and preserve baseline screenshots where permitted.
- [ ] Verify a packaged Windows installer and live desktop capture/OCR/overlay baseline.
- [ ] Verify web companion local startup and Docker build/deployment assumptions.
- [ ] Repair or document pre-existing failures before attributing regressions to MINDORA work.

## Phase 4 — Identity and persistence migration

- [x] Update package/product/author/appId/installer names and icon configuration.
- [x] Update process/title self-window detection and IPC bridge names as a coordinated change.
- [x] Implement old userData migration, preserving encrypted credentials and existing destination data.
- [ ] Update `.env`, API budget and OCR cache paths/documentation where scope requires.
- [x] Preserve per-user installation and app-data retention semantics.
- [x] Add focused tests for identity detection and persistence migration.

## Phase 5 — Mascot and desktop experience

- [x] Add generated mascot assets through the existing recursive asset-copy pipeline.
- [x] Update launch welcome, key setup, coach header and accessibility labels.
- [ ] Preserve target selection, goal editing, key setup/test/remove, start/check/pause/resume/stop/reset and TTS.
- [ ] Preserve all existing guidance states, status messages, budget behavior and shortcut behavior.
- [ ] Update styling while retaining reduced-motion and responsive behavior.
- [x] Refresh visual contract tests. UI capture harness not run.

## Phase 6 — Web companion and shared branding

- [x] Update web identity, mascot, site copy and page metadata.
- [ ] Preserve upload/fixture selection, OCR grounding, guidance states, highlight canvas, tutorial flow and session reset.
- [x] Update shared Gemini prompt naming while preserving safety instructions and response contracts.
- [x] Update server health identity. Deployment metadata remains provider-neutral.
- [ ] Review public web authentication, quota and screenshot privacy decisions before deployment.

## Phase 7 — Documentation, packaging and release readiness

- [x] Update README, architecture and MINDORA migration documentation. Legacy screenshots and release links are explicitly identified.
- [ ] Mark historical Unstuck notes clearly or archive them without altering their evidentiary meaning.
- [x] Run typecheck, build and unit tests. Integration tests and live desktop checks not run.
- [ ] Build and inspect Windows installer; verify app ID, shortcuts, icon, install/update/uninstall and credential continuity.
- [ ] Build and smoke-test web container if in scope.
- [x] Review active UI/source branding; retain explicit legacy references needed for migration and actual repository/release links.
- [ ] Produce final change summary with known limitations and verification evidence.

## Phase 8 — Floating pet integration and Windows finalization

- [x] Add floating toolbar actions for chat, voice, and native More/context menu.
- [x] Add compact pet chat panel with loading, real task submission, response/error display, and close action.
- [x] Route pet chat through sender-validated Electron IPC into the existing Gemini agent orchestrator.
- [x] Add status bubble, animation, login launch, and keep-running-on-main-close settings.
- [x] Keep the Electron process alive when the enabled companion is configured to outlive the dashboard; explicit Quit remains authoritative.
- [x] Add IPC and user-data security assertions for the pet chat surface.
- [x] Typecheck, production build, unit tests (168), and integration tests (7; live Gemini skipped without key).
- [x] Build updated Windows x64 installer from this final source state.
- [x] Smoke install, Start Menu shortcut, app window, explicit shutdown, uninstall, and data sentinel retention.
- [ ] Exercise installed chat, toolbar, voice, drag, focus, context menu, close/quit and multi-monitor behavior.
- [ ] Compare against the referenced video (attachment was not available as a video file during this run).
- [x] Create final audit, pet companion, privacy/security, and build/install documents.

## Phase 9 — Two-way voice assistant

- [x] Retain system TTS, configurable system voice/rate/volume, and interrupt with Stop.
- [x] Add interim and final microphone recognition results, visible listening state, permission/no-speech errors, and stop control.
- [x] Add explicit continuous conversation and push-to-talk mode; stop listening during TTS to prevent self-capture.
- [x] Route recognized text through main-process IPC to Gemini agent task planning.
- [x] Stream actual task events to the pet and speak completed results during continuous voice mode.
- [x] Stop recognition and synthesis on shutdown and when voice is disabled.
- [ ] Validate microphone recognition/TTS in packaged Windows with a real microphone and system voice.
- [ ] Implement multi-turn Gemini chat memory and verified microphone device selection; current requests use agent history, not a shared chat session.
- [x] Update voice documentation and run typecheck, production build and unit suite (168 passed).

## Current status

- **Completed:** Phases 0–2 audit/identity; existing core app functions; companion wiring and documentation in Phase 8.
- **Verification:** current source typecheck/build passed; 168 unit tests and 7 integration tests passed. Live Gemini was skipped because no key was configured in this process.
- **Remaining:** produce/install current Windows build; native UI/voice/multi-display tests; Windows profile migration and signing; live provider and release checks.
- **Current source behavior should be preserved:** see `BASELINE_AUDIT.md` and `ARCHITECTURE.md`.
