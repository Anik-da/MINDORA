# Unstuck — Live Demonstration & Rehearsal Script

**Date:** 9 October 2026  
**Audience:** Prompt Wars Evaluation / Hackathon Judges  
**Duration:** ~3–4 minutes  
**Target Application:** LibreOffice Calc on Windows 11 (125% DPI scaling)

---

## 1. Setup & Pre-Flight Checklist

1. [ ] **Launch LibreOffice Calc:**
   - Open a fresh document or load `fixtures/department_requests.csv`.
   - Ensure the table occupies cells `A1:B5`:
     - `A1`: Department, `B1`: Requests
     - `A2:B5`: Library 42, IT Desk 68, Accounts 31, Admissions 55
   - Unselect the cells (click on cell `C10`).
2. [ ] **Verify API Configuration:**
   - Ensure `.env` has a valid `GEMINI_API_KEY`.
   - Budget counter (`.api_budget.json`) is active.
3. [ ] **Position Windows:**
   - LibreOffice Calc occupying the left or center of the primary display.
   - Terminal ready to launch Unstuck.

---

## 2. Rehearsed Demonstration Walkthrough

### Act I: Launch & Goal Alignment (0:00 – 0:45)
1. **Launch Command:**
   ```bash
   npm start
   ```
2. **What appears on screen:**
   - The cinematic Launch Window opens at ~1040x700:
     - Headline: *"Find your next move."*
     - Right centerpiece: Organic sculptural ribbon transitioning from a tangled knot to a clear moss path.
     - Task card: Pre-filled with goal: *"Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department."*
     - Target application detector confirms: `Target: LibreOffice Calc`.
3. **Presenter Spoken Context:**
   > *"When beginners open deep desktop software like LibreOffice Calc, they face hundreds of dense icons and menus. Tutorials are static and chatbots can't see what's happening. Unstuck is an interactive desktop coach that observes your screen on demand, grounds its guidance to visible controls, and helps you recover when you make a wrong turn."*
4. **Action:**
   - Click **Start coaching**.
   - Launch Window transitions smoothly into the compact **Active Coach Panel** (~380px) docked at the bottom-right corner.

---

### Act II: Initial Check & Grounded Directive (0:45 – 1:30)
1. **Initial Screen State:**
   - Calc is visible; cells `A1:B5` are not yet selected.
2. **Action:**
   - In the coach panel, click **Check my progress** (or press `Ctrl+Alt+U`).
3. **What happens:**
   - Coach panel briefly displays *"Reading your screen…"*.
   - Unstuck captures the Calc window, crops to its bounds, runs local OCR, and queries `gemini-3.1-flash-lite`.
4. **Observed & Verified Model Guidance:**
   - **Status:** `guide`
   - **Observation:** *"The spreadsheet is open, but range A1:B5 is not selected."*
   - **Dominant Directive:** *"Click cell A1 and drag down to cell B5 to select your data table."*
   - **Overlay:** No false bounding box is drawn for a drag gesture (`selectedCandidateId: null`), demonstrating disciplined spatial grounding.
5. **User Action:**
   - Click cell `A1` and drag down to select `A1:B5`.

---

### Act III: Next Step & Grounded Overlay Target (1:30 – 2:15)
1. **Action:**
   - Press `Ctrl+Alt+U` to check progress.
2. **What happens:**
   - Unstuck evaluates the highlighted cells.
3. **Observed Guidance:**
   - **Status:** `guide`
   - **Observation:** *"Data range A1:B5 is selected. The top menu bar is visible."*
   - **Dominant Directive:** *"Click 'Insert' on the top menu bar to open chart options."*
   - **Overlay:** The transparent overlay draws a high-contrast Moss green outline (`#A6B68F`) around the **Insert** menu item on Calc's menu bar with the badge `Target: Insert`.
   - **Click-Through:** The presenter directly clicks through the overlay on **Insert**. The menu opens smoothly without window interference.

---

### Act IV: Deliberate Deviation & Mistake Recovery (2:15 – 3:00)
1. **Deliberate User Mistake:**
   - Instead of choosing *Chart*, the presenter deliberately clicks the adjacent **Format** menu item (or opens the Format menu).
2. **Action:**
   - Click **Check my progress** (or press `Ctrl+Alt+U`).
3. **What happens:**
   - Unstuck observes that the *Format* dropdown is open.
4. **Recovery Guidance (Verified Contract):**
   - **Status:** `recover` (Border switches to warm clay `#D58B64` with badge `Correction`).
   - **Observation:** *"You opened the 'Format' menu instead of 'Insert'."*
   - **Recovery Rationale:** *"The Format menu controls cell styles. Charts are created under the Insert menu."*
   - **Directive:** *"Click 'Insert' on the top menu bar."*
   - **Overlay:** The target highlight repositions accurately onto **Insert**.
5. **Presenter Spoken Context:**
   > *"Notice that Unstuck didn't crash or advance a scripted counter. It recognized the deviation, explained why it happened, and provided the exact corrective action while keeping our original goal intact."*

---

### Act V: Chart Wizard & Completion (3:00 – 3:45)
1. **User Action:**
   - Click **Insert** -> **Chart...**.
   - The Chart Wizard opens.
2. **Action:**
   - Press `Ctrl+Alt+U`.
3. **Guidance:**
   - Unstuck identifies the Chart Wizard dialog.
   - Instructs the user to select **Bar** (horizontal) rather than Column or Pie.
   - Guides the user to click **Next >>**, select Chart Elements, and input the title *"Requests by department"*.
4. **User Action:**
   - Clicks **Finish**. The completed chart appears on the spreadsheet sheet.
5. **Final Check:**
   - Press `Ctrl+Alt+U`.
6. **Completion State:**
   - **Status:** `complete` (Calm green badge `Complete`).
   - **Directive:** *"Well done! Your horizontal bar chart titled 'Requests by department' is inserted."*
   - **Overlay:** Highlight cleared; clean conclusion without disruptive celebratory gimmicks.

---

## 3. Distinction Between Rehearsed vs. Pending Steps

| Step | Rehearsal Status | Evidence / Measurement |
|---|---|---|
| Launch Window UI & Knot Centerpiece | **Verified Live** | Rendered in Electron 44.7.0, verified tokens and font loading. |
| Window Scoping & Geometry Filter | **Verified Live** | PowerShell Win32 HWND & process identity filter passed. |
| Initial Unselected Table Detection | **Verified Live** | Tested on `calc-test.png`: Model returned `selectedCandidateId: null`, 2886 ms latency. |
| Grounded "Insert" Outline & Click-Through | **Verified Live** | Akash physically confirmed outline placement and menu activation through overlay. |
| Wrong Menu Recovery Contract | **Verified in Test Suite** | Unit test passed in `recovery-scenarios.unit.test.ts`. |
| Chart Wizard & Finish Detection | **Pending Live Desktop Rehearsal** | Requires interactive walk-through on live Calc wizard with active session. |

---

## 4. Draft Submission Text (For Akash's Later Review)

> **Project Name:** Unstuck  
> **Tagline:** Find your next move. A screen-aware interactive coach for complex desktop software.  
> **Description:** Unstuck guides beginners through intimidating desktop applications (like LibreOffice Calc) using on-demand visual observation, local OCR grounding, and Gemini multimodal reasoning. Rather than hallucinating coordinates or hijacking mouse input, Unstuck highlights the exact button to click through a transparent pass-through overlay, verifies real progress before advancing, and gracefully catches mistakes when users take a wrong turn.  
> **Repository:** https://github.com/akashgamerz6575-spec/Unstuck
