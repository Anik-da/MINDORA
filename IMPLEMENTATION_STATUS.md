# MINDORA Implementation Status

Audit updated: 2026-10-31. This status reflects repository inspection, automated checks, and a smoke install of the current Windows installer. “Verified” means the stated check ran in this workspace; mock and static checks are not live provider evidence.

## Existing working and verified features

- Electron desktop app with a local TypeScript stack, secure preload bridges, isolated renderers, Windows NSIS packaging, and preserved Unstuck user-data migration.
- MINDORA branding, Home/Tasks/Browser/Research/Monitors/History/Settings navigation, authenticated optional web dashboard, task history, provider controls, and responsive styles.
- Gemini key entry/test/save/remove flow using Electron `safeStorage` when available; no Gemini key is configured in this workspace, so live model operation is unverified.
- TinyFish Search, Fetch, async Research, Agent automation, Browser sessions, Monitor, Profiles and wallet wrappers; credentials are read on trusted code only. The current app run had no TinyFish key, so live service/entitlement checks are unavailable.
- Agent plans validated against registered tools, step dependencies, progress, evidence, retry/cancel/pause/resume, history and approval policy.
- Independent MIKO window with five selectable character assets, position/settings persistence, multiple display placement, chat-to-task access, voice controls, and task state updates. Four mascots now render as allowlisted inline vector artwork so their articulated parts can animate; MIKO remains a high-resolution raster with CSS motion/eyelid/state overlays. The full requirement for five individually art-directed animation systems across every state has not been verified.
- Desktop screen awareness is opt-in and local OCR/classification; UI copy states captures and recognized text are not saved or sent to external services.
- Voice uses browser speech recognition and system speech synthesis, with explicit mic request, stop controls, optional continuous listening and push-to-talk. It does not yet provide a verified persistent conversational Gemini voice loop.
- Main-process confirmation now gates TinyFish paid Research, Browser automation, monitor creation, and manual monitor runs. Agent research is classified as approval-required. Read-only TinySearch/Fetch remain ungated as requested.
- `.env` is ignored, `.env.example` contains placeholders, and there is no credential in source or this document.

## Incomplete or not verified

- Persistent free-form Gemini chat, conversation management, streaming, stop-generation and retry UX are not implemented. MIKO chat starts an agent task rather than an ordinary conversational turn.
- Paid TinyFish pricing estimates and configurable spending caps are not implemented; wallet responses are displayed raw. Approval is present, but users cannot set a cap or see a reliable per-operation quote before approving.
- Paid TinyFish services, account entitlements, and free Search/Fetch availability have not been live-tested in this run. The installer smoke launch reported TinyFish unconfigured.
- A full two-way Gemini voice assistant, five finished bespoke pet animation sets, and Gemini-based screen interpretation/screenshot preview are incomplete. Current screen awareness is local OCR/classification only.
- No end-to-end automated test asserts the Electron native paid-operation confirmation dialog. Existing tests cover provider transports and orchestrator approval policy.
- Web service/API deployment, account synchronization, app signing, and production infrastructure are not verified by a local Windows packaging run.

## Bugs and release risks observed

- A smoke launch without `TINYFISH_API_KEY` logs a configuration stack when the dashboard checks wallet status. It does not log a credential, but this should be rendered as an unavailable status without an unhandled IPC stack in production logs.
- This workspace’s installer smoke uses an isolated profile and confirms the MINDORA Start Menu shortcut, main window, independent MIKO window, MIKO persistence after closing the main window, explicit app shutdown, uninstaller, and preservation of user data. It does not verify external API behavior or all UI controls.
- The app is unsigned; Windows SmartScreen warnings may appear. A trusted release certificate is still required for normal consumer distribution.

## Work completed in this pass

- Reviewed the source tree, environment configuration, TinyFish client, agent tool registry/approval policy, desktop entry forms, existing tests, and build scripts.
- Verified TinyFish Search, Fetch and Agent request contracts against the current official docs linked in [TinyFish integration details](TINYFISH_INTEGRATION.md).
- Added native Electron confirmation before paid deep research, browser automation, monitor creation, and manual monitor runs. Paid research tools in agent plans now require orchestrator approval.
- Preserved no-charge search/fetch behavior and non-idempotent request retry restrictions.
- Built and smoke-installed the updated x64 application, then uninstalled it while verifying user-data preservation.
- Strengthened `scripts/smoke-test-windows-installer.ps1` to fail unless the packaged app opens the independent MIKO window and that window remains visible after the main window closes; the updated acceptance check passed against the installer.
- Redesigned the MIKO window as an artwork-led floating companion with hover-only quick actions, transient task/status bubbles, native right-click actions, and a restore path that does not create a duplicate window. Removed the old permanent toolbar/control-panel markup and its CSS rules.
- Fixed inert SVG animation hooks by loading only catalogued local vector assets through a narrow pet-only IPC method, then inserting trusted SVG into the isolated renderer. Added idle blinking/gaze, event expressions, and articulated animation hooks for eyes, orbit, tail, ears, wings, and flippers.
- Added regression coverage for the contextual layout, native menu actions, companion restoration, and allowlisted asset loading. The 2026-10-31 release run passed typecheck, 172 unit tests, 7 integration tests, NSIS packaging, and installer lifecycle/data-preservation smoke.
- Packaged-window visual and physical drag checks remain unverified because the desktop capture was occluded by the Codex companion. Distinct art exists for five pets; all required bespoke animation behaviors across every character are still incomplete.

## Checks run

- `npm run typecheck` — passed.
- `npm run build` — passed.
- `npm test` — 168 tests passed.
- `npm run test:integration` — 7 tests passed; Gemini live check skipped because no key was configured.
- `npm run build:win` — passed; generated installer at `dist/MINDORA-Setup-x64.exe`.
- `scripts/smoke-test-windows-installer.ps1` — passed install, shortcut, application launch/window, explicit shutdown, uninstall and user-data preservation checks. TinyFish displayed “not configured” during the no-key smoke launch.
- No paid TinyFish operation was made.

## Recommended remaining implementation order

1. Implement a persistent Gemini conversation service, conversation list/new chat, streaming/cancel/retry, and ordinary MIKO chat responses.
2. Add a durable usage ledger, configured spend ceiling, and reliable provider cost presentation based only on documented wallet/usage response fields; retain per-operation confirmation.
3. Add tests for native operation approvals, cancellation, settings and provider credential isolation.
4. Finish the Gemini-backed voice conversation flow and screen interpretation with preview, explicit per-capture consent, confidence labels and privacy checks.
5. Complete and visually verify each selectable pet’s distinct animation system.
6. Run key-configured TinyFish/Gemini checks without exposing credentials, validate account entitlements, then perform full UI and release-certificate QA.

See `docs/mindora/` for the detailed architecture, security, TinyFish, privacy, voice, screen awareness and deployment audits.
