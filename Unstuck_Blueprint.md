# Unstuck — build blueprint

Prepared 8 October 2026 for Prompt Wars. Version 1.4: environment report recorded, Calc selected, visual quality direction accepted; Antigravity builds. The live application has not been built or benchmarked yet.

## Working agreement and preparation status

Akash and ChatGPT decide the scope, architecture, fonts, colours, layouts, visuals, interactions, tool requirements, milestone prompts, demonstration procedure, and acceptance checks. ChatGPT researches and prepares the specifications; Akash supplies preferences and feedback. Antigravity implements those decisions, creates the specified project rules/skills, and runs the available checks. It can propose alternatives and surface constraints, but must not replace the agreed design or scope silently. The participant runs native desktop checks and supplies the observed results for review. Previous ChatGPT interface concepts are not approved references and must not become implementation instructions.

| Preparation item | Current status | Next concrete action |
| --- | --- | --- |
| Product and technical plan | Calc chart task selected for the first demonstration | Install Calc and confirm version/UI language |
| OS, display, Node, Git | Antigravity reports Windows 11, Node 24.13.0, npm 11.6.2, Git 2.54.0; one display at 125% | Validate actual Electron capture/display geometry in the technical proof |
| Antigravity customisation | IDE 2.5.5 / CLI 1.0.13 reported; project skills not created yet | Create and verify discovery in the cloned project |
| Gemini access | No key configured in the reported environment; account quota and live access unverified | Configure local key, inspect limits, run one image request |
| Demonstration fixture | Calc chart workflow selected; Calc not installed in the report | Make a small resettable sheet after installation |
| UI | Akash delegates design decisions to ChatGPT; cinematic, layered reference accepted as a quality target | Prepare typography, palette, composition, and motion specification; Antigravity implements it |
| Repository and submission | Correct cloned remote and main-only local/remote branches reported; public visibility, size, deadline unverified | Preserve main-only work and confirm portal instructions |

### Reported local baseline — 8 October, 22:18 IST

The following facts come from the participant's pasted Antigravity report; ChatGPT has not independently operated the laptop. Workspace: `C:\Users\ManjuMJ\Documents\Unstuck`; remote: `https://github.com/akashgamerz6575-spec/Unstuck.git`; main tracks origin/main. Git identity is configured. The blueprint is currently untracked. Windows 11 Home x64 build 26300; Node 24.13.0; npm 11.6.2; Git 2.54.0.windows.1; Antigravity IDE 2.5.5 and CLI 1.0.13. One display is reported at physical 2560×1600, logical bounds 2048×1280, working area 2048×1232, and 125% scale. Calc is not installed and the Gemini key is not configured.

Use this as a planning baseline. Electron must measure the runtime display bounds, scale factor, and actual screenshot dimensions; do not hardcode these numbers or confuse the working area with full-monitor capture bounds.

Preparation order: environment and account checks → project rules/skills → repeatable demo fixture → screen-to-target proof → guidance and recovery → implementation of our design brief → rehearsal and submission checks. Do not spend setup time collecting broad extension bundles.

Suggested fixture for the proposed Calc task: two columns, `Department` and `Requests`, with Library 42, IT Desk 68, Accounts 31, and Admissions 55. Goal: a horizontal bar chart titled `Requests by department`. Prepare a clean initial state and reset instructions. Test selecting Pie instead of Bar, plus opening the wrong menu. These are benchmark inputs, not a hardcoded action sequence; the coach must choose actions from fresh screenshots.

## 1. Product decision

**Pitch:** Unstuck helps beginners finish unfamiliar software tasks by observing their screen, pointing to the next action, and helping them recover when they take a wrong turn.

The first user is a student who knows the result they want but cannot find the relevant controls. The prototype must demonstrate a complete task in a real, independently installed application. Its distinguishing behaviour is recovery based on the current screen, rather than advancing through a fixed tutorial.

**Selected demonstration:** turn a small table into a labelled bar chart in LibreOffice Calc. Start with an existing local spreadsheet, select its data, open the chart tool, choose the requested type, and add a title. Deliberately select the wrong chart type during the demonstration; Unstuck should identify the mismatch and guide a correction. Confirm the exact chart terminology on the installed version before writing task instructions.

LibreOffice Calc is the selected first target and is not installed in the current environment report. Install it from the official LibreOffice download page, then record the Calc version and UI language. Prefer an already installed spreadsheet application only if the same task can be tested reliably. Do not build or substitute a fake spreadsheet and present that as third-party software support.

### Scope decisions

| Required for the first demonstration | Added only after the required features pass |
| --- | --- |
| One tested operating system and one monitor | Additional platforms and monitors |
| One supported application and one complete task | A second task or application |
| Start, Check, configurable shortcut, Pause, Stop | Automatic checking after screen changes |
| Real screenshots and model-generated target locations | Tutorial URL ingestion, voice, tutorial libraries |
| Visually grounded next-step guidance | Automatic mouse/keyboard control |
| Recovery from the wrong chart type and wrong menu | General recovery across arbitrary applications |
| Clear uncertainty, network, and quota states | Accounts, cloud session history, subscriptions |

**Confirmed planning scope from the reported environment:** Windows 11, one monitor, initially at 125% scaling. Runtime capture geometry still requires verification in Electron. Test the actual configuration and one additional supported scale setting if time permits.

### What we can claim

After testing, describe the exact task, application version, operating system, scaling configurations, and mistake cases that passed. Say that broader software support is future work. Do not claim universal screen understanding, automatic completion detection, or measured time savings without evidence.

## 2. Architecture and the screenshot loop

Use TypeScript throughout: Electron for desktop integration, React for the local interface, and a small Node/Electron-main service for Gemini calls. A separate Python backend is unnecessary for the initial version. Keep the model name configurable and select a currently available image-capable model after checking the account's quota and the first benchmark.

| Module | Responsibility |
| --- | --- |
| Electron main process | Window lifecycle, capture, display geometry, shortcut, API key access, request management |
| Narrow preload bridge | Validated messages for Start, Check, Pause, Stop, and status updates |
| React coach panel | Goal entry, one instruction, optional explanation, progress milestones, recovery and error states |
| Transparent overlay window | Draw an actual model-grounded highlight; pass clicks through to the target application |
| Gemini client | Send screenshot plus compact session state; validate structured responses; record usage and timings |
| Session controller | Preserve the goal, last instruction, expected outcome, observations, and request/session identity |

Electron documents desktop capture and passing mouse events through a window: [desktopCapturer](https://www.electronjs.org/docs/latest/api/desktop-capturer) and [BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window).

### Each user check

1. Check that a session and capture source are active. Disable duplicate Check requests while one is running.
2. Remove the previous highlight. Hide the coach and overlay, then allow the desktop to redraw before capturing. Verify during setup that neither window appears in the image.
3. Capture the selected monitor at sufficient detail to read controls. Keep capture bytes in memory by default. The interface must clearly indicate that checking sends the screenshot to Gemini.
4. Send the current image, goal, previous instruction, expected visible result, and a short observation summary. Do not resend the complete image history.
5. Ask Gemini to assess the previous result and propose exactly one next action. If it cannot locate a control, return uncertainty rather than guessed coordinates.
6. Validate the output, confirm the response belongs to the current session/request, map its bounding box to the overlay, and display the coach.
7. The user performs the action and presses Check, or the equivalent configurable shortcut.

Start performs the first capture. Check performs subsequent captures. A shortcut is convenience, not an OS screenshot-and-upload workflow. Pause/Stop must be available even during a slow request. Stop invalidates outstanding results and clears the highlight.

### Session and response contract

Track `goal`, `supportedApplication`, `lastInstruction`, `expectedOutcome`, `observationSummary`, `sessionId`, and monotonically increasing `requestId`. Record metrics separately from product-facing instructions.

Illustrative response shape; its fields describe our proposed contract, not an existing Gemini response format:

```json
{
  "assessment": "not_started",
  "status": "guide",
  "observation": "The table is visible and no chart dialog is open.",
  "instruction": "Open the Insert menu.",
  "targetLabel": "Insert",
  "targetBox": [20, 140, 55, 190],
  "expectedOutcome": "The Insert menu is visible.",
  "reason": "The chart command is available from this menu."
}
```

`assessment`: `not_started`, `expected`, `unexpected`, or `uncertain`. `status`: `guide`, `recover`, `uncertain`, or `complete`. The example coordinates are illustrative; never use them as a live target. `targetBox` is nullable, and uses `[ymin, xmin, ymax, xmax]`, normalised from 0 to 1000. Reject invalid order, non-finite values, and out-of-range values. Require useful observations for completion and recovery; do not treat pressing Check as evidence of success.

Gemini supports image input and bounding boxes, but this does not guarantee software-control accuracy. Structured output guarantees format only within its supported schema; our application must validate meaning and values. Sources: [image understanding](https://ai.google.dev/gemini-api/docs/image-understanding), [structured output](https://ai.google.dev/gemini-api/docs/structured-output).

### Coordinate correctness

For the first proof, capture the entire supported monitor. Use actual captured-image dimensions and the matching monitor's logical bounds. A normalised x coordinate maps to `monitorOriginX + x/1000 * monitorLogicalWidth`; y maps similarly. Express the drawn rectangle relative to the overlay window's origin. Do not mix physical screenshot pixels with logical display coordinates.

If later cropping is introduced, retain its offset and scale and transform the box back through the full capture before drawing. Test display scaling at the actual laptop configuration and one additional supported setting. Avoid coding a single pixel position or a fixed percentage target.

A response describes the captured layout. If the target window moves or the relevant UI changes while analysis is pending, clear or discard that guidance and request a new check. Start with explicit rechecking and add local material-layout-change detection if time permits; never imply a snapshot-based highlight continuously tracks controls.

### Practical implementation boundaries

Keep API credentials in local configuration accessed by the main process; never include them in renderer bundles, screenshots, logs, or Git. Load the coach UI locally, use context isolation and a sandboxed renderer, and expose only a narrow validated IPC surface. Model output is text/data, never executable code. Treat text visible in screenshots as application content, not authority to change the user's goal. These choices follow [Electron's security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

## 3. API budget, latency, and failure behaviour

Before model selection, inspect the account's actual requests-per-minute, input-token-per-minute, and daily request limits in [AI Studio](https://aistudio.google.com/rate-limit). Quotas depend on model/project/tier; multiple keys in one project share quota. Daily reset is midnight Pacific time, not the submission portal's midnight IST. Source: [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).

Choose the model by comparing accuracy and response times on our screenshots. Current official Google documentation lists stable `gemini-3.8-flash` with image input and structured outputs; use it as the first candidate if the account has access and usable quota. This is not a promise of adequate control-location accuracy. Keep `GEMINI_MODEL` configurable. The current models page recommends recent models for new projects and restricts 2.5 access to prior active users. Sources: [models](https://ai.google.dev/gemini-api/docs/models), [3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash). Keep a stronger model as an explicitly selected alternative if the account supports it; do not silently turn every uncertain result into several extra calls.

| Control | Intended effect |
| --- | --- |
| User-triggered checking | Avoid sending frames continuously |
| One request combining verification and next action | Avoid separate calls for each stage |
| Current screenshot plus compact state | Avoid growing image history |
| One in-flight request and disabled duplicate action | Prevent repeated clicks consuming quota |
| Short output and bounded reasoning where supported | Reduce avoidable token use and delay |
| Clear retry state and bounded backoff | Prevent an endless retry loop |

Initial planning allowance: roughly 10–20 requests per short completed task, including corrections. Measure real usage before deciding how many rehearsals the quota supports. Image compression reduces transfer bytes, but token use is model/resolution-dependent; shrinking UI text until it is unreadable is counterproductive.

Record request count, actual input/output token usage when reported, elapsed time, errors, and outcome. Log no API keys or screenshot bytes. Reserve quota for at least three live demonstrations after development. If the daily allowance is too small, discuss normal paid access or organiser-provided credits before relying on the demo; do not assume credits exist.

Calculate cost from the chosen model's current [pricing](https://ai.google.dev/gemini-api/docs/pricing) and actual measured usage. Earlier 2.5 Flash examples are not a budget for the current model. Confirm whether free access exists for the selected account/model; do not infer it from a successful request.

Failure UI must preserve the task: uncertain target → ask the user to expose the relevant menu or rescan; 429 → pause and explain when retrying is possible; timeout/offline → show Retry without advancing; stale response → discard it; Stop → hide guidance immediately. Completion should require visible evidence of the requested chart type and title. If the screen cannot establish the result, ask the user to show the chart rather than declaring success.

## 4. Design brief for Antigravity

**Ownership:** Akash and ChatGPT make the UI design decisions and prepare the specification. Antigravity translates that specification into the working application. ChatGPT reviews implementation against the brief and Akash provides feedback. No palette, font pair, token system, layout, mascot, or animation from the previous assistant concepts is approved or required.

**Opinion:** a distinctive interface is worthwhile because visible guidance is central to Unstuck. Distinctiveness should come from a coherent identity and useful interactions. Akash and ChatGPT will establish the visual language, including typography, palette, spacing, composition, and motion. Antigravity can report implementation constraints and propose refinements; the agreed brief remains authoritative. Visual planning can proceed alongside technical preparation, while expensive implementation polish waits for the capture proof.

### Accepted visual quality direction

Akash supplied a 24.768-second video showing an olive/cream, asymmetric landing composition with large light sans-serif headings, rounded inset-image cards, sculptural moss-covered forms, drifting particles, butterflies, and glowing hover details. ChatGPT inspected sampled frames. The video exposes a ThreeUI demo URL; ThreeUI's catalogue describes `Sylva — Living Green` with matching botanical scene elements. The exact linked demo and source/font CSS were not accessible in the research tool, so the font and implementation details are unverified.

Akash accepts this as a quality target and delegates design choices to ChatGPT. Use its expressive typography, layering, material treatment, and controlled motion as inspiration. The final palette and fonts remain to be specified by ChatGPT. Plan an expressive launch screen and a matching compact, readable floating coach. A resolving tangle/path is one proposed product-related centrepiece, not a settled asset requirement. Antigravity builds the resulting brief; it should not independently choose a replacement identity. Keep richer effects within the repository budget, measure performance, and retain a static/reduced-motion fallback.

Reference catalogue: https://threeui.com/. Its MCP page describes Pro membership access; no paid membership, connector, or source-asset licence has been verified or installed for this project.

### Reference observations and limits

The supplied Ghost Guide frames show a processing state, a small persistent controller, and an instruction bubble near a target inside Figma. They are useful references for separating interaction controls from local guidance. They do not establish dynamic targeting accuracy or automatic progress verification. We inspected supplied frames; we have not watched the linked video successfully.

The processing frame labels video analysis, transcript parsing, web search, and checkpoint creation. Unstuck's initial version does not implement that video pipeline. Its processing messages must describe actual work, such as capturing the screen or checking the current step. Do not copy unsupported stages as decorative progress.

### Behavioural requirements

| Surface or state | Required behaviour | Design decisions for Akash and ChatGPT |
| --- | --- | --- |
| Start | Explain the supported task, accept a goal, select the supported screen, explain screenshot transmission | Layout, branding, typography, composition |
| Persistent controller | Show the current instruction and Check, Pause, Stop; stay usable over the target app | Shape, placement, visual hierarchy |
| Target guidance | Identify a detected control; pass clicks through; clear during checking; avoid covering useful content | Outline/bracket style, bubble treatment, motion |
| Recovery | Explain the observed mistake and one correction while preserving the goal | Visual emphasis and concise copy |
| Uncertain/error | No guessed highlight; offer a useful rescan or retry; do not advance | State presentation |
| Complete | Recap evidence of the requested result and offer End session | Completion treatment |

Judge the resulting design on legibility at actual laptop scaling and projector conditions, keyboard access, consistent identity, useful state changes, and whether the controls obscure the application. Respect reduced motion and avoid colour-only status. Display verified milestones only; do not invent a percentage or fixed total when recovery can change the path. Keep internal coordinates, token counts, and diagnostic confidence in a development view.

We will supply approved design tokens and reference guidance before the product UI milestone. Antigravity should document and implement those tokens in the actual project. Keep assets and font licences within the repository budget; demo typography should have a local fallback. Final review must use real application screenshots rather than a scripted interface concept.

### Ghost Guide repository: reference inspection before implementation

Reference: https://github.com/ezpedersen/lahacks2025/

Give Antigravity the URL for read-only inspection. Keep any reference checkout outside the new submission repository. Do not import its Git history or assume its demo frames prove the current source's behaviour. This reference stage is analysis only, not a request to build.

Copy-ready inspection instruction:

```text
Inspect the Ghost Guide repository at https://github.com/ezpedersen/lahacks2025/ as a reference for Unstuck. Do not change or build our application yet. Akash and ChatGPT direct product, engineering, and visual design; your role is analysis now and implementation later.

Trace capture, shortcuts, Electron windows, screenshot-to-model requests, target-coordinate flow, checkpoint/session state, and failure handling. Distinguish source code evidence from README or demo claims. Specifically check whether model-returned target coordinates actually reach the rendered marker or whether placement is fixed. Identify old model names and platform assumptions.

Return a concise reference report: useful patterns, weaknesses, what we should implement differently, and a file-path-based explanation of the important flows. Inspect the repository's licence and any asset-specific licences; report what you find without assuming public visibility permits reuse. No reference licence has been verified in our preparation so far.

Our submission should have its own architecture implementation, UI identity, assets, prompts, and recovery/verification behaviour. Do not lift source or assets during this inspection. If a small existing component would help later, identify it, its licence requirements, and the applicable competition rule before proposing reuse. Record actual reuse and required attribution transparently; renaming or recolouring another implementation is not evidence of original work. Keep reference code and history outside the submission repo.
```

The supplied organiser instructions specify repository and submission mechanics, but do not establish their policy on pre-existing code. Confirm that policy from official competition instructions before incorporating reference code. This does not block learning from architectural ideas and building our own implementation.

## 5. Roadmap with gates

These are focused-work estimates, not a guarantee. Plan approximately 6–8 hours including debugging and buffer. The portal opens at 00:00 IST on 9 October; the submission deadline and evaluation instructions are still unknown. Midnight is not treated as the deadline. Tonight's priority is a working technical proof, followed by the simplest complete task if time permits. Recheck official portal instructions when it opens, and adjust the remaining work to the actual deadline.

| Phase | Estimate | Deliverable | Gate before continuing |
| --- | --- | --- | --- |
| Setup | 15–25 min | Public repo cloned inside Antigravity; OS/app/display details; working Gemini request | Account/model access and quota confirmed |
| Screen-to-target proof | 45–60 min | Screenshot → Gemini box → real click-through highlight | Core controls located correctly in 10 chosen visible states, including moved/resized layouts |
| Guidance loop | 60–90 min | Start, Check, state memory, validated results, Stop | Fresh screenshots drive next instructions; stale/error results do not advance |
| Complete task + recovery | 45–60 min | Chart creation and two deliberate deviations | Three consecutive complete runs, including recovery |
| Product UI | 45–60 min | Start surface, branded coach, target, recovery, uncertainty | Readable on the target display; no blocked controls |
| Reproducibility | 30–45 min | README, setup commands, local config example, small public repo | Fresh clone installs and runs with documented prerequisites |
| Rehearsal | 20–30 min | Live demo, backup recording, measured results | Task works from a reset initial state with enough quota remaining |

For the first benchmark, record each target's correctness and box alignment. Aim for 10/10 on the deliberately restricted core cases, not a claim of 100% general accuracy. Record median and slowest response times; initial UX targets are median under 6 seconds and no response above 12 seconds in the small test. These are proposed gates, not observed performance or statistically meaningful service guarantees.

### Decision if the proof fails

If the model repeatedly misses core targets, spend one bounded correction pass on image quality, the prompt/schema, and coordinate transforms. Distinguish localisation error from overlay scaling error. If that still fails, narrow the supported workflow/interface before adding features. A browser-only version with inspectable element geometry is a possible revised scope and must be described as such. Do not conceal inaccurate guidance with hardcoded demonstration coordinates.

If latency is poor but locations are correct, compare another available model or simplify context. If no dependable live API access is available, do not call the app demo-ready. A clearly labelled recording can back up an already working demonstration; it cannot establish live functionality.

## 6. Antigravity customisation

The friend's suggestion is valid. Customisations improve the development agent's instructions and tools; they do not train a new model or increase Unstuck's Gemini quota.

Current official docs describe skills as folders containing `SKILL.md`, project rules, and MCP integrations. Workspace skills now default to `.agents/skills/<name>/SKILL.md`; `.agent/skills` remains backward compatible. Check the installed Antigravity surface/version and confirm discovery in its Customizations panel. Sources: [skills](https://antigravity.google/docs/skills), [rules](https://antigravity.google/docs/rules/).

### Recommended setup for this project

| Customisation | What to put in it | Why it helps |
| --- | --- | --- |
| Project rules in `AGENTS.md` | Scope, main-only Git, repo budget, secret handling, design ownership and behavioural requirements, no fixed live targets, required checks | Keep critical constraints present during development |
| `unstuck-interface` skill | Design brief, required states, reference limits, keyboard access, screenshot review, panel/target collision checks; implement and maintain the design tokens agreed by Akash and ChatGPT | Produce a coherent interface across edits |
| `unstuck-screen-guidance` skill | Capture geometry, response schema, request identity, uncertain/error behaviour, benchmark and recovery procedure | Keep the difficult desktop loop consistent |
| Formatter/linter editor support, if available | Prefer the actual project's configured formatter and TypeScript/lint commands; verify extension availability in this editor | Reduce routine editing mistakes |
| Figma MCP, optional | Use only if there is a real reference frame and existing access | Let the agent inspect concrete design context |

The skill specifications above are planned customisations, not installed skills. Create them inside the actual cloned project in Antigravity. Their `description` should say precisely when each applies. Keep them short; put the longer design specification and benchmark in referenced project documents. Confirm the agent can identify and use them before assuming they are active.

Official docs list Figma Dev Mode MCP and Chrome DevTools among integrations: [MCP](https://antigravity.google/docs/mcp/). Marketplace plugins can bundle skills, rules, and tools; its documented installation interface is available in Antigravity 2.0 and CLI: [Marketplace](https://antigravity.google/docs/marketplace/). This is distinct from editor extensions, whose availability/compatibility must be checked in the installed editor. We have not verified a particular third-party UI skill or extension bundle for this project.

Use the two project skills and rules first. Add a connector only when it supplies something we actually need. Keep editor customisation to about 15 minutes during setup. Current docs announce legacy workflows will stop working on 19 October 2026; new reusable guidance should use skills: [migration guidance](https://antigravity.google/docs/migration/workflows-to-skills).

### Development loop

Give Antigravity one milestone at a time. Ask it to inspect current official API/library docs, implement the milestone, run the relevant checks, and report what works and what remains uncertain. Review real screenshots and metrics before issuing the next prompt. Keep a short progress document and regular commits on `main`; do not branch for separate phases. Prompts and their meaningful revisions can be kept in a small development log to explain the prompt engineering if organisers ask.

## 7. Copy-ready first Antigravity prompt

Paste this only after the new public repository has been cloned inside Antigravity. The prompt deliberately implements the technical proof before the complete product.

```text
We are building Unstuck for Prompt Wars: a desktop coach that observes a user's screen, guides one next action, and later verifies progress and recovers from mistakes. Read the supplied Unstuck blueprint. Implement only the screen-to-target technical proof in this turn.

First inspect this cloned repository and the local environment. Record OS, Node/Git versions, monitor geometry/scaling, Antigravity version/surface, the installed target application, and Gemini model availability/quota information available to us. Do not expose credentials. The latest reported environment is Windows 11, one monitor at 125% scaling, with LibreOffice Calc selected but pending installation; verify runtime measurements and report mismatches before proceeding. Use current official Electron/Gemini documentation rather than old model names from Ghost Guide.

Use Electron, React, TypeScript, and a small main-process Gemini client. Keep the renderer isolated and expose narrow validated preload messages. Read GEMINI_API_KEY from local configuration in the main process only. Include .env.example placeholders and ignore local credentials, dependencies, captures, installers, and build output.

Create concise project rules and two focused workspace skills: unstuck-interface and unstuck-screen-guidance. Use the installed Antigravity version's supported discovery location, following current official docs, and verify that the agent recognises them. Derive their instructions from the blueprint. Keep the repository on its sole main branch.

The proof must let me press Check to capture the supported monitor, with our UI hidden, then send the screenshot and one target instruction to Gemini. Validate a nullable normalised bounding box and draw it as a click-through overlay on the actual control. Use captured-image dimensions and the correct display's logical bounds. No hardcoded live coordinates. A separate small interactive panel must offer Check and Stop and show checking, uncertainty, and failure states. Handle duplicate requests and discard results after Stop or session changes.

Akash and ChatGPT own product, architecture, and visual design decisions; you are the builder. Follow the supplied specifications. Fonts, colours, and layouts are pending our separate design brief; do not treat earlier rejected concepts as approved. Keep this technical proof's controls legible and small. Report constraints or proposed changes rather than silently replacing our decisions. Do not add accounts, tutorial ingestion, voice, auto-clicking, or continuous Gemini polling.

Add meaningful checks for coordinate conversion and invalid model responses. Give me the exact local run steps and a manual benchmark procedure for 10 target states, including moving/resizing the target application and display scaling. Record correctness, elapsed time, and actual token usage when available. Distinguish real API results from any labelled test fixtures. If you cannot run native capture here, say so and give the exact manual check; do not claim it passed.

Finish with changed files, checks actually run, remaining blockers, and the next milestone. Do not submit the repository or create another branch.
```

### Follow-up milestone prompts

**Guidance loop:** use the real capture/overlay proof; implement session memory, validated assessment and next action in one request, Start/Check/Pause/Stop, uncertainty, stale-response handling, and bounded retry states. Verify next actions follow fresh screenshots.

**Task and recovery:** use the tested installed application; complete the chart goal; implement corrections for wrong menu and wrong chart type. Run from a reset state three times, record observed results, and never advance solely because Check was pressed.

**UI and demonstration:** implement the fonts, colours, layouts, visuals, tokens, and interactions in the design specification supplied by Akash and ChatGPT; implement all required states; review real screenshots at the laptop's scaling; verify keyboard access and that the coach does not cover its target. Finish README, measured limitations, small-repo checks, and the live demonstration script.

## 8. Repository and submission requirements

The following rules come from the user-supplied organiser instructions; we have not independently checked the portal's final instructions yet:

- Use Antigravity to clone, prompt/code, and push the project.
- Use a public GitHub repository with exactly one branch.
- Keep the repository below 10 MB.
- Maximum two submission attempts.
- Submit the public repository link through the portal when ready.

Aim for tracked source/assets comfortably below 5 MB to leave room. Include a lockfile, source, concise docs, configuration example, and necessary font licences. Exclude `node_modules`, build/release output, installers, local keys, screenshots, recordings, and model files. Repository history also matters: use text-only commits where possible, and do not assume deleting a previously committed large file removes it from history. Confirm whether the portal measures source/archive size or repository storage; this definition is currently unknown.

Before using a submission attempt, verify that the remote has only `main`, the public URL works signed out, the latest commit is pushed, a clean clone can run from README instructions, and no credentials are tracked. Recheck portal-required metadata, deadline, evaluation environment, and whether judges are expected to supply a Gemini key. Do not put a working key in the public repository to make evaluation convenient.

Suggested project layout, to be created by Antigravity: `electron/` for main/preload/capture/client, `src/` for panel and overlay, `shared/` for schemas and coordinate utilities, `tests/` for meaningful validation, `docs/` for benchmark/progress/design notes, plus `.agents/skills/`, `AGENTS.md`, README, package/lock files, and a configuration example.

## 9. Judge demonstration and readiness

### Three-minute proposed sequence

| Time | Show |
| --- | --- |
| 0:00–0:25 | State the beginner's problem and the exact supported task |
| 0:25–1:15 | Start the real session; demonstrate one grounded highlight and successful check |
| 1:15–2:05 | Deliberately choose the wrong chart type; let a fresh screen check drive the correction |
| 2:05–2:35 | Show the actual completed chart and its title |
| 2:35–3:00 | Explain screenshot checkpoints, prompt/schema design, measured results, and current scope |

Rehearse timings; the actual task may require a shorter demonstration segment or a longer slot. The proposed times are not a claim that current functionality is available. Record a backup of the real working prototype and keep it outside the repository. Label playback explicitly if used.

### Ready means

- The UI launches and captures the correct screen without capturing its own coach.
- Real model output places highlights accurately in the supported cases.
- Three complete runs succeed from the reset starting state, including deliberate recovery.
- Uncertainty, 429, offline/timeout, Stop, and stale response do not falsely advance or complete the task.
- Timing and request usage are recorded; sufficient quota remains for demonstration.
- README setup works from a fresh clone, with documented OS/application and API-key prerequisites.
- Public repo, branch, size, and portal instructions pass before submission.

No blueprint can remove uncertainty before a prototype is tested. This plan is ready to execute because it names the uncertain parts, tests them early, and defines how to narrow scope if they fail.
