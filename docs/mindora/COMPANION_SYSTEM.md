# MINDORA Companion System

## Overview

The Electron desktop application owns the companion window and its preferences. The pet renderer is a separate transparent, frameless window with context isolation, sandboxing, and Node integration disabled. Its preload exposes only pet controls and narrowly scoped events. The public web companion has no pet window or desktop capture API.

Five original companion illustrations are available: MIKO (robotic fox), NOVA (space robot), PIXEL (robot cat), OLIVER (robotic owl), and PIP (penguin). Character choice, size, reduced motion, position, and always-on-top are stored in `miko-settings.json` under Electron userData. No task transcript, screenshot, OCR text, or credentials are stored in that file.

Companion states derive from real coaching and agent lifecycle events. Idle animation after ten seconds of OS inactivity only changes the visual state; it does not trigger a task or a device action. Pause, resume, and stop call the active agent or coaching controls.

## Voice

Voice is disabled by default. When enabled, the pet offers a user-triggered, one-shot speech input and system text-to-speech. Users can choose a BCP-47 language, installed voice, speaking rate, and volume. Speech input uses the Chromium Web Speech recognition implementation available in the packaged runtime. Depending on the Windows/Chromium configuration, recognition may be processed by an OS or Chromium speech service. MINDORA does not save audio or recognition transcripts. Transcribed text is placed in the task field and must be reviewed and started by the user; it is not submitted automatically. Microphone permission is granted only to the pet window for a short, explicitly armed request.

## Inactivity lock

The optional automatic device lock is Windows-only, disabled by default, and requires at least five minutes of OS-reported inactivity. A visible countdown of at least 30 seconds is shown first and can be cancelled. Disabling the feature clears a pending countdown. MINDORA does not lock the device when a coaching or agent task is active.
