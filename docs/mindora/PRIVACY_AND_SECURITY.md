# MINDORA privacy and security review

## Credential handling

- Gemini coaching credentials are stored using Electron `safeStorage` where available; otherwise they are session-only.
- Gemini planner and TinyFish keys are read by trusted process environment/main or server code. They are not bundled into the renderer or exposed through IPC results.
- Pet chat accepts task text only and calls the existing orchestrator in the Electron main process.
- TinyFish structured logs omit authorization data. Do not place real keys in source, issue text, or repository `.env` files.

## Electron boundaries

Pet, launch, coach and overlay windows use context isolation, sandboxing and `nodeIntegration: false`, local bundled pages, and deny popup navigation. Pet preload exposes specific methods rather than arbitrary IPC. Sensitive handlers validate the invoking `webContents`; task and prompt strings are length-limited and user-visible provider errors are sanitized.

## Screen and voice

Screen awareness is off by default and performs local foreground capture/OCR/classification at the configured interval. It does not save or upload those observations. Excluded apps, private-window detection, sensitive-field suppression, pause/stop and an indicator are available; detection cannot be perfect. User-triggered screen coaching does send the requested screenshot to Gemini. Voice is opt-in and uses a user-triggered one-shot microphone request; system speech services may process recognition. MINDORA does not persist audio.

## Agent safety

The agent requires approval before consequential external writes. CAPTCHA, MFA and site security controls are not bypassed. Desktop guidance does not synthesize mouse or keyboard input. A pet chat request starts a real agent task; completion is only reported from task results/evidence.

## Known risks and limits

- The web dashboard uses a shared access token and in-memory sessions, without tenant isolation or multi-instance task coordination.
- The default Windows installer is unsigned without configured signing credentials.
- Real provider limits, entitlements and failure behavior depend on the user's Gemini/TinyFish account.
- Screen classification can miss sensitive context; users should keep it off when the screen contains information they do not want observed.
- The reference video named in the product brief was not present as a readable attachment; only written requirements were used.
