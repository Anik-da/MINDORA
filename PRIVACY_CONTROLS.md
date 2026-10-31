# Privacy Controls

Canonical security review: [docs/mindora/PRIVACY_CONTROLS.md](docs/mindora/PRIVACY_CONTROLS.md) and [docs/mindora/SECURITY_REVIEW.md](docs/mindora/SECURITY_REVIEW.md).

- Electron renderers use isolated preload APIs; API credentials remain in trusted code.
- Gemini credentials entered in desktop settings use Electron `safeStorage` where available. TinyFish credentials must be configured through the process environment and must not be put in renderer code, URLs, browser storage or logs.
- Desktop screen awareness and microphone use are opt-in. Screen capture and OCR are local; voice audio is not recorded by MINDORA.
- Paid TinyFish operations require a native confirmation dialog. Search and Fetch requests use the Search/Fetch service APIs and are treated as the free services specified by the project brief.
- Conversation history and the full Gemini conversational service are not yet implemented. Do not infer account synchronization or cloud persistence.

Never commit real credentials. `.env` is in `.gitignore`; `.env.example` contains placeholders only.
