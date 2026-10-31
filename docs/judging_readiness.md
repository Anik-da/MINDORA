# Unstuck — Judging Readiness & Technical Audit

> **Target Platform:** Windows 11 Desktop (Electron) + Portable Web Companion (Node / Container)  
> **Model Candidate:** `gemini-3.1-flash-lite` (default, low-thinking latency ~2.8s) / `gemini-3.5-flash-lite` / `gemini-3.8-flash`  
> **Target Application Baseline:** LibreOffice Calc (creating a labelled horizontal bar chart from tabular data `A1:B5`)  
> **Repository Budget:** Strict < 10 MB limit (Tracked source/assets: **~3.76 MB** across 104 files; Git database: **~3.07 MB**; Total: **~6.82 MB**)  
> **Public Repository:** [https://github.com/akashgamerz6575-spec/Unstuck](https://github.com/akashgamerz6575-spec/Unstuck)  
> **Windows Release:** [https://github.com/akashgamerz6575-spec/Unstuck/releases/tag/v1.0.0](https://github.com/akashgamerz6575-spec/Unstuck/releases/tag/v1.0.0)  
> **Submission Deadline:** 9 October, 4:30 PM IST  

---

## 1. Executive Summary & Product Role

**Unstuck** is an interactive desktop coach guiding beginners through multi-step desktop software tasks using on-demand screen observation, local OCR grounding, pass-through visual overlays, progress verification, and mistake recovery.

### What Unstuck Is:
- A non-intrusive pair coach for beginners.
- Screen-aware: observes the active application window upon user demand (`Check` button or `Ctrl+Alt+U`).
- Grounded: identifies UI buttons using local OCR candidates and highlights target controls with a high-contrast boundary overlay.
- Patient: verifies actual visible screen progress before advancing.
- Resilient: detects wrong turns (e.g. creating a Pie chart instead of a Bar chart, or opening the wrong menu) and guides the user back to the target path without losing the original goal.

### What Unstuck Is Not (Deliberate Out-of-Scope Boundaries):
- **Not an autonomous agent:** Unstuck does not hijack the cursor, simulate mouse clicks, or type keystrokes into user applications. The user retains complete physical control.
- **Not continuous screen streaming:** No continuous video recording or battery-draining background polling. Capture occurs solely when the user clicks **Check** or presses the keyboard shortcut.
- **Not universal automation:** Unstuck specializes in step-by-step guidance for structured desktop tasks (LibreOffice Calc demo benchmark).

---

## 2. Milestone Focus: Changed-Goal Root Cause & Verified 3-Column Execution

### A. Failure Mode & Prior False-Positive Disclosure
In earlier testing, when Akash restarted the application and requested a custom goal (*"Simplify all three columns and highlight the highest number"*), Unstuck prematurely responded that the horizontal bar chart goal was already achieved.

In our immediate prior progress report, an initial test of *"Highlight the largest numeric value in B2:C5 with a yellow background"* was mistakenly marked as "Pass" because the JSON response schema was valid and Gemini did not mark the horizontal bar chart complete. **However, that report contained a false-positive verification claim:**
- The screenshot evaluated in that run (`calc-clean-bar-chart.png`) only had two columns of data (`Department`, `Requests`), with Column C completely empty.
- Gemini reported that "cell C3 contains 68", which was factually wrong (68 was in B3, and C3 was empty).
- A valid JSON schema was conflated with an accurate domain result. Chart interference was mitigated, but numeric value identification and formatting verification had **not** yet been proven.

### B. Investigation: Why Cell Addressing Failed on 2-Column Fixtures
1. **Multimodal Column Misattribution:** In `calc-clean-bar-chart.png`, the active spreadsheet cell was `C8`, causing the column header `C` to be highlighted in blue and the formula Name Box to read `C8`. When Gemini was asked to evaluate range `B2:C5` on an image where Column C was empty, the visual salience of the blue `C` header coupled with value 68 in row 3 caused Gemini to hallucinate that 68 was in `C3`.
2. **Missing Grid Traversal Rules:** The system prompt previously instructed Gemini to "visually inspect cells" without giving strict column/row coordinate reading rules or an explicit uncertainty guard.
3. **Prompt Safeguards Implemented:**
   - **Methodical Coordinate Reading:** Instructs Gemini to trace up to column letters (A, B, C...) regardless of which cell/header is highlighted, read row index numbers (1, 2, 3...) along the left margin, and check each cell in range `B2:C5` individually.
   - **Uncertainty Guard:** If cell coordinates or text values cannot be determined with high confidence, Gemini is strictly instructed to return `status: "uncertain"` and `assessment: "uncertain"` rather than inventing an address.
   - **Formatting Verification Rule:** `status: "complete"` requires visible proof of the requested formatting (e.g. yellow cell fill) on the target cell. Merely seeing the target cell, the number, or an existing chart is never evidence of completion.

### C. Live Gemini Verification on Synthetic 3-Column Fixtures

To verify that Gemini correctly identifies cells and formatting in the three-column scenario without conflating cell columns, we tested the workflow against two synthetic fixtures created by editing an existing Calc screenshot using Pillow:
- `fixtures/calc-three-column-unformatted.png`
- `fixtures/calc-three-column-formatted.png`

> [!IMPORTANT]
> **Fixture Provenance & Manual Testing Disclosures:**
> 1. **Synthetic Fixture Construction:** `fixtures/calc-three-column-unformatted.png` and `calc-three-column-formatted.png` were **synthetically edited using Pillow**, adding Column C (`Rate`) and numeric values onto an existing Calc base image, while keeping the horizontal bar chart visible to evaluate chart-completion isolation.
> 2. **Synthetic Formatting:** In `calc-three-column-formatted.png`, the yellow cell fill on C5 was **synthetically applied using Pillow** (filling the cell bounds with `#FFFF00`), rather than applied by a user in LibreOffice Calc.
> 3. **Live API Execution on Synthetic Fixtures:** The test results below in Section C represent **live Gemini API verification on synthetic fixtures**, confirming cell identification and yellow fill detection.
> 4. **Manual Live Desktop Demonstration on Real Calc:** Akash has manually demonstrated on a live LibreOffice Calc sheet on Windows 11:
>    - Identification of 46000 in C2 after the table had been manually rearranged.
>    - Step-by-step guidance to apply a yellow cell background fill.
>    - A subsequent check correctly reporting `status: "complete"` and visually recognising the yellow fill.
>    - *Scope Boundary:* This verifies that specific highlighting scenario on a live desktop application. It does not establish that Nori guided the preceding sorting/ranking task or works universally across arbitrary spreadsheet arrangements.

#### Fixture Table Data:
```
Department | Requests | Rate
Library    | 42       | 56
IT Desk    | 68       | 26
Accounts   | 31       | 28000
Admissions | 55       | 46000
```
Goal: *"Highlight the largest numeric value in B2:C5 with a yellow background."* (Expected target: C5 containing 46000).

#### Turn 1: Initial Guidance on Synthetic Unformatted Grid
- **Input:** `fixtures/calc-three-column-unformatted.png` (synthetic fixture)
- **Result:**
  ```json
  {
    "assessment": "not_started",
    "status": "guide",
    "observation": "I can see the values in cells B2:C5. The largest numeric value in this range is 46000, located in cell C5.",
    "instruction": "Please click on cell C5 (which contains the value 46000), then click the 'Background Color' icon in the toolbar (it looks like a paint bucket) and select yellow to highlight it.",
    "selectedCandidateId": null,
    "expectedOutcome": "Cell C5 should have a yellow background."
  }
  ```
- **Outcome:** **Verified on Synthetic Fixture.** Gemini correctly traversed the columns, identified 46000 in C5 (avoiding misattributing 68 to C3), guided cell selection and toolbar Background Color, emitted `selectedCandidateId: null` (no fake outline), and was not distracted by the visible bar chart.

#### Turn 2: Progress Verification on Synthetic Formatted Grid
- **Input:** `fixtures/calc-three-column-formatted.png` (synthetic fixture with C5 yellow fill applied via Pillow)
- **Context:** Turn 1 history preserved; `previousInstruction` passed to evaluate progress.
- **Result:**
  ```json
  {
    "assessment": "expected",
    "status": "complete",
    "observation": "Cell C5, which contains the value 46000, is highlighted with a yellow background.",
    "instruction": "Great job, the largest numeric value in the range B2:C5 has been correctly identified and highlighted.",
    "selectedCandidateId": null,
    "expectedOutcome": "The largest numeric value (46000 in cell C5) is highlighted with a yellow background."
  }
  ```
- **Outcome:** **Verified on Synthetic Fixture.** Gemini detected the synthetic yellow fill on C5 and confirmed completion under preserved multi-turn history.


### D. Session Continuity & Anti-Race Protection
1. **Preserving History on Fresh Screenshots:** In `web/app.ts`, uploading or replacing a screenshot under the *same* goal clears stale highlight overlays (`clearHighlight()`), but preserves `this.history` and `this.lastGuidance`. This enables multi-turn verification where Gemini checks if its previous instruction was completed.
2. **Goal Invalidation:** Changing the goal text or clicking Reset immediately flushes `history = []`, `lastGuidance = null`, resets step counts, and triggers `/api/session/reset`.
3. **Anti-Race Protection:** All reset operations store an in-flight `pendingResetPromise`. Any subsequent analysis call (`runAnalysis()`) strictly awaits `this.pendingResetPromise` before issuing `/api/check`, eliminating race conditions between session reset and inference.

---

## 3. Character & Visual Identity: Nori

- **Companion Name:** **Nori**
- **Approved Source Asset:** `captures/design/nori.png` (High-resolution 3D robot character with orange warm eyes, blue accents, holding a gift parcel, waving hello).
- **Web Production Assets:**
  - `web/assets/nori.webp` (**191 KB**, 1254x1254, **lossy WebP encoded at quality=90 with alpha transparency**, delivering 78% reduction vs 989 KB PNG while preserving clean silhouette edges; never described as lossless).
  - `web/assets/nori.png` (989 KB, PNG fallback).
  - `web/assets/nori-portrait.webp` (**83 KB**, 840x630 crop centered on Nori's head and welcoming expression for coach panel badge).
  - `web/assets/nori-portrait.png` (459 KB, PNG fallback).
- **Hero Staging & Unified Palette:**
  - Deep midnight navy canvas (`#080F24`), enormous pearl HTML `UNSTUCK` lettering (`#F5F7FC`) positioned directly behind Nori, warm welcome bubble, and immediate CTA visibility.
  - Eliminated all residual forest-green card backgrounds, unifying the application around midnight navy `#080F24` and sky blue `#69C8FF` accents.
  - Added `#workflow-demo` visual walkthrough section showing an illustrative *Observe → Guide → Check* progression with Calc snippet, grounded outline, and Nori guidance card (explicitly labelled as a documented example).
  - Dedicated standalone example bar (`Try an example: [Start] [Data selected] [Wrong chart] [Finished chart]`) placed outside the dropzone so examples remain discoverable after loading an image.
  - Full `prefers-reduced-motion` compliance: all transforms and entrance sequences are disabled when requested, displaying an instant static layout with zero functionality loss.

---

## 4. Fixture Provenance & Evidence Disclosures

To adhere strictly to truthfulness and avoid deceptive evaluation claims, we disclose the exact provenance of all evaluation fixtures and screenshots:

### A. Model Input Fixtures (`fixtures/`)
For the web companion example selector, automated testing, and milestone verification, the following fixtures are provided:
1. `fixtures/calc-clean-unselected.png` (97 KB): Step 1 — Table `A1:B5` visible in Calc with an unrelated cell (`C10`) focused.
2. `fixtures/calc-clean-selected.png` (79 KB): Step 2 — Table `A1:B5` visibly highlighted/selected.
3. `fixtures/calc-clean-pie-chart.png` (91 KB): Step 3 — User made an intentional deviation: generated a Pie chart instead of a horizontal Bar chart.
4. `fixtures/calc-clean-bar-chart.png` (71 KB): Step 4 — Finished horizontal bar chart titled *"Requests by department"*.
5. `fixtures/calc-three-column-unformatted.png` (76 KB): Synthetic 3-column table fixture created by programmatically editing an existing Calc capture using Pillow, adding Column C (`Rate`) and numeric values (`56`, `26`, `28000`, `46000`).
6. `fixtures/calc-three-column-formatted.png` (76 KB): Synthetic fixture created using Pillow by applying a yellow fill (`#FFFF00`) to cell C5 (`46000`) to evaluate formatting completion detection.

**Important Provenance Disclosure:**
- Files 1–4 are **processed fixtures derived from real Windows 11 Calc desktop captures**. During the live desktop recording, the desktop coach panel occupied the bottom-right corner of the screen. To prevent multimodal vision models (Gemini) from reading prior coaching text or answer hints directly from the image, the bottom-right coach region was replaced with reconstructed empty spreadsheet grid lines matching the surrounding Calc canvas.
- Files 5–6 are **synthetic test fixtures created using Pillow** to evaluate 3-column addressing and formatting verification without waiting for manual test execution. The yellow fill on C5 was applied synthetically via script, not by a user in LibreOffice Calc.
- These fixtures are strictly model-input test assets. They are **not** presented as untouched raw desktop captures or evidence of manual user execution.

### B. Documentation Evidence Captures (`docs/images/`)
Four live desktop execution screenshots are retained in `docs/images/` showing Unstuck in active Windows 11 coaching mode:
- `docs/images/01-selection-recognition.png` (159 KB): Shows coach detecting unselected table data.
- `docs/images/02-progress-advancement.png` (159 KB): Shows coach advancing to Chart Wizard and highlighting the `Insert` menu.
- `docs/images/03-wrong-chart-recovery.png` (197 KB): Shows coach detecting wrong Pie chart type and presenting recovery badge.
- `docs/images/04-task-completion.png` (158 KB): Shows coach validating horizontal bar chart completion.

---

## 5. Reliability & Error Resilience History

During real-world end-to-end testing against Google Gemini APIs, several failure modes were observed and engineered for:

| Failure Mode Observed | Root Cause | Implemented Mitigation | Verification Status |
|---|---|---|---|
| **HTTP 429 (Rate Limit Exhaustion)** | Rapid repeated user clicks triggering burst requests to Gemini. | **Session Budget & Rate Pacing:** Web and Desktop enforce a strict 15-request persistent session cap and a 5-second minimum interval between checks. Buttons show active cooldown. | **Verified:** Unit tests `tests/web-server.unit.test.ts` and `tests/budget-tracker.unit.test.ts` pass; live server rejects rapid bursts with friendly HTTP 429 messages. |
| **Client Timeout (Network stalls)** | Indefinite fetch hangs during network latency spikes. | **25-Second AbortSignal:** Model requests enforce an explicit 25-second timeout (`REQUEST_TIMEOUT_MS = 25000`) with friendly retry notices, preserving user session state without losing context. | **Verified:** Unit tests verify timeout rejection handling; client displays retry button without resetting goal. |
| **Malformed Structured JSON** | Multimodal model output returning unescaped Markdown or trailing text outside JSON schema. | **Safe Uncertainty Rejection:** Multi-tier JSON sanitizer strips markdown fences and validates candidates against local OCR sets. If JSON remains corrupt or schema validation fails, the system returns an explicit safe error/uncertain result (`status: "uncertain"`), **never** fabricating successful guidance or completion through fallback defaults. | **Verified:** 83 unit tests pass across 23 suites, validating candidate contract and schema boundaries. |
| **Provider Overload (503 / 500)** | Upstream Google AI Studio temporary capacity spikes during peak hours. | **Truthful Status & Graceful Fallback:** Status bar displays `Ready (Key Configured)` rather than falsely claiming guaranteed upstream uptime. Real errors display friendly retry dialogs. | **Verified:** Verified during local testing runs; error state provides clean retry action. |

---

## 6. Judging Criteria Audit

### 1. Code Quality
- **Architecture:** Clean process separation between Electron Main (security, secret management, Win32 window management, native screen capture), Preload (strictly typed context-isolated IPC), and Renderer / Web frontend.
- **Strict Typing:** All TypeScript configurations run under `strict: true`. No untyped `any` leaks in core IPC contracts or model schemas.
- **Build Reproducibility:** Single command `npm run build` compiles TypeScript (`tsc`) and synchronizes static assets via `scripts/copy-assets.mjs` and `scripts/copy-web-assets.mjs`.

### 2. Security Boundaries
- **Server-Side Credentials:** `GEMINI_API_KEY` is loaded exclusively into Node / Electron backend processes from `.env`. It is **never** injected into HTML, bundled JavaScript, renderer processes, or git commits.
- **Narrow IPC Surface:** Renderer only accesses sandboxed IPC channels (`onStatusUpdate`, `sendStart`, `sendCheck`, etc.).
- **Untrusted Observations:** Screen text and OCR candidates are treated as untrusted data; never rendered via `innerHTML` or executed as code.
- **Pass-through Overlay:** Electron transparent overlay uses `setIgnoreMouseEvents(true, { forward: true })`, ensuring mouse events pass through directly to native applications.

### 3. Efficiency & Resource Footprint
- **Repository Size Separation:**
  - Tracked source and assets: **3,940,191 bytes (~3.76 MB across 104 files)**, well within the 5 MB target.
  - Git database objects (`.git`): **3,214,109 bytes (~3.07 MB)**.
  - Combined tracked files + git repository: **~6.82 MB**, strictly adhering to the < 10 MB budget.
- **OCR Worker Reuse:** Tesseract OCR worker is initialized once and reused across capture cycles, avoiding memory leaks and spin-up delays.
- **Lightweight Assets:** Typography hosted locally (*Manrope* and *DM Sans*, < 120 KB total); Nori character encoded as WebP at 191 KB (78% smaller than original PNG).

### 4. Testing
- **Automated Test Results:** **89 passing unit tests** across 25 test suites (`npm test`, 0 failures).
  - Model response assembly, multi-part JSON formatting, and thought-part exclusion (`tests/model-response-diagnostics.unit.test.ts`).
  - Network diagnostic classification and credential sanitization (`tests/model-response-diagnostics.unit.test.ts`).
  - Goal invalidation, chart isolation, and clarification contracts (`tests/goal-invalidation.unit.test.ts`).
  - Coordinate transformations and 125% DPI scaling math.
  - Candidate ID contract validation.
  - Recovery payload schemas (wrong menu, wrong chart type).
  - Session budget tracker and rate pacing.
  - Web server endpoints (`/healthz`, `/api/example`, `/api/examples`, `/api/check`, `/api/session/reset`).

### 5. Render Web Service Deployment Configuration

The web companion is completely containerized and portable for Render:

```dockerfile
# Stage 1: Build TypeScript and copy static assets
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY shared/ ./shared/
COPY server/ ./server/
COPY web/ ./web/
COPY electron/ ./electron/
COPY scripts/ ./scripts/
COPY fixtures/ ./fixtures/
RUN npm run build:web

# Stage 2: Production runner
FROM node:20-slim AS runner
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist dist/
COPY --from=builder /app/web web/
COPY --from=builder /app/fixtures fixtures/
EXPOSE 8080
ENV PORT=8080
ENV HOST=0.0.0.0
CMD ["node", "dist/server/server.js"]
```

#### Render Web Service Settings:
- **Service Type:** Web Service
- **Repository:** `https://github.com/akashgamerz6575-spec/Unstuck`
- **Branch:** `main`
- **Runtime:** Docker
- **Dockerfile Path:** `Dockerfile`
- **Build Context:** `.`
- **Docker Command:** Default `CMD` (`node dist/server/server.js`)
- **Health Check Endpoint:** `/healthz`
- **Instance Type:** Free Instance
- **Required Secrets:** `GEMINI_API_KEY` (configured securely in Render dashboard environment variables)
- **Optional Model Override:** `GEMINI_MODEL=gemini-3.1-flash-lite`

---

## 7. Submission Checklist & Repository Status

- [x] **Repository Budget:** Tracked source is ~3.76 MB, Git objects are ~3.07 MB (Total ~6.82 MB < 10 MB limit).
- [x] **Single Branch Integrity:** All commits made directly on `main`. No auxiliary branches created.
- [x] **Secret Isolation:** Zero credentials committed to git; `.env` is git-ignored and validated.
- [x] **Changed Goal Regression:** Verified live with Google Gemini; covered by 7 unit tests.
- [x] **Synthetic 3-Column Verification:** Live Gemini model verified on Pillow-edited 3-column fixtures (C5 identification, yellow fill recognition, chart isolation).
- [x] **Manual Desktop Demonstration on Real Calc:** Akash verified cell 46000 in C2, yellow background guidance, and subsequent check confirming COMPLETE with yellow fill on a live Calc session.
- [x] **Containerized Web Companion Verified:** Portable container configuration with health endpoint `/healthz` returning HTTP 200, clean static asset delivery, and live Gemini multimodal analysis verified (`status: "guide"`, unselected range recognition).
- [x] **Code Quality Hardening:** Deduplicated Gemini system prompts & response schemas into `shared/gemini-config.ts`, added strict boundary input guards on API and IPC interfaces, and established guaranteed capture window restoration on fatal errors.

---

## 8. Final Code-Quality & Boundary Hardening Pass

To reinforce engineering rigor across the codebase ahead of final judging:

1. **Deduplicated Gemini Prompt, Schema & Model Architecture (`shared/gemini-config.ts`):**
   - Consolidated 140+ lines of duplicated prompt instructions and response schemas between `electron/gemini-coach.ts` and `server/gemini-service.ts` into a single canonical source of truth.
   - Unified `resolveModelName()`, ensuring that `process.env.GEMINI_MODEL` is uniformly respected by both desktop and web clients rather than hardcoded in the Electron loop.
   - Replaced raw `as any` response parsing with strongly-typed `GeminiApiResponse`, `GeminiApiCandidate`, and `GeminiApiPart` interfaces.

2. **API & IPC Boundary Type Safety & Malformed Payload Guards:**
   - In `server/server.ts`, updated `readJsonBody` to return `Promise<unknown>` with safe object guards (`asSafeObject`), protecting `/api/check` and `/api/session/reset` against `null` or primitive JSON inputs.
   - In `server/server.ts`, hardened `history` array parsing against nullish or malformed entries, preventing unhandled 500 runtime exceptions.
   - In `electron/main.ts`, strictly typed the `start-coaching` IPC listener to validate that `goal` is a non-empty string before setting session state.
   - In `electron/main.ts`, guarded `window-minimize` and `window-close` listeners against destroyed window references (`!win.isDestroyed()`).

3. **Capture Concealment & Error State Invariants (`electron/main.ts`):**
   - Added a centralized `restoreCaptureWindows()` helper.
   - Fixed an error-state defect where any exception during capture or pre-analysis left the coach panel or overlay orphaned in a hidden state; `restoreCaptureWindows()` is now guaranteed across all early-return and `catch` paths.

---

## 9. Application-Agnostic Mode & Tutorial Video Integration

### A. Architectural Overview & Boundaries
Unstuck has been extended from a LibreOffice Calc-only demonstrator to an **application-agnostic desktop coach** providing actionable, single-step text guidance across arbitrary desktop software:
1. **Target Foreground Scoping:** In Electron, the hard Calc-only gate was replaced by dynamic application scoping (`isValidTargetWindow`). Any active foreground window (e.g. text editors, creative tools, CAD, web browsers) can be observed on demand, while Unstuck itself and desktop/explorer background wallpaper are strictly excluded from capture.
2. **Text-Guidance Grounding:** For generic non-Calc applications, Unstuck operates strictly in text-guidance mode. It provides one concise, actionable instruction without fabricating control bounding boxes or injecting coordinate brackets. Grounded visual overlays remain strictly preserved and scoped to verified LibreOffice Calc workflows.
3. **No-OCR Resilience:** The system prompt and validation contracts explicitly support text-only guidance even when OCR returns 0 candidates (`selectedCandidateId: null`).
4. **Goal Isolation & Prompt Injection Defense:** Generic applications and custom goals never trigger the Calc horizontal bar chart preset rules, even if the user's goal contains the word "chart". All visible screen text and tutorial content are treated as strictly untrusted observations that cannot override the user's active goal or system guardrails.
5. **Session Isolation & Rate Pacing:** 1-request-in-flight concurrency, 5-second pacing, session budget quotas, and monotonic request IDs are maintained across all modes.

### B. Tutorial Video Integration
1. **Gemini Video Understanding via `fileData`:** Unstuck supports an optional public YouTube tutorial video URL. In accordance with official Gemini API documentation, the YouTube link is passed directly via `fileData.fileUri` with `mimeType: "video/mp4"`.
2. **Zero Video Scraping:** Videos are never downloaded, scraped, or recorded locally.
3. **Session-Only Context Extraction:** When provided, the tutorial video is analyzed **once** upon task entry to extract a compact sequence of 4–8 high-level steps. This compact text summary is cached in the active session and passed to subsequent turn prompts, avoiding resending the full video on every check.
4. **Graceful Fallback & Truthful Disclosure:** If the video URL is invalid, unlisted/private, or if the model candidate/region cannot process YouTube video input, Unstuck provides clear user notice and continues seamlessly with screenshot-only text guidance. The model never pretends the video was processed if it failed.
5. **Client Secret Isolation:** Desktop video requests use the user-configured `GEMINI_API_KEY` on their local machine. No credentials are shipped, logged, or routed through third-party servers.

### C. Manual Testing & Unverified Software Disclosures
- **LibreOffice Calc (Horizontal Bar Chart Benchmark):** Fully verified with live desktop testing and synthetic regression fixtures.
- **Application-Agnostic Mode:** Verified with 16 automated unit tests (106 tests total) covering generic non-Calc application prompts, goal isolation, zero-OCR text guidance, tutorial URL validation and failure handling, session step caching, and Calc parity.
- **Blender / Unreal Engine 5:** Neither software package is installed on the current environment. Consequently, full manual guidance workflows for Blender and UE5 are marked **PENDING MANUAL VERIFICATION**. In adherence to project integrity rules, universal application support is **not** claimed without manual testing evidence.
