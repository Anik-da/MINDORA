# MINDORA user guide

## Start the desktop app

Install and open **MINDORA** from the Start Menu or desktop shortcut. It opens as a native Electron application and does not require Chrome, Edge, or the optional web dashboard. Local settings, pet preferences, and local screen-awareness classification work without a hosted MINDORA service. Gemini coaching/agent planning and TinyFish research/browser/monitor tools require an internet connection and valid provider configuration. On first use, add a Gemini API key in the Gemini Key control and use **Test connection** before saving. Agent services can also read trusted `GEMINI_API_KEY` and `TINYFISH_API_KEY` environment values.

The main workspace includes Home, Tasks, Browser, Research, Monitors, History and Settings. Home accepts a natural-language task and shows recent activity/service status. Tasks show the current plan, progress, evidence and approval requests. Browser, Research and Monitors submit work to TinyFish; provider access and optional account features depend on the configured key and account.

## Screen coaching

1. Focus the desktop application you want help with.
2. Enter a goal and select **Start with MINDORA**.
3. Follow the coach's instruction and use **Check my progress** when ready. `Ctrl+Alt+U` also checks.
4. Use Pause, Resume, Stop or Reset as needed. Progress advances only when a response validates the observed state.

Capture is user-triggered, not continuous. MINDORA hides its own coach/overlay/MIKO, identifies the selected foreground window, captures that window's display, and runs local OCR. On Start/Check/agent desktop observation, that window image and OCR/context are sent to the configured Gemini service; optional background screen-awareness classification remains local. The OCR-grounded visual overlay is limited to positively identified LibreOffice Calc; other desktop software receives application-agnostic text guidance. MINDORA does not click or type for you, so you must perform each suggested action and request a new check to verify it. Tutorial video reference is optional and may fall back to screenshot-only guidance.

## MIKO companion

MIKO runs in a separate desktop window and can remain visible when the main workspace is closed. Click MIKO to reopen MINDORA. Hover/focus the pet to use its controls; click-through behavior resumes when the pointer leaves. Use the compact/expanded and always-on-top controls or the MIKO application menu. Disable MIKO in Settings to close it. Choose **Quit MINDORA** from the application menu to shut down the process and pet.

MIKO reflects real coaching/task events and does not store task text or credentials in its preferences. Position and display preference are remembered. On display removal, the window is moved to the primary display work area.

## Browser, research and monitors

- Browser runs use a goal and website URL. Review the task and approve consequential actions. TinyFish may ask for profile or account entitlements; complete CAPTCHA/MFA/security checks yourself and do not request bypasses. Captures appear only when returned by TinyFish.
- Research creates an asynchronous provider job. Refresh the research list/report to retrieve results and cited sources. A run may be unavailable if the TinyFish account lacks access.
- Monitors submit a page/topic and provider-supported schedule. The app can list, pause/resume, run now or cancel according to the provider API. The provider REST API does not expose monitor result history in this integration.
- Browser profiles are selectable where returned by TinyFish. The UI does not provide credential-vault management or profile setup-session handoff.

Provider operations can fail due to missing configuration, service availability, account entitlement, rate limits or credits. MINDORA displays provider errors; it does not claim completion without returned evidence.

## Web dashboard

The web dashboard requires the access token configured by the service operator. It supports Tasks, Browser, Research, Monitors, History and Settings. It uses authenticated HTTP/SSE and server-side Gemini/TinyFish credentials. It cannot see or capture your computer screen. For web screen coaching, select/upload an image yourself; that image is sent to the configured MINDORA server for OCR/Gemini processing.

The current web service uses a shared token and does not provide separate user accounts or per-user data isolation. Use only on a private HTTPS deployment trusted by the service owner.

## Privacy and data

- Desktop screen images are captured on explicit user action and sent to Google Gemini for guidance. Images are processed in memory by MINDORA; the provider's own retention terms apply.
- Web screenshot uploads go to the configured server, which calls Gemini. Use a service you trust.
- Desktop Gemini coaching key is encrypted with OS-backed Electron `safeStorage` when available. If unavailable, key storage is session-only. Never paste provider keys into task text.
- Web/agent Gemini and TinyFish keys are server/main-process environment configuration, not web settings fields.
- Desktop agent and TinyFish research history are stored in Electron userData. Web task and research history are stored in the configured private web data directory (or `.mindora-web`). Use OS/service access controls and backups appropriate for this data.

## Run from source

See [Deployment](DEPLOYMENT.md) for environment setup and commands. Desktop: `npm start`. Web: set `MINDORA_WEB_ACCESS_TOKEN`, run `npm run build:web`, then `npm run web`. Unit tests: `npm test` after compilation. The `npm run test:integration` suite uses local OCR fixtures and skips the live Gemini request if no real key is configured.
