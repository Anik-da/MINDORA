# MINDORA release checklist

**Audit run:** 2026-10-31. Checkmarks are tied to the listed evidence; unchecked items are not release-complete.

## Repository and regression checks

- [x] TypeScript strict typecheck — `npm run typecheck` passed after the Electron navigation/IPC hardening.
- [x] Full unit suite — final Windows packaging run passed: 166 passed, 0 failed, 0 skipped.
- [x] Agent plan validation, task execution, approvals, retry/cancel/failure and evidence tests — included in unit suite.
- [x] TinyFish mocked transport, operation/error/credit mapping tests — included in unit suite; no live provider call.
- [x] Web authentication/API tests — included in unit suite; cookie/auth boundaries tested.
- [x] MIKO preference, placement, monitor fallback, state mapping and fake-window lifecycle tests — included in unit suite.
- [x] Web UI contract, seven-section navigation, responsive CSS, no-Electron-IPC separation, and desktop local-navigation/IPC security regression tests — included in unit suite.
- [x] Browser viewport review of the web dashboard at 1440×900, 768×1024 and 390×844 — no page-level horizontal overflow at the checked widths.
- [x] Production TypeScript/assets build — `npm run build` passed.
- [x] Integration test harness — `npm run test:integration` passed after lazy Electron loading and fixture-path correction: OCR fixture tests pass. Live Gemini request was skipped because `GEMINI_API_KEY` was not configured.

## Package and platform validation

- [x] Windows x64 NSIS installer build — final output: `dist/MINDORA-Setup-x64.exe` (129,345,806 bytes), plus the builder artifact in `release-build/`.
- [x] Final installer SHA-256 recorded: `27AB81F38260FD62F7B8F4A663EC33213CB4AEAAFEF0A9CB8FB4B0C61C307414`.
- [x] Authenticode inspected: `NotSigned` (no certificate configured).
- [x] Packaged EXE metadata inspected: ProductName/FileDescription `MINDORA`, version `1.0.0.0`; installer ProductName `MINDORA`.
- [x] Launched the final unpacked Windows app and confirmed both the MINDORA workspace window and independent `MIKO · MINDORA` window were created.
- [x] Isolated Windows installer smoke test — setup, Start Menu shortcut, launch, graceful shutdown, uninstall, and test user-data preservation all passed. This was not a clean Windows 10/11 matrix test.
- [ ] Install and launch installer on clean Windows 10 and Windows 11 profiles.
- [x] Verify Start Menu shortcut, uninstall behavior, and preservation of an isolated user-data sentinel.
- [ ] Verify file/product metadata, Desktop shortcut, install path selection, repair/upgrade, and legacy app-data retention with a backed-up Unstuck profile.
- [ ] Configure a trusted signing certificate and verify the signed installer before distribution.
- [ ] Run desktop UI checks at normal, compact, high-DPI and multiple-display layouts.
- [ ] Verify native capture, target filtering, OCR, overlay hide/restore, display changes, shutdown and MIKO click-through on actual Windows desktops.
- [ ] Test upgrade with a backed-up legacy Unstuck data folder and real encrypted Gemini credential. Confirm existing MINDORA files win and the old folder remains recoverable.

## Provider and product validation

- [ ] Gemini desktop key test, save, restart persistence, replace, remove, API error/rate-limit and quota behavior using an authorized test key.
- [ ] Gemini web/planner request through trusted server secrets; confirm model errors and quota limits.
- [ ] TinyFish live Search, Fetch, async research, browser run/cancel/captures, monitors, profiles and wallet/usage with an authorized account. Confirm unsupported entitlements fail clearly.
- [ ] Verify consequential action approval in the actual UI for form submissions, messages, purchases, publishing, deletion and account settings; confirm rejection prevents tool execution.
- [ ] Verify evidence-based completion and MIKO progress against real task events, including pause, resume, cancel and failures.
- [ ] Validate web login, cookie Secure behavior behind production TLS proxy, origin enforcement, logout, session expiry, SSE reconnect, data-directory permissions and restart persistence.
- [ ] Decide and document retention, privacy notice, incident response, support process, monitoring and provider terms for user screenshots/research data.

## Security and distribution

- [x] Source review identified and fixed renderer navigation/popup and sender-window validation gaps for sensitive Electron IPC.
- [ ] Scan final installer and packaged resources for secrets, `.env`, development keys and unintended source/test files.
- [ ] Run dependency vulnerability/license review and update plan.
- [ ] Review login attempt/session map resource limits and implement global/API quotas before any broader public deployment.
- [ ] Require TLS and private access proxy; use random `MINDORA_WEB_ACCESS_TOKEN` and private durable `MINDORA_WEB_DATA_DIR`.
- [ ] Configure Windows code signing and verify signature on downloaded release artifact.
- [ ] Review provider API documentation, account entitlements and pricing immediately before each release; perform live smoke tests without storing secrets in logs.
- [ ] Produce checksum, release notes, installer artifact retention, recovery/rollback instructions and published download only after all applicable items are complete.

## Release decision

**Current status: not production-release complete.** Unit/type/build and installer packaging are verified, but live provider authorization, clean Windows install/upgrade, actual screen/MIKO lifecycle, signing, artifact secret scan, public-service hardening and release operations remain outstanding. Do not mark the unchecked features as complete or distribute this artifact as a verified/signed production release.

The isolated smoke test ran without TinyFish credentials. Its wallet status request logged the expected `TINYFISH_API_KEY is not configured` provider configuration error; no TinyFish live feature was verified by installer launch.
