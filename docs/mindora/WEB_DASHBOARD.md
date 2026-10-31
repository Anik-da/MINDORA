# MINDORA desktop and web workspace

## Interface structure

The desktop application remains Electron with its existing HTML, CSS, JavaScript, and narrow preload bridge. Its Home page retains the screen-coaching workflow; Tasks, Browser, Research, Monitors, History, and Settings expose the existing Gemini, TinyFish, agent, and MIKO capabilities. Small desktop work areas collapse the navigation and content layouts at 900 px; short work areas preserve scroll access below 600 px.

The web companion has a responsive seven-section dashboard. It uses same-origin authenticated HTTP and an authenticated server-sent event stream for agent task updates. It has no Electron preload or IPC access. It never requests local desktop capture. The prior screenshot guidance workflow remains available as a separate web-only workspace and uses user-uploaded images.

## Web authentication configuration

Set `MINDORA_WEB_ACCESS_TOKEN` in the trusted server environment to a random value with at least 24 characters. Sign-in exchanges it for a 12-hour, server-issued `HttpOnly`, `SameSite=Strict` cookie. The raw token is not persisted by the browser. HTTPS deployments set the `Secure` cookie attribute when TLS is terminated by a trusted reverse proxy that forwards `X-Forwarded-Proto: https`.

The dashboard uses one configured workspace access token and an in-memory session registry. It does not provide user accounts or per-user data isolation. Protect the service with TLS and a private deployment boundary; configure `MINDORA_WEB_DATA_DIR` to a private writable directory if task and research history should persist across restarts.

## Authenticated routes

- `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`
- `GET /api/tasks`, `POST /api/tasks`, `GET /api/tasks/:id`, `POST /api/tasks/:id/action`
- `GET /api/events` (server-sent events for task lifecycle changes)
- `/api/dashboard/status`, `/api/dashboard/runs`, `/api/dashboard/research`, `/api/dashboard/monitors`, `/api/dashboard/profiles`, `/api/dashboard/wallet`, `/api/dashboard/usage`
- `POST /api/dashboard/research`, `POST /api/dashboard/automation`, monitor create/update/run/delete routes, browser run cancellation, and captured run screenshots when TinyFish provides them.
- Existing screenshot-guidance APIs (`/api/check`, `/api/tutorial`, `/api/session/reset`) require the same session.

Only static demo fixture endpoints (`GET /api/example`, `GET /api/examples`) and the operational health check are public. Mutating authenticated routes reject cross-origin `Origin` values. Provider errors are normalized and redacted before being returned. TinyFish and Gemini keys are read by trusted server code from environment variables and are never sent to renderer code.

## Capability boundaries

- Web agent plans use Gemini and the server-side TinyFish tools. No desktop observation tool is registered for web tasks.
- Browser automation is initiated from a user-submitted form with an explicit confirmation, or from an agent task that pauses for approval. CAPTCHA, MFA, and other security challenge bypass requests are rejected; automation instructions require stopping for human action.
- Web screen guidance is based on screenshots the user uploads. Native screen capture and MIKO preferences remain desktop-only.
- TinyFish connections, research, wallet, profiles, monitors, and usage require configured TinyFish credentials. Agent planning requires both server-side Gemini and TinyFish credentials.
- Profile names and monitor schedules depend on fields returned by the documented TinyFish API. Screenshot previews are displayed only when run metadata includes captured steps and TinyFish returns the screenshot endpoint successfully.
