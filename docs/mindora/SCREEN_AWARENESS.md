# Local Screen Awareness

Screen awareness is an optional desktop-only feature and is disabled by default. After explicit user opt-in, the Electron main process periodically captures the foreground screen and runs the existing Tesseract OCR engine locally. The activity classifier is deterministic and rule based; it does not send screenshots or OCR text to Gemini, TinyFish, the web companion, or a remote classifier.

Screenshots and OCR output exist only in memory for the current classification and are not persisted or logged. The UI receives only a category, a confidence score, generic evidence, a timestamp, and a status. Private/incognito indicators and sensitive-field terms suppress assistance suggestions. Users can pause or stop observation, configure the interval, and exclude process names. Exclusions are matched locally against the foreground process name.

Current limitations: screen observation is supported only on Windows, uses the active foreground window metadata and the display containing its bounds, and relies on OCR plus heuristic classification. The classifier is not a guarantee that all private or sensitive content will be detected. Users should keep observation disabled for applications or contexts they do not want captured. Existing user-initiated coaching capture remains separate and can send a capture to Gemini as part of that requested workflow.

The web application does not expose desktop capture or Electron IPC.
