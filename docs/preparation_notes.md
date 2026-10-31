# Unstuck — Preparation Notes

**Date:** 8 October 2026  
**Status:** Preparation and Environment Baseline Confirmed  
**Blueprint Version:** 1.4

---

## 1. Environment Baseline & Geometry
- **OS:** Windows 11 Home 64-bit (Version 10.0.26300, Build 26300).
- **Tooling:**
  - Node.js: `v24.13.0`
  - npm: `11.6.2`
  - Git: `2.54.0.windows.1`
  - Antigravity IDE: `2.5.5`
  - Antigravity CLI (`agy`): `1.0.13`
- **Display Configuration:**
  - Single primary display (`\\.\DISPLAY1`).
  - Hardware physical resolution: `2560 x 1600` (165 Hz).
  - Logical desktop bounds: `2048 x 1280` (Working Area: `2048 x 1232`).
  - Display scaling factor: **125%** (`AppliedDPI: 120`, base DPI: 96).
  - **Dynamic Measurement Rule:** The Electron implementation must query `screen.getPrimaryDisplay()` dynamically at runtime rather than hardcoding scaling factors.

---

## 2. Configuration & Workspace Hardening
- **`.gitignore`:** Established at repository root. Strictly excludes local `.env` and credential files, `node_modules`, build/distribution outputs (`dist/`, `release/`, `.exe`), capture dumps (`screenshots/`, `captures/`), video recordings, and external reference checkouts.
- **`.env.example`:** Created and tracked. Declares placeholders for `GEMINI_API_KEY` and default `GEMINI_MODEL=gemini-3.5-flash-lite` (with `gemini-3.8-flash` as configurable comparison).
- **`.env`:** Created locally with empty key placeholder. Verified as untracked/ignored by Git.
- **Git Status:** Single branch `main`, tracking `origin/main`. Working tree clean of untracked binaries.

---

## 3. Customizations & Project Rules
- **Project Rules:** Authored in [AGENTS.md](file:///c:/Users/ManjuMJ/Documents/Unstuck/AGENTS.md). Enforces single-branch policy, 10 MB budget, secret isolation in Electron main process, visual design ownership by Akash/ChatGPT, and dynamic coordinate conversion.
- **Workspace Skills Created:**
  - [unstuck-interface](file:///c:/Users/ManjuMJ/Documents/Unstuck/.agents/skills/unstuck-interface/SKILL.md): Directs coach panel ergonomics, transparent click-through overlay behavior, core state transitions, and alignment with the accepted botanical/cinematic visual quality direction.
  - [unstuck-screen-guidance](file:///c:/Users/ManjuMJ/Documents/Unstuck/.agents/skills/unstuck-screen-guidance/SKILL.md): Directs pre-capture UI concealment, DPI coordinate mapping, structured response validation, and mistake recovery in LibreOffice Calc.
- **Discovery Note:** Verified present in Antigravity's active workspace customizations inventory.

---

## 4. Gemini Smoke Test Harness
- Script located at [tests/gemini-smoke-test.mjs](file:///c:/Users/ManjuMJ/Documents/Unstuck/tests/gemini-smoke-test.mjs).
- Uses native Node `fetch` (zero external dependencies).
- Configurable model parameter (`GEMINI_MODEL`, defaulting to `gemini-3.5-flash-lite`, with `gemini-3.8-flash` as comparison option).
- Safe execution: Validates key existence without printing secrets. Exits gracefully in `[PENDING]` state if no key is supplied.
- Accepts an optional local screenshot argument to measure end-to-end vision latency and token consumption without automatic retries.

---

## 5. Demonstration Target (LibreOffice Calc)
- **Installation Status:** Installed and verified.
  - Executable: `C:\Program Files\LibreOffice\program\soffice.exe`
  - Version: `26.8.1.1` (64-bit)
- **Demonstration Fixture:**
  - Located at `captures/calc-test.png` (Dimensions: `2557 x 1536`, PNG).
  - Note: This screenshot represents a cropped application window rather than a full-monitor capture; does not claim desktop-overlay alignment.

---

## 6. Live Vision Targeting & Latency Benchmark Results
- **Task:** Locate the visible `Insert` menu in the top menu bar on `captures/calc-test.png`.
- **Generation Settings:** `thinkingLevel: "LOW"` (note: `LOW` was not the lowest supported setting for 3.5 Flash Lite), `maxOutputTokens: 256`, JSON structured output schema (`targetLabel`, `targetBox`). The root cause of the observed latency differences remains unresolved (no unsupported assumptions regarding default model thinking levels are made).
- **Sequential Model Results (Measured):**
  1. `gemini-3.5-flash-lite`:
     - Status: HTTP 200 (Success)
     - Total Latency: 54,974 ms (Time to headers: 54,967 ms)
     - Token Usage: 1,143 prompt (1,075 image, 68 text), 43 candidates. Total: 1,186 tokens.
     - Returned Box: `[23, 88, 41, 110]` -> Pixel `[x: 225, y: 35, w: 56, h: 28]`
     - **Visual Targeting Audit:** Enclosed the **Format** menu item (immediately to the right of Insert). Missed target.
  2. `gemini-3.1-flash-lite`:
     - Status: HTTP 200 (Success)
     - Total Latency: **10,285 ms** (Time to headers: 10,284 ms)
     - Token Usage: 1,143 prompt (1,075 image, 68 text), 43 candidates, 120 thoughts. Total: 1,306 tokens.
     - Returned Box: `[24, 116, 36, 144]` -> Pixel `[x: 297, y: 37, w: 72, h: 18]`
     - **Visual Targeting Audit:** Enclosed **Styles / Sheet** menu items. Missed target.
  3. `gemini-3.8-flash`:
     - Status: **HTTP 503 Service Unavailable** (error: "This model is currently experiencing high demand").
     - Total Latency: 10,266 ms.
- **Critical Architectural Implication:** Both available Lite models generated syntactically valid JSON bounding boxes, but visually misidentified neighboring menu controls. Valid schema coordinates alone do not constitute reliable target detection. When visual target confirmation cannot be reliably obtained, Unstuck must fall back to text-only guidance rather than displaying an unverified Gemini highlight.

---

## 7. Local OCR Diagnostic Feasibility Results (Tesseract.js)
- **Tooling:** `tesseract.js` (Node English recognition with word-level block extraction).
- **Asset Caching:** Language model (`eng.traineddata.gz`) stored in git-ignored `.cache/tesseract/`.
  - Worker cold initialization (with asset setup): ~400–4500 ms.
  - Worker cached initialization (local operation): **269 ms** (offline, no network download).
- **Recognition Timings (2557x1536 Full Image, Warmed Worker):**
  - Pass 1: **2,517.1 ms** (~2.5s)
  - Pass 2: **2,124.1 ms** (~2.1s)
  - Pass 3: **2,017.8 ms** (~2.0s)
- **Label Detection Audit (Conservative Exact Match):**
  - **Insert:** Resolved (88% conf) -> `[x: 152, y: 37, w: 35, h: 11]`. **Visually Correct** (tight bounding box on "Insert").
  - **Format:** Resolved (95% conf) -> `[x: 208, y: 37, w: 46, h: 11]`. **Visually Correct** (tight bounding box on "Format").
  - **Styles:** Resolved (93% conf) -> `[x: 275, y: 37, w: 36, h: 14]`. **Visually Correct** (tight bounding box on "Styles").
  - **Sheet:** Resolved (93% conf) -> `[x: 332, y: 37, w: 36, h: 11]`. **Visually Correct** (tight bounding box on "Sheet").
- **Architectural Conclusion:** Local OCR accurately located all four target controls in ~2.0 seconds with pixel-level precision, completely avoiding the adjacent-control hallucination of the Lite models. OCR failure means text-only guidance, not an unverified Gemini highlight.
