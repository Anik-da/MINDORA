# Companion Privacy Controls

- Local screen awareness, proactive suggestions, voice, and Windows inactivity locking are off by default.
- Screen observation can be explicitly enabled, paused, resumed, stopped, scheduled at 30/60/120 second intervals, and configured with excluded process names.
- OCR and classification remain local. Screenshots and recognized text are not saved, logged, or sent to Gemini/TinyFish by this feature.
- Private-window indicators and detected sensitive-field text suppress suggestions. Communication and media contexts do not generate proactive suggestions.
- Proactive suggestions are gated by an explicit preference, do-not-disturb, configurable quiet hours, category cooldown, excluded applications, and minimum classifier confidence. They only prefill a proposed task after the user accepts; they never execute it.
- Voice has an explicit setting and click-to-speak permission flow. Audio is not stored by MINDORA; Chromium speech recognition may use an external OS/browser service.
- Windows device locking requires a separate opt-in, a minimum five-minute idle delay, and a visible cancellable warning. It is disabled on other platforms and while tasks are active.
- Pet IPC does not expose filesystem, Node APIs, provider credentials, or arbitrary channels.

These controls reduce risk but cannot guarantee detection of every sensitive screen or prevent the OS/browser speech service from processing voice input. Keep observation and voice disabled whenever that processing is not appropriate.
