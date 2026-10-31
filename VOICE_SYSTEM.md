# Voice System

Canonical privacy and implementation notes: [docs/mindora/VOICE_SYSTEM.md](docs/mindora/VOICE_SYSTEM.md).

The desktop companion has opt-in microphone access, visible listening state, start/stop controls, push-to-talk and continuous-listening preference, plus local system text-to-speech. Raw audio is not retained by MINDORA. Speech recognition is provided by Chromium and may use an external recognition service.

The complete Gemini voice-conversation loop, persistent conversation context, and verified hands-free end-of-speech behavior are not implemented. Do not treat voice as a completed two-way AI assistant.
