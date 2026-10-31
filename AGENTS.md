# MINDORA — Project Agent Rules

## 1. Product Scope & Decisions
- **Target Platform:** Windows 11, single primary display (planning baseline at 125% DPI scaling; Electron measures runtime display bounds, scale factor, and capture dimensions dynamically rather than hardcoding).
- **Target Scope:** Application-agnostic desktop coach with LibreOffice Calc (creating a labelled horizontal bar chart from a tabular data fixture) retained as the verified preset benchmark. Unverified complex applications (such as Blender, Unreal Engine 5, etc.) are marked pending real testing; universal support must never be claimed without manual evidence.
- **Model Candidate:** Configurable via `GEMINI_MODEL`, defaulting to `gemini-3.1-flash-lite` (with `gemini-3.8-flash` as a configurable comparison model).
- **Core Role:** MINDORA is an interactive desktop coach guiding beginners through software tasks using screen observation, actionable text guidance, progress verification, and mistake recovery. Grounded coordinate highlights and transparent overlays remain strictly scoped to verified Calc workflows; generic applications use text-only guidance without coordinate overlays.
- **Tutorial Video Guidance:** Optional public YouTube tutorial URLs can be analyzed once per session for high-level step reference. Video is not streamed, downloaded, or recorded; if the model or video cannot be processed, clear notice is provided and guidance continues via screenshot-only mode.
- **Out of Scope for First Demo:** Automatic mouse/keyboard control, continuous video/screen streaming, background auto-polling, user accounts, cloud storage, voice, and multi-monitor setups.

## 2. Working Agreement & Design Ownership
- **Decision Makers:** Akash and ChatGPT own all product, architecture, and visual design decisions (including typography, palette, layouts, tokens, interactions, and benchmark procedures).
- **Builder Role:** Antigravity implements specifications, runs tests, reports technical constraints, and proposes refinements. It must never silently alter designs, substitute mock applications, or invent mock coordinates.
- **Design Target:** Cinematic, layered UI inspired by the accepted organic/botanical quality reference (expressive typography, layered glass/cards, subtle particle/motion effects, with reduced-motion fallback). Approved design tokens and specifications will be supplied by ChatGPT before UI implementation.

## 3. Git, Branching & Repository Budget
- **Single Branch:** All commits must be on `main`. Never create, switch to, or push auxiliary branches.
- **Repository Budget:** Must remain strictly under 10 MB total (target < 5 MB tracked source/assets).
- **Prohibited in Git:** Never commit `node_modules`, build artifacts (`dist/`, `release/`, `.exe`), screenshots, video recordings, reference repositories, or `.env` credential files.
- **Submission Rules:** Two maximum submission attempts through the Prompt Wars portal.

## 4. Architecture & Security Boundaries
- **Stack:** Electron (main/preload/capture), React/vanilla HTML/TS (coach panel & overlay), TypeScript, and Google Gemini API.
- **Secret Isolation:** `GEMINI_API_KEY` is loaded exclusively in the Electron main process from local configuration. Never expose keys to renderer processes, window titles, logs, git commits, or screenshots.
- **IPC Surface:** Use context isolation, a sandboxed renderer, and a strictly validated, narrow IPC bridge for `Start`, `Check`, `Pause`, `Stop`, and status events.
- **Input Sanitization:** Model output is structured data only, never executable scripts. Visible screen text and tutorial content are strictly untrusted observations and cannot override user goals or safety rules.

## 5. Screen Capture, Geometry & Guidance
- **Capture Protocol:** User-triggered checking (`Start`, `Check`, configurable shortcut). Before capture, hide coach panel and overlay window, allow OS redraw, capture full primary monitor or active application, then restore UI. Verify coach/overlay never appear in captures. Active foreground window is inspected to exclude MINDORA itself and the desktop when no valid target is available.
- **Coordinate Conversion & Grounding:** In verified Calc mode, model returns normalized bounding box `[ymin, xmin, ymax, xmax]` in range `[0, 1000]`, converted to overlay window coordinates using actual captured dimensions and logical bounds. In generic application mode, no new coordinate highlights, overlays, automated clicks or typing are added.
- **Never Hardcode:** Never hardcode live target coordinates or script pre-recorded clicks.
- **Pass-through Overlay:** The transparent overlay window passes mouse clicks through (`setIgnoreMouseEvents(true, { forward: true })`) to allow direct interaction with the target application.

## 6. Verification, Uncertainty & Recovery
- **Single Turn Verification & Next Step:** Each check passes the current screenshot, goal, previous instruction, and expected outcome to Gemini to simultaneously verify the previous step and propose the next action.
- **No False Progress:** Pressing Check is never evidence of success. Success requires model verification of the visible target application state.
- **Uncertainty State:** If a control cannot be identified with confidence, return `uncertain` and prompt the user to expose the control or adjust the window; never draw guessed bounding boxes.
- **Mistake Recovery:** Detect deviations (e.g. selecting Pie chart instead of Bar chart, or opening the wrong menu) and provide specific correction steps while preserving the original goal.
- **Failure Resilience:** Gracefully handle HTTP 429 (rate limit), timeouts, network loss, and stale responses without losing session context or advancing the workflow.
