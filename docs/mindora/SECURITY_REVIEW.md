# MINDORA security review

**Reviewed:** 2026-10-31. Scope is source/configuration review plus automated security-related tests; this is not a penetration test or a claim of certification.

## Protections observed and checked

- Electron launch, coach, overlay, and MIKO windows use sandboxing, context isolation, and disabled Node integration. Local-page navigation is allowlisted and popups are denied. Sensitive coaching, Gemini-key, agent, and TinyFish IPC is restricted to intended windows; MIKO has a separate limited bridge.
- Gemini credentials are not returned to renderers. Desktop persistence uses Electron `safeStorage` when available and session-only memory otherwise. Legacy migration copies only missing data, does not delete the old directory, and verifies encrypted credentials when the OS storage facility is available.
- TinyFish credentials are read in trusted Electron main/server code and supplied in the `X-API-Key` header. Logs include request metadata, not request bodies or credentials. Custom proxy secrets and provider CDP access URLs are not exposed through ordinary renderer responses.
- The web app uses a server-configured shared token and HttpOnly/SameSite session cookie. Authenticated dashboard mutations validate an Origin when supplied; cookie SameSite policy also applies to auth actions. APIs redact common credential formats in results/errors. Web renderers do not use Electron IPC.
- Images are signature/dimension checked, capped, and processed in memory. Model/OCR/browser content is rendered as text in the UI. CAPTCHA/MFA/security challenge bypass requests are rejected or instructed to stop for user action.
- Mock test coverage includes key storage/migration, web auth, image validation, TinyFish transport, approvals, agent cancellation/retries, MIKO state/placement, and UI security contracts.

## Release-blocking or material limitations

1. **Web access is a shared bearer-token gate, not user authentication.** Sessions, login attempt counters, agent tasks, approval waiters, and SSE clients are process-local. Do not expose this service as a multi-tenant/public product. Use TLS, a private network/access proxy, a strong secret, one service instance, and durable private `MINDORA_WEB_DATA_DIR`. Add per-user identity, distributed session/rate controls, and global usage limits before public multi-user operation.
2. **No server-wide request quota is enforced for Gemini/task endpoints.** The web screenshot flow has per-session pacing, while dashboard access relies on the shared sign-in token. A compromised token can consume configured provider quota. Apply upstream gateway/IP limits and a service-wide budget before broader deployment.
3. **Health route reveals model name and whether a Gemini key is configured.** Treat this as operational metadata; restrict health access if deployment policy requires it.
4. **MINDORA deployment does not terminate TLS.** Secure cookies depend on TLS or trusted `X-Forwarded-Proto: https`; deploy behind a correctly configured TLS proxy and do not trust arbitrary direct clients to set forwarded headers.
5. **Secret configuration differs by surface.** Electron key setup is provided for Gemini coaching; Gemini agent planning and TinyFish require trusted process environment values. There is no UI credential vault. A packaged desktop launch from Start Menu will not inherit a shell-only environment; configure machine/user environment before launching or provide a future OS-backed settings workflow.
6. **Credential migration has not been tested with a real legacy Windows profile/DPAPI key.** Unit tests verify no-overwrite, idempotency, and byte-preserving encrypted copies, but release upgrade testing is still required. Keep the legacy data folder and a backup until verified.
7. **No code-signing certificate is configured.** Installer can be built but will be unsigned; Windows SmartScreen warnings are expected. Verify Authenticode status before distribution.
8. **Electron app requests sensitive permissions by design.** Desktop observation captures a screen only on user action and sends the image to Gemini. Web uploads send selected images to the configured server. Confirm privacy notice, consent and retention policies before release.

## Review fixes made in this audit

- Restricted all renderer windows to their local bundled document and denied popup creation.
- Added sender-window validation to launch-only key, target-info, external URL and coaching-start handlers, and coach-only screen capture/session controls. This closes the path where the shared preload could otherwise invoke those handlers from the overlay window.
- Added a regression test for local navigation restrictions and sensitive IPC sender guards.
- Fixed integration tests importing `electron.app` under plain Node by resolving Electron lazily; switched fixture lookup to the repository's committed `fixtures/calc-test.png` when `captures/` is absent.

## Remaining review items

- Run Electron GUI lifecycle tests on clean Windows 10/11 systems and verify display-capture permission, foreground-window filtering, hide/restore behavior, MIKO click-through and shutdown.
- Exercise installed upgrade/uninstall with a copy of real legacy app data, including safeStorage unavailable/corrupt scenarios.
- Review exact public API limits and provider data retention with current Google/TinyFish account terms; no live API requests were made during this review.
- Consider pruning expired web sessions and login counters and applying global task/API quotas.
- Validate health-route exposure and TLS proxy trust against the production topology.
- Verify the unsigned installer in Windows Defender/SmartScreen and use a trusted signing certificate before general distribution.

## Security checks

- [x] Unit suite: key migration/storage, auth, provider mocks, input validation, approval policy and UI contracts pass.
- [x] Production compile/build and Windows x64 NSIS packaging complete in this workspace.
- [x] Source check confirms renderer web dashboard does not reference Electron IPC and provider keys are not placed in frontend bundles.
- [ ] No secrets scan against the full release artifact or final installed directory has been performed.
- [ ] No penetration test, dependency vulnerability scan, signed-installer validation, or live provider authorization test has been performed.
