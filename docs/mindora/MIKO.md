# MIKO floating companion

MIKO is an original MINDORA robotic fox, rendered in a standalone transparent Electron window. The bundled art is local; no browser or hosted UI is required. The pet window keeps context isolation, sandboxing, and Node integration disabled. Its preload exposes only the commands and state events required by the companion.

## Interaction

- A single click opens or focuses the MINDORA main window without closing MIKO.
- Dragging the mascot moves it; movement is clamped to the active monitor work area and its display ID and coordinates are saved in Electron userData.
- Mouse input passes through to desktop windows when the pointer is outside MIKO's visible interactive areas.
- Hover reveals short status and chat/voice actions. The status bubble stays visible for active work, approvals, and task outcomes. Idle mode has no permanent toolbar or control panel.
- Right-click opens native actions for opening MINDORA, chat, voice (when enabled), pet selection, pause/resume, settings, hiding the companion, and exiting.
- Hiding keeps the companion enabled; turning it back on from the launch settings restores its existing window. Disabling it closes the window. Quitting MINDORA closes the pet as part of application shutdown.

The five bundled characters have separate artwork and distinct idle motion accents. Four selectable mascots are inline SVG so their authored eyes, orbit, tail, ears, wings, flippers, and energy components can animate. A pet-only preload operation reads a fixed catalog asset; it cannot read arbitrary paths. State marks and animation changes are driven by task and voice events; they do not fabricate progress. The app can report planning, researching, browsing, listening, waiting, success, error, and paused states as the real workflow emits them. The current desktop coach is human guided: it does not click or type in other applications, and its `executing` state is not presented as an available computer-control capability.

## Chat and voice boundary

The hover and context-menu chat action opens MIKO's compact task composer. Submissions go through the validated Electron IPC handler to the existing agent orchestrator; they are task requests, not a persistent free-form Gemini conversation. Voice capture uses the configured browser speech-recognition runtime and sends the transcript to the same task workflow. Recognition, playback, microphone settings, or provider service can be unavailable; the companion reports those limitations instead of claiming success. No provider key is present in pet renderer code.

## Verification

`tests/miko-pet.unit.test.ts` covers display fallback/clamping, saved placement, state mapping, pet lifecycle, preference persistence, per-character asset availability, and the new hover/contextual-action layout contract. The Windows installer smoke test verifies that MIKO launches independently and remains alive after the main window is closed. Native drag, multi-monitor scaling, and input pass-through still require a physical multi-monitor desktop to verify comprehensively.
