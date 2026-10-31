# Ghost Guide Reference Inspection Report

**Reference URL:** `https://github.com/ezpedersen/lahacks2025/`  
**Inspection Date:** 8 October 2026  
**Mode:** Read-only inspection via isolated external checkout (outside submission repository).

---

## 1. Architectural & Flow Trace

### A. Window Setup & Lifecycle (`frontend/electron/main.ts`)
- **Multi-Window Structure:** Spawns up to four distinct windows:
  1. `win`: Base transparent click-through window (`setIgnoreMouseEvents(true, { forward: true })`).
  2. `landingWin`: Setup / URL ingestion modal (`/ghost`).
  3. `persistentUiWin`: Fixed bottom-right controller (`280x212px`, positioned at screen bounds minus padding).
  4. `ghostPointWindow`: Transparent fullscreen window dedicated to rendering the ghost pointer.
- **IPC Surface:** Uses loose `ipcMain.on` / `webContents.send` without comprehensive payload validation.

### B. Capture & Screen Processing
- Uses Electron `desktopCapturer.getSources({ types: ['screen'] })`.
- Captures full monitor thumbnail, converts to PNG blob, and writes debugging screenshots to disk (`~/screenshot-debug/screenshot-<timestamp>.png`), contrary to security best practices.
- Performs naive cropping by quadrant (`top-left`, `top-right`, `bottom-left`, `bottom-right`, `center`) hardcoded to `center` in `main.ts`, then scales down to max 640px in Python PIL (`positioning.py`), degrading UI text legibility.

### C. Backend & Model Dependencies (`backend/main.py`, `backend/positioning.py`)
- Requires a separate FastAPI backend server running on `http://localhost:8000`.
- **Model Dependencies:**
  - `backend/positioning.py`: hardcoded to `gemini-2.5-flash-preview-04-17` (an outdated preview model).
  - `backend/main.py`: references `gemini-2.0-flash` and Groq's `mixtral-8x7b-32768`.
- Complex multi-pipeline setup: attempts YouTube transcript parsing, video analysis, and Groq LLM checkpoint decomposition before any UI positioning occurs.

---

## 2. Target Coordinate Finding: Hardcoded Marker Placement

> [!CAUTION]
> **Model-returned target coordinates NEVER reach the rendered marker; placement is hardcoded.**

1. In `frontend/electron/main.ts` (lines 270–275):
   ```ts
   if (data && typeof data.x === 'number' && typeof data.y === 'number') {
     createGhostPointWindow(data.x, data.y, description);
   }
   ```
2. In `createGhostPointWindow(x, y, description)` (lines 98–139):
   - The function accepts `x` and `y`, but **never forwards them** via IPC or window coordinates.
   - It only sends the text message: `ghostPointWindow?.webContents.send('set-ghost-message', description);`.
3. In `frontend/src/components/GhostPoint.tsx` (lines 4–19):
   - Marker positioning is entirely hardcoded:
     ```tsx
     const DEFAULT_POSITION = { left: '47%', top: '13.5%' };
     const TARGET_POSITION = { left: '70%', top: '60%' };
     ```
   - On mount, a timer transitions from `DEFAULT_POSITION` to `TARGET_POSITION` after 1 second (`setTimeout(..., 1000)`).
4. **Conclusion:** Ghost Guide's demonstration uses hardcoded marker placement rather than dynamic model-guided targeting.

---

## 3. Licensing & Legal Status Inspection
The following items were specifically inspected in the external checkout:
- **Root Repository Files:** No `LICENSE`, `LICENSE.md`, `COPYING`, or `NOTICE` file exists anywhere in the repository.
- **`README.md` (Root & Frontend):** Inspected completely. Contains descriptive text and setup steps only; no licensing grant, copyright statement, or terms of use are specified.
- **Package Metadata:**
  - `frontend/package.json`: Contains `"private": true` and completely lacks a `"license"` field.
  - `backend/requirements.txt`: Standard list of Python packages; no license metadata.
- **Source File Notices:** Ripgrep inspection across all TypeScript, JavaScript, and Python source files (`frontend/electron/*`, `frontend/src/*`, `backend/*`) revealed zero author copyright headers or license comments. (Only third-party bundle comments in `package-lock.json` and a single inline MIT notice in a third-party CSS snippet inside `index.css` were present).
- **Legal Implication:** Under standard copyright law, the lack of an open-source license grant means all rights are reserved by the authors. No source code, prompts, or assets may be copied or reused. Unstuck will remain 100% original.

---

## 4. Key Takeaways for Unstuck

| Aspect | Ghost Guide Pattern | Unstuck Implementation Plan |
| :--- | :--- | :--- |
| **Backend Architecture** | Heavy FastAPI + Python + Groq + Gemini | Lightweight, single-process Electron main Node client calling Gemini directly |
| **Target Coordinates** | Hardcoded demo percentages (`47%` → `70%`) | Grounded dynamic `[ymin, xmin, ymax, xmax]` normalized coordinates mapped to monitor logical bounds |
| **Capture Quality** | Aggressive 640px downscaling & fixed quadrant crop | High-clarity full-screen capture retaining legibility of toolbar controls |
| **Recovery Loop** | Non-existent; fixed sequential checkpoints | Real screen verification per step with explicit deviation recovery |
| **Privacy & Security** | Dumps raw screenshots to user home directory | Keeps image buffers in memory; zero disk capture leakage |
| **License** | All rights reserved (unlicensed) | 100% original implementation with documented open-source dependencies |
