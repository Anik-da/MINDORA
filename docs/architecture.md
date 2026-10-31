# Unstuck Architecture & Developer Documentation

This document details the internal design, process model, IPC contracts, coordinate conversion mathematics, and security boundaries of **Unstuck**.

---

## 1. Process & Security Model

Unstuck is an Electron desktop application paired with an optional portable web companion. It follows the principle of least privilege, isolating sensitive system and AI resources in privileged Node.js processes while strictly sandboxing renderer presentation layers.

```
┌──────────────────────────────────────────────────────────┐
│                   Electron Main Process                  │
│                                                          │
│  • main.ts (Lifecycle & Window Orchestration)            │
│  • key-storage.ts (safeStorage DPAPI Persistence)        │
│  • window-scoping.ts (Win32 Active Foreground Guard)     │
│  • desktopCapturer (Ephemeral Screen Capture)            │
│  • target-resolver.ts (Tesseract OCR Engine Worker)       │
│  • gemini-coach.ts (Google Gemini Multimodal API Client) │
└────────────┬─────────────────────────────┬───────────────┘
             │                             │
             │ Context-Isolated IPC        │ Context-Isolated IPC
             ▼                             ▼
┌───────────────────────────┐ ┌────────────────────────────┐
│      Launch Renderer      │ │       Coach Renderer       │
│  • launch.html / launch.js│ │  • coach.html / coach.js   │
│  • Personal Key Setup     │ │  • Next Move Guidance      │
│  • Task & Goal Input      │ │  • Speech Synthesis (TTS)  │
│  • App Scoping Selector   │ │  • Telemetry & Rate Budget │
└───────────────────────────┘ └────────────────────────────┘
                                           │
                                           │ Main-Managed Forwarding
                                           ▼
                              ┌────────────────────────────┐
                              │      Overlay Renderer      │
                              │  • overlay.html            │
                              │  • Transparent Pass-Through│
                              │  • High-Contrast Box Render│
                              └────────────────────────────┘
```

### Process Isolation Boundaries
* **Context Isolation:** All browser windows enable `contextIsolation: true` and `sandbox: true`, disabling `nodeIntegration`.
* **Narrow IPC Surface:** Only explicitly typed and validated bridge methods in [`preload.cjs`](file:///c:/Users/ManjuMJ/Documents/Unstuck/electron/preload.cjs) are exposed via `contextBridge.exposeInMainWorld('electronAPI', ...)`.
* **Secret Isolation:** `GEMINI_API_KEY` is loaded exclusively in the Electron main process via Windows DPAPI (`safeStorage`) or local development `.env`. Raw keys are never transferred over IPC to renderers, never printed to console logs, and never embedded in application builds.

---

## 2. Screen Capture & Window Invisibility Protocol

To guarantee that Unstuck's own UI elements never appear in screen captures or occlude the target application:

1. **Trigger Check:** The user clicks **Check my progress** or presses the configurable global shortcut (`Ctrl+Alt+U`).
2. **Hide UI:** The main process calls `.hide()` on both the Coach window and the transparent Overlay window.
3. **OS Compositor Yield:** The main process yields execution for ~120 ms to allow the Windows Desktop Window Manager (DWM) to complete redrawing the unobstructed background desktop.
4. **Primary Monitor Capture:** The primary monitor is captured via Electron's `desktopCapturer.getSources({ types: ['screen'] })`.
5. **Foreground Window Scoping:** The Win32 active foreground window is inspected via PowerShell Win32 API bindings (`GetForegroundWindow`, `GetWindowRect`). If the active window is Unstuck itself or the desktop shell, the system preserves the previous valid target window.
6. **Crop & OCR:** The captured screen buffer is cropped to the target window boundaries (with boundary clamping to prevent out-of-bounds errors).
7. **Restore UI:** The Coach window and Overlay window are restored and focused.

---

## 3. Grounded Candidate Extraction & Coordinate Mathematics

Unstuck never allows the multimodal model to guess raw pixel coordinates or invent arbitrary click locations.

### Coordinate Spaces
1. **Normalized Space:** The model returns bounding box coordinates in a normalized `[0, 1000]` coordinate grid `[ymin, xmin, ymax, xmax]`.
2. **Physical Capture Space:** Raw device pixels of the screenshot buffer (`captureWidth`, `captureHeight`).
3. **Logical Display Space:** Windows logical coordinate space scaled by the OS DPI scale factor (typically 125% DPI on modern Windows displays).
4. **Overlay Space:** Coordinate system relative to the transparent overlay window.

### Mathematical Conversion Functions (`shared/coordinates.ts` & `shared/crop-geometry.ts`)

```typescript
// Normalized [0, 1000] -> Physical Capture Pixels
physicalX = (normX / 1000) * captureWidth;
physicalY = (normY / 1000) * captureHeight;

// Physical Capture Pixels -> Logical Display Pixels
logicalX = displayBounds.x + (physicalX / scaleFactor);
logicalY = displayBounds.y + (physicalY / scaleFactor);

// Logical Display Pixels -> Overlay Window Relative Pixels
overlayX = logicalX - overlayBounds.x;
overlayY = logicalY - overlayBounds.y;
```

Validation guards verify that:
* All normalized values fall strictly within `0 <= val <= 1000`.
* `xmin < xmax` and `ymin < ymax`.
* Normalized boxes have non-zero area and realistic aspect ratios.

---

## 4. Multimodal Model Reasoning & Contract Validation

Unstuck communicates with Google Gemini API using structured response schemas.

### Model Candidates
* **Default:** `gemini-3.1-flash-lite` (latency ~2.8s; provides optimal balance of speed and multimodal understanding).
* **Comparison Alternative:** `gemini-3.8-flash` (configurable via `GEMINI_MODEL`).

### Guidance States (`shared/contracts.ts`)
* `guide`: User made valid progress or is ready for the next action; return next instruction.
* `recover`: User deviated from the goal (e.g. selected Pie chart instead of Bar chart, or opened Format instead of Insert); return correction steps.
* `complete`: Visual evidence on screen proves the goal is fully accomplished; celebrate and mark task complete.
* `uncertain`: Controls cannot be identified with high confidence; prompt user to bring window into clear view without guessing.

---

## 5. Key Storage & Encryption Architecture

```
User enters key in Launch Modal
               │
               ▼
   IPC: save-api-key(key)
               │
               ▼
[electron/key-storage.ts]
   safeStorage.isEncryptionAvailable() ?
         ├── YES ──► safeStorage.encryptString(key)
         │                │
         │                ▼
         │           Write binary to:
         │           %APPDATA%\Unstuck\gemini_credential.enc
         │
         └── NO  ──► sessionKey in-memory (never plaintext to disk)
               │
               ▼
IPC returns { configured: true, maskedKey: "••••••••3aBc", source: "saved" }
```

* **Persistence:** DPAPI-encrypted ciphertext stored in `%APPDATA%\Unstuck\gemini_credential.enc`.
* **Zero Plaintext on Disk:** If DPAPI is not available on the OS session, keys are held in memory for that session only and never saved as plaintext.
* **Fallback:** For local CLI and headless development, `.env` files continue to be supported seamlessly without bundling `.env` into the production installer.

---

## 6. Portable Web Companion

In addition to the native Electron desktop application, Unstuck includes a portable Web Companion located in `server/` and `web/`:

* **Server (`server/server.ts`):** Lightweight Node.js HTTP server (built with native `node:http`) providing endpoints:
  * `GET /healthz`: Health check endpoint returning HTTP 200 and server status.
  * `GET /api/examples`: Clean Calc screenshot scenario fixtures.
  * `POST /api/check`: Multimodal analysis endpoint with request body validation and 5-second rate pacing.
  * `POST /api/session/reset`: Session state invalidation.
  * `POST /api/tutorial`: Optional YouTube tutorial URL parsing.
* **Frontend (`web/app.ts`):** Client application with drag-and-drop screenshot uploads, interactive scenario exploration, and canvas highlight overlay rendering.
* **Containerization (`Dockerfile`):** Multi-stage Docker build ready for self-hosting on Docker, Podman, or any container hosting platform.
