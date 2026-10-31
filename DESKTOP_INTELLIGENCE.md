# Desktop Intelligence: Current Architecture and Limits

Updated 2026-10-31. This document separates implemented observation from computer-control capabilities that are still missing.

## Observe

The native Electron main process owns desktop capture. A user starts a coaching task and asks for a check; MINDORA hides its launch/coach/overlay/MIKO windows, resolves the foreground window, captures the display containing that window, crops to its bounds, then restores its UI. Capture is event driven, not continuous. The launch disclosure says the active-window image and OCR text are sent to Gemini on user-requested desktop guidance.

If a MINDORA window itself has focus, Windows top-level windows are walked in Z order and the first visible, non-minimized external application window is chosen. The resolver no longer prefers LibreOffice simply because it is running or chooses a process by arbitrary process-list order. Named File Explorer folder windows are valid targets; the desktop shell is rejected. Foreground window title, process name, and bounds are included in the Gemini context.

Capture uses Electron display matching for the window bounds and requests only that display's screen source. A display-source mismatch fails closed rather than silently capturing a different monitor. OCR runs locally with Tesseract. Since OCR coordinates are local to the already-cropped image, the desktop-space window rectangle is not incorrectly reused to filter crop-local coordinates. Candidate boxes are mapped back to desktop coordinates for overlays.

## Understand and application detection

LibreOffice Calc-specific prompts and highlights are enabled only when the foreground title/process identifies Calc or an associated Chart Wizard. Excel, Writer, Explorer, browsers, code editors, and other apps do not become Calc because the task text contains “chart”, “spreadsheet”, “.xlsx”, or “.csv”. A fresh task requires an explicit goal; there is no prefilled chart task. The Calc benchmark remains an opt-in preset.

Gemini receives the cropped active-window screenshot, OCR candidates, observed process/title, current task, and recent guidance turns. A vision-capable Gemini model may reason about non-text UI in the image. The generic prompt asks it to ground claims in the image and return uncertainty when evidence is insufficient. The app does not currently expose a numeric application-classification confidence score, Windows UI Automation tree, or accessible-control inventory.

## Plan, act, verify

Desktop coaching currently behaves as **observe → Gemini guidance → user action → user-triggered re-observe**. The app does not inject local mouse or keyboard events and does not navigate folders or edit documents on the user's behalf. The task orchestrator can call desktop observation but pauses for user action; it is not a full autonomous desktop agent. TinyFish automation acts in a remote browser session and is not local Windows control.

The user can pause or stop the coaching session. Corrections are generated from the latest observed screenshot/context; MINDORA does not replay pre-recorded Calc corrections in its normal guidance prompt. Calc benchmark fixtures and deterministic mock UI remain for tests/demo only.

## Privacy and permissions

- Capture is initiated by a user action, not a background loop.
- The user-facing disclosure identifies that the active app image and OCR text are sent to configured Gemini during desktop guidance.
- Optional companion screen-awareness classification stays local and is separate from Gemini coaching.
- MINDORA UI is hidden during capture to avoid capturing itself.
- Screenshots and OCR text are not persisted by this capture path.
- Ordinary local desktop input automation is not implemented. Consequential external actions remain subject to the agent approval policy.

## Tests and known limitations

Unit tests cover File Explorer target validity, rejection of Excel/Explorer/Writer titles as Calc, application-agnostic prompts when task text mentions charts, Calc prompt preservation when Calc is explicitly observed, OCR coordinate mapping, and existing crop geometry. A live Windows resolver check detected the foreground Chrome window and, after explicitly activating a test File Explorer window, detected `explorer` with the folder title and valid bounds; neither was classified as Calc.

The full requested computer-use feature is **not complete**. No UI Automation control tree, click/typing/scrolling API, native application adapters, autonomous action execution, high/medium/low confidence UX, or real task acceptance test that navigates Explorer/Excel/Browser/VS Code has been delivered. The current Gemini key was unavailable for live vision tests, so model accuracy is not asserted. UI transitions must be manually performed and then re-observed. These limits are intentional in the current safe implementation and must not be marketed as autonomous computer control.
