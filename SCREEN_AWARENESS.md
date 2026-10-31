# Screen Awareness

Canonical privacy and implementation notes: [docs/mindora/SCREEN_AWARENESS.md](docs/mindora/SCREEN_AWARENESS.md).

Desktop screen awareness is opt-in and uses local foreground-app capture/OCR classification with pause, stop, and excluded application settings. The current implementation does not send continuous screenshots to Gemini or TinyFish, and does not retain screenshots or recognized text.

Gemini-based screenshot interpretation, explicit screenshot preview before analysis, and observed-versus-assumed confidence presentation remain incomplete. MINDORA must report a capture or OCR failure instead of claiming screen understanding.
