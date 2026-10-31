# Unstuck — Technical Foundation Notes

**Date:** 8 October 2026  
**Status:** Core TypeScript Logic Implemented & Verified  
**Milestone:** Local Foundation (No Electron/UI, zero Gemini API calls)

---

## 1. Module Overview & Contracts

The core domain logic is implemented in three independent, dependency-free modules under `shared/`:

### A. Coordinate Conversion (`shared/coordinates.ts`)
- **Responsibility:** Maps model-returned normalized bounding boxes `[ymin, xmin, ymax, xmax]` ($0..1000$) to three distinct coordinate systems:
  1. **Capture Pixels:** $\{x, y, \text{width}, \text{height}\}$ within the raw screenshot bitmap.
  2. **Display Logical:** $\{x, y, \text{width}, \text{height}\}$ in the OS desktop coordinate space.
  3. **Overlay Local:** $\{x, y, \text{width}, \text{height}\}$ relative to the transparent overlay window origin.
- **Contract & Validation Guards:**
  - Enforces $ymin < ymax$ and $xmin < xmax$; rejects inverted or zero-area boxes.
  - Rejects non-finite numbers, NaN, and coordinates outside $[0, 1000]$.
  - Validates aspect ratio consistency between capture dimensions and display bounds (tolerance: 2%) to prevent misaligned targets on distorted frames.
  - Supports non-zero and negative monitor origins (essential for multi-display and non-standard primary arrangements).
  - Calculates scaling dynamically from runtime display logical bounds rather than hardcoding.

### B. Response Validation (`shared/contracts.ts`)
- **Responsibility:** Enforces the structured response contract defined in the blueprint.
- **Allowed States:**
  - `assessment`: `'not_started' | 'expected' | 'unexpected' | 'uncertain'`
  - `status`: `'guide' | 'recover' | 'uncertain' | 'complete'`
- **Target Highlight Rules:**
  - If `status === 'uncertain'` or `status === 'complete'`, `hasTargetHighlight` is strictly `false` and `targetBox` is `null`. The system **never draws guessed highlights**.
  - If `status === 'guide'` or `status === 'recover'`, `targetBox` is validated through coordinate guards.
  - Rejects malformed structures, missing strings, or empty instructions with structured validation errors.

### C. Request Lifecycle & Session Management (`shared/lifecycle.ts`)
- **Responsibility:** Manages session identity, enforces in-flight single checks, and guarantees invalidation invariants.
- **State Invariants:**
  - **Single In-Flight Request:** While a check is in-flight (`state === 'checking'`), any subsequent `triggerCheck()` call is rejected immediately.
  - **Monotonic Request IDs:** Every check increments `requestId` sequentially within the session.
  - **Stop Invalidation:** Calling `stop()` transitions state to `'stopped'`, clears active guidance, and immediately cancels in-flight tokens. Any resolving response arriving after `stop()` is marked `discarded` and never updates guidance.
  - **Pause Invalidation:** Calling `pause()` cancels in-flight tokens; late responses are discarded.
  - **Session Replacement:** Starting a new session changes `sessionId`. Any late response from an earlier session is discarded.

---

## 2. How Electron Connects to These Modules

In the subsequent Electron integration milestone, the main process will wire these modules as follows:

```
[User Action: Start / Check]
       │
       ▼
SessionController.triggerCheck()
       │
       ├─ (Hides Coach & Overlay Window)
       ├─ (Waits 100ms for OS DWM redraw)
       ├─ desktopCapturer.getSources() ──► Raw Monitor Capture (Buffer)
       │
       ▼
Gemini API Client (Main Process only)
       │
       ▼ (Raw JSON Response)
validateModelResponse()
       │
       ├─ Valid Guidance
       ▼
convertTargetBox(guidance.targetBox, captureDims, screen.getPrimaryDisplay().bounds)
       │
       ├─ [overlayLocal] ────────► Overlay Window (Transparent, click-through focus brackets)
       └─ [guidance text/status] ─► Coach Window (Instruction, progress state, Check/Stop)
```

---

## 3. Unit Test Verification

- **Test Suite:** Executed via Node 24 native test runner (`node --test dist/tests/*.test.js`).
- **Suites:** 10 suites, **25 tests**, 0 failures, 189ms duration.
- **Coverage:**
  - Reported 125% DPI display configuration ($2560 \times 1600$ physical, $2048 \times 1280$ logical).
  - Equivalence between full-resolution and proportionally downscaled captures.
  - Negative and arbitrary monitor origins.
  - Overlay-origin relative offsets.
  - Malformed responses, invalid enums, empty strings, inverted boxes.
  - Highlight suppression on `uncertain` and `complete`.
  - Monotonic request IDs and duplicate check blocking.
  - Invalidation after Stop, Pause, and new session creation.
- **Notice:** All tests use synthetic test fixtures explicitly labelled as artificial tests. Passing tests does not establish real model accuracy or native OS capture correctness.

---

## 4. Live Vision Benchmark Insights

A live single-turn benchmark was run on `captures/calc-test.png` ($2557 \times 1536$) asking models to locate the `Insert` menu with `thinkingLevel: "LOW"`:
- `gemini-3.5-flash-lite`: 54.9s latency; returned `[23, 88, 41, 110]` which visually enclosed `Format` instead of `Insert`. (Note: `LOW` was not the lowest supported setting for 3.5 Flash Lite; the root cause of the latency difference remains unresolved).
- `gemini-3.1-flash-lite`: 10.3s latency; returned `[24, 116, 36, 144]` which visually enclosed `Styles/Sheet` instead of `Insert`.
- `gemini-3.8-flash`: HTTP 503 (high demand spike).
- **Core Lesson:** Validates the blueprint rule: syntactically valid model coordinates do not equal ground truth accuracy. The coach must never assume model locations are infallible without verification.

---

## 5. Local OCR Targeting Feasibility (Tesseract.js)

Tested word-level English recognition on `captures/calc-test.png` ($2557 \times 1536$):
- **Localization:** Successfully located all 4 target labels independently with high confidence:
  - `Insert`: `[x: 152, y: 37, w: 35, h: 11]` (88% conf) -> **Visually accurate**.
  - `Format`: `[x: 208, y: 37, w: 46, h: 11]` (95% conf) -> **Visually accurate**.
  - `Styles`: `[x: 275, y: 37, w: 36, h: 14]` (93% conf) -> **Visually accurate**.
  - `Sheet`: `[x: 332, y: 37, w: 36, h: 11]` (93% conf) -> **Visually accurate**.
- **Warmed Latency:** ~2.0 to 2.5 seconds per full-screen pass.
- **Offline / Cached Operation:** Cached worker startup takes **269 ms** without network downloads.
- **Role in Unstuck Architecture:** OCR provides a deterministic, local verification and coordinate refinement mechanism for textual UI controls (menus, buttons, tabs). OCR failure means text-only guidance, not an unverified Gemini highlight. Guessed coordinates are never substituted.

---

## 6. Native Capture-to-Highlight Engineering Diagnostic

A minimal Electron diagnostic shell was built to validate live desktop capture, dynamic coordinate mapping, local Tesseract OCR targeting, and click-through overlay rendering on LibreOffice Calc:

### A. Documented Launch Commands
- **Standard diagnostic session (default `Insert`):**
  ```bash
  npm run proof
  ```
- **Custom target label (e.g., `Format`, `Styles`, `Sheet`):**
  ```bash
  npm run proof -- --target=Format
  ```
- **Diagnostic debug capture (saves capture frame to `captures/`):**
  ```bash
  npm run proof -- --target=Styles --debug-capture
  ```
- **Single-shot automated check:**
  ```bash
  npm run proof -- --target=Insert --run-once
  ```

### B. Keyboard Shortcuts & Conflict Management
- **On-Demand Capture:** `Ctrl+Alt+U` triggers capture-to-highlight. If another application occupies this hotkey, Electron logs an explicit conflict error rather than failing silently.
- **Dismissal & Invalidation:** `Ctrl+Alt+D` or `Escape` immediately clears the visible outline and increments the monotonic request token, invalidating in-flight capture or OCR operations so stale results cannot reappear.
- **Auto-Expiration:** Displayed outlines automatically fade and expire after 8 seconds.

### C. Overlay Architecture & Pass-Through
- **Window Flags:** `frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, focusable: false`.
- **Click-Through:** Configured with `setIgnoreMouseEvents(true, { forward: true })`. Clicks pass directly through the outline boundary into underlying LibreOffice Calc menus.
- **Isolated Renderer:** Context isolation enabled with sandboxed preload (`preload.cjs`). Zero Node APIs, files, or credentials accessible from the renderer.

### D. Concurrency & Invalidation Lifecycle
- **Single In-Flight Guard:** Simultaneous triggers while processing are rejected (`isInFlight = true`).
- **Pre-Capture UI Concealment:** Overlay is hidden and delayed 150 ms to ensure Windows DWM redraw completes without overlay self-capture contamination.
- **Display Geometry Invalidation:** Listens to `display-metrics-changed` and verifies logical monitor bounds before rendering.
- **Application Movement Clarification:** Unstuck does **not** track or monitor LibreOffice Calc window movement. The `display-metrics-changed` event detects changes to the OS display resolution, DPI scaling, or monitor arrangement only—it does not fire when the Calc window is moved or resized. If the user moves Calc after a capture has been taken, the outline remains stationary at the captured desktop coordinates and becomes visually stale until a fresh capture is triggered via `Ctrl+Alt+U`.

### E. Latency & Execution Breakdown

#### 1. Saved-Fixture OCR Benchmark (`captures/calc-test.png`, 2557x1536)
Measured during automated test execution on the static fixture image:
- **Tesseract Worker Init (Cached):** ~269 ms
- **OCR Word Box Recognition (Warmed Worker):**
  - `Insert`: ~2,000–2,800 ms (2,795.9 ms first pass)
  - `Format`: ~2,105.4 ms
  - `Styles`: ~2,100.0 ms
  - `Sheet`: ~2,191.8 ms
  - Missing/Non-existent label: ~2,062.9 ms (returns `unresolved`, zero guessed coordinates)

#### 2. Live Execution Log (`--run-once --target=Insert`)
Telemetry recorded from the live Electron execution attempt:
- **Display Query:** Display ID `4232751660`, Logical bounds `(0, 0) 2048x1280`, Scale `125%`.
- **Capture Result:** Returned `0x0 px` in `3,795.7 ms`.
- **Reported WebRTC Error:** `third_party\webrtc\modules\desktop_capture\win\desktop.cc:68] Failed to assign the desktop to the current thread: 170`.
- **Diagnostic Attribution:** The underlying condition causing WebRTC error 170 (`ERROR_BUSY`) was not directly observed in the session and remains unresolved (cannot be definitively attributed to screen locking without physical verification).
- **Graceful Failure Handling:** Empty capture buffer was handled safely, marking the target `unresolved` without drawing any guessed highlight or crashing.

#### 3. Pending Live Measurements (Awaiting Desktop Run)
- **Live desktop capture duration:** Unmeasured / Pending interactive run.
- **Live OCR recognition duration on full desktop capture:** Unmeasured / Pending interactive run.
- **Live end-to-end latency (Capture + OCR + Render):** Unmeasured / Pending interactive run (no unsupported live end-to-end timing claims).

---

## 7. Overlay Rendering Diagnosis & Telemetry Remediation

Following user observation that no visible outline appeared despite terminal log messages, the complete rendering path was traced and resolved:

### A. Root Cause Identified
1. **Missing Preload Script at Runtime Path:** TypeScript compiles `.ts` files into `dist/electron/main.js`, but non-TypeScript assets (`preload.cjs` and `overlay.html`) reside in `electron/`. The preload path was referenced via `path.join(__dirname, 'preload.cjs')`, evaluating to `dist/electron/preload.cjs`, which did not exist.
2. **Silent Preload Failure:** Electron failed to load the preload script. Consequently, `contextBridge.exposeInMainWorld('unstuckOverlay', ...)` was never invoked.
3. **Unattached IPC Listeners:** In `overlay.html`, `window.unstuckOverlay` remained undefined, so listeners for `show-outline` were never registered.
4. **Premature Main-Process Logging:** The main process previously logged "Highlight outline active" upon firing `webContents.send()`, without verifying that the renderer received or rendered the instruction.

### B. Remediation Implemented
1. **Robust Runtime Asset Resolution:** Updated asset resolution to check project-relative root paths (`path.resolve(process.cwd(), 'electron', ...)`) with fallback verification and automatic colocation copying to `dist/electron/`.
2. **Bidirectional IPC Telemetry & Acknowledgement:**
   - Preload signals initialization: `renderer-preload-ready`.
   - DOM signals listener readiness: `renderer-dom-ready`.
   - Outline applied acknowledgement: `outline-applied-ack` transmits computed DOM metrics (`getBoundingClientRect()`, `display`, `visibility`, `opacity`, `zIndex`).
   - Main process only logs "outline applied" after receiving explicit renderer acknowledgement.
3. **Explicit Overlay-Only Diagnostic Mode (`--test-overlay`):**
   - Completely bypasses `desktopCapturer` and Tesseract OCR.
   - Dispatches a 320x160 synthetic test box at display center with high-contrast 3px green outline and badge `[TEST RECTANGLE] OVERLAY VISIBILITY TEST`.
   - Sets `alwaysOnTop: 'screen-saver'`, `showInactive()`, `setIgnoreMouseEvents(true, { forward: true })`, and remains visible for 30s or until dismissed with `Ctrl+Alt+D` or `Escape`.
   - **Rule:** This mode is strictly for testing window rendering in isolation and is never used as a live target fallback.

---

## 8. AI Coaching Loop Integration & Candidate Grounding

The interactive desktop coaching loop connects multimodal observation, foreground target scoping, candidate grounding, and structured response validation:

### A. Architectural Invariants
1. **Model Runtime Override:** `gemini-3.1-flash-lite` with `thinkingLevel: "LOW"` (chosen for observed 8.4s latency). The project `.env` default model configuration and API keys are strictly preserved.
2. **Grounded Candidate Selection (No Model Coordinates):**
   - Main process runs local OCR on the fresh capture and filters candidates to the active LibreOffice Calc window bounds.
   - Assigns capture-unique IDs (`c_1`, `c_2`, ...).
   - Gemini receives the image, goal, previous instruction, history, and the OCR candidate list.
   - Gemini selects an existing `selectedCandidateId` or `null`.
   - The overlay highlight is positioned **exclusively** from the selected candidate's OCR pixel box in that capture. Model-generated coordinate boxes are ignored.
3. **Target Application Scoping Guard:**
   - Active foreground window is inspected via Win32 query (`electron/window-scoping.ts`).
   - If the active window is not LibreOffice Calc (or an attached Calc dialog like Chart Wizard), the check is rejected, preventing text from competing applications from becoming targets.
4. **Session Budget & Request Invariants:**
   - Enforces a strict **12-request budget** per diagnostic session (counting failed attempts).
   - Session reset (`Ctrl+Alt+R`) clears history, resets request budget, and clears overlay.
   - Bounded request timeout: 25 seconds with `AbortController`; zero automatic retries; graceful 429/503 handling.
   - One operation in-flight; in-flight operations are cancelled immediately upon dismissal or reset.
5. **Anti-Prompt Injection Defense:**
   - System instruction explicitly frames all on-screen text and OCR content as untrusted visual observations that can never alter the user's goal or coaching behavior.

### B. Live Integration Test Verification (`captures/calc-test.png`)
Executed single automated live API request using `npm run test:integration`:
- **Model:** `gemini-3.1-flash-lite`
- **Goal:** *"Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department."*
- **Measured Latency:** **8,403.5 ms** (~8.4s)
- **Token Consumption:** Prompt: 2,977 | Candidate: 113 | Thoughts: 157 | Total: 3,247
- **Model Assessment:** `not_started` | **Status:** `guide`
- **Observation:** *"The chart data is present in cells A1:B5, but that range is not currently selected. Cell C6 is active."*
- **Instruction:** *"Click and drag your mouse from cell A1 to B5 to select the data for your chart."*
- **Expected Outcome:** *"The cells A1 through B5 will be highlighted."*
- **Selected Candidate ID:** `null` (Correctly resolved to text-only guidance since cell selection is a mouse drag rather than clicking an existing button or menu).

### C. Test Suite Separation
- **Default Unit Tests (`npm test`):** 34 tests across 13 suites pass in ~220 ms. Zero reliance on `captures/calc-test.png`.
- **Integration Tests (`npm run test:integration`):** 7 tests across 2 suites verify live OCR target localization and Gemini coaching contract.
