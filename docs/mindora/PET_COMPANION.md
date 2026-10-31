# MINDORA floating pet companion

## Interaction

The pet is a dedicated transparent, frameless, always-on-top capable Electron window, separate from the MINDORA dashboard. It stays visible while the dashboard is hidden if enabled and the user has chosen **Keep companion when dashboard closes**. Selecting Quit MINDORA exits the process and closes the pet.

- Click the character to open or focus the dashboard.
- Double-click the character to expand the companion and open Tasks.
- Drag the character or grip to move it. A movement threshold prevents drag from acting as a click; coordinates are clamped to connected display work areas and persisted.
- Use the floating bar for Chat, Voice, and More. Chat opens a compact input panel; More opens a native menu for pet selection, pause, settings and quit.
- Right-click the companion to open the same native menu.
- Hover reveals contextual status. Task and approval states come from actual application events.

## Chat and voice

Chat validates the prompt in the main process and starts the existing Gemini-planned agent task. The renderer receives a task identifier and sanitized summary/error; credentials and privileged APIs remain in the main process. Planning failures appear in the panel. Existing approval requirements continue to govern consequential tools.

Voice uses the explicit voice setting and the Chromium one-shot speech recognition API. It requests microphone permission only after a user click. Voice availability depends on the Windows Chromium speech runtime and system service. Voice can add a transcript to the MINDORA task input; the user reviews and starts it. Text-to-speech remains configurable and interruptible by starting another utterance.

## Characters and state

The bundled catalog contains MIKO (robotic fox), NOVA (space robot), PIXEL (robot cat), OLIVER (owl), and PIP (penguin), each with separate artwork and palette. CSS states include idle, listening, thinking, planning, researching, browsing, working, waiting, success, error/attention, paused, greeting, sleeping, waving, dancing and petting. Operational states are set from coaching/agent events, not random animation timers. Idle sleeping and hover/petting are presentation-only.

## Settings

Companion preferences include enabled state, character, size, saved position/display, topmost behavior, status bubbles, reduced or subtle animation, keep-running-on-close, and opt-in launch-at-login. Position, character, settings and task text are kept in separate persistence boundaries: pet settings contain preferences and placement only.

## Security and testing

The pet renderer uses context isolation, sandboxing, disabled Node integration, a local-page navigation lock and a narrow preload bridge. Main-process handlers validate sender window and request length. API credentials are never passed to the pet renderer. Unit coverage checks placement, monitor fallback, state mapping, lifecycle and secure bridge contracts. Native hit testing and visual behavior still require installed Windows QA.
