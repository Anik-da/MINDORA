# MINDORA floating companion experience

## Design goal

MIKO should feel like a small desktop companion that happens to be useful, rather than a miniature dashboard. The transparent Electron window centers the selected mascot, hides routine actions until hover, and reserves the task bubble for real status and contextual guidance. The native context menu carries less frequent actions.

## Interaction map

| Gesture | Result |
| --- | --- |
| Click the mascot | Bring the MINDORA main window forward; keep MIKO open |
| Drag the mascot | Move it across the desktop and between attached displays |
| Hover | Reveal a short state bubble and transient chat/voice buttons |
| Right-click | Open chat/voice, task controls, pet selection, settings, hide, and exit actions |
| Double-click | Open the existing Tasks view |

Mouse input is ignored outside visible interactive controls so MIKO does not cover ordinary desktop clicks. The main process clamps position to the monitor work area, persists coordinates plus display ID, and falls back to the primary display if a saved display disconnects. The app restores MIKO when enabled from settings, preserves it while the dashboard is hidden, and closes it during application shutdown.

## Truthful character states

The character art and accent motion are bundled in the app. Idle motion varies by character. State marks communicate real events: listening/voice capture, thinking/planning, browsing/researching, execution events when an actual workflow emits them, waiting, success, errors, and paused work. Reduced-motion and subtle-animation settings are honored. No progress is randomly generated.

MIKO chat currently submits a task to the agent orchestrator. It is not a persistent conversational Gemini client. Voice recognition transcribes a request and routes it to that same workflow; it is not an independent always-listening assistant. Screen awareness remains under the desktop app's explicit permission and capture flow. MINDORA currently does not control the mouse/keyboard in other applications, so it must not represent a screen observation or recommendation as an executed action.

## Animation and asset architecture

MIKO's original high-resolution transparent PNG remains the default fox art. NOVA, PIXEL, OLIVER, and PIP are original bundled SVG designs with articulated orbital ring, tail/ears, wings, and flippers. The pet renderer does not get filesystem access: its preload exposes a single catalog-based SVG request, and the main process reads only a validated asset for one of the four vector characters. The renderer parses that trusted vector and inserts it into its own document so CSS can animate the built-in parts. It has no generic path read, Node integration, API key, or provider access. All SVG state changes inherit the real state on the pet shell; reduced-motion preferences stop those animations.

Character anatomy now provides breathing/idle motion, blinking and gaze movement, attentive/thinking/research/working expressions, voice/core pulses, greeting, success, error, and paused cues. MIKO is a raster mascot, so its distinct blinking and event marks are overlays while body motion and expression cues remain CSS driven; it does not yet have rigged limbs or a full frame-by-frame animation set.

## Quality checks

- `tests/miko-pet.unit.test.ts`: state mapping, persisted settings, monitor fallback/clamping, lifecycle, contextual layout contract, and strict catalog-based SVG loading.
- `npm run typecheck`, `npm test`, `npm run test:integration`, and `npm run build:win`: source checks plus the packaged NSIS build.
- `scripts/smoke-test-windows-installer.ps1`: installed launch, Start Menu shortcut, independent MIKO window, main-window close, clean exit, uninstall, and user-data preservation.

The automated suite cannot establish visual quality, pointer pass-through, scaling behavior, or accurate drag feel on every Windows DPI and multi-monitor layout. Those acceptance checks remain a physical desktop QA item.

## Current verification

On 2026-10-31, source typecheck passed; 172 unit tests and 7 integration tests passed; and the x64 NSIS installer was produced at `dist/MINDORA-Setup-x64.exe` (129,356,379 bytes; SHA-256 `e8beba40346f4f491555db5e078f7781e563233f91ba95819cc3b770f44b13ca`). The installer smoke test passed install, Start Menu shortcut, launch, independent MIKO window, main-window close with MIKO still visible, clean quit, uninstall, and user-data preservation. The live Gemini call was skipped because no Gemini key was configured. The installed MIKO surface was occluded in the desktop capture by the Codex companion overlay, so appearance, actual drag, and context-menu pointer interaction in the packaged window could not be safely confirmed. Multiple physical displays and alternate DPI scales were not available for verification.
