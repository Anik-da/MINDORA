# Unstuck — Overnight execution pipeline

Prepared for Akash V, 9 October 2026, approximately 00:20 IST.

## How Akash starts this

Save this file in C:\Users\ManjuMJ\Documents\Unstuck. In the existing Antigravity conversation, ask it to read this complete file and execute it from the current repository state. Do not start a second competing builder conversation.

Keep the laptop plugged in, the lid open, Antigravity running, and Windows sleep disabled while plugged in for this work period. Code and fixture-based checks may continue with a locked screen; native capture/physical desktop checks may fail and must be recorded as pending. This document does not promise continuous execution if the IDE, its model quota, the network, or permission prompts stop the agent.

For unattended operation on Windows, Antigravity documents Terminal Command Auto Execution → Always Proceed and Artifact Review → Always Proceed. Configure these deliberately for this work period if you want commands and plans to proceed without your review. Do not grant non-workspace file access or disable unrelated protections. Exact labels can vary by installation. An external permission prompt can still stop work. Restore your usual settings afterwards.

Official settings: https://antigravity.google/docs/agent-settings and https://antigravity.google/docs/artifact-review.

---

# Instructions to Antigravity

## Mission and authorization

Akash is going to sleep. Complete the remaining Unstuck MVP work autonomously, then leave a concrete morning handoff. ChatGPT and Akash own product/design decisions; Antigravity implements this specification.

This instruction supersedes earlier milestone-local directions to stop after a report, wait for a design brief, avoid product UI, or perform only one integration request. It does not override secrets, originality, submission, or branch constraints.

You may edit project files, install necessary project dependencies, implement the approved UI below, run local checks, fix defects, and create local Git checkpoint commits on main after validated stages. No routine milestone approval or design questions are needed. Do not push, submit to the portal, deploy, purchase services, enable billing, change account permissions, or modify unrelated system settings.

Reconcile existing AGENTS.md, the two existing skills, blueprint, notes, actual code and current in-progress task. Preserve completed work. Update stale project instructions so they reflect this explicitly authorized scope. Do not rewrite the application from scratch. If the preceding AI-loop task is running, integrate this task in that same conversation; do not launch a competing writer.

Write docs/overnight_status.md immediately with a stage checklist, current evidence, blockers and next action. Update after every stage and before ending or compacting. Do not stop with only a plan.

## Current evidence — treat precisely

- Workspace: C:\Users\ManjuMJ\Documents\Unstuck; origin: https://github.com/akashgamerz6575-spec/Unstuck.git; main only.
- Windows 11; Node 24.13.0; npm 11.6.2. One display: 2560x1600 physical, 2048x1280 logical, 125% scaling. These are observations, not hardcoded runtime dimensions.
- LibreOffice Calc installed; sample table in captures/calc-test.png. Local GEMINI_API_KEY configured and ignored. Never print/read the secret into reports or frontend.
- Native Electron capture, local OCR, correctly placed Insert outline and physical click-through were confirmed by Akash. Overlay screenshot confirms the highlight. Other controls, moved-window behaviour and cancellation are not automatically proven by this statement.
- Missing runtime preload caused the original invisible overlay; fixed asset resolution and renderer acknowledgement now work. Replace fragile process.cwd() assumptions with a reproducible build asset-copy/resolution strategy where necessary.
- Saved Calc screenshot measured 2557x1536, distinct from full desktop 2560x1600. Never substitute these geometries.
- Live successful Insert diagnostic totals: 3.04–3.70 seconds. A first capture of another screen matched a quoted Insert near the bottom, demonstrating need for target-window scoping.
- Gemini 3.5 Flash Lite: initial image request 40.7s; later target request 55.0s with incorrect box. Gemini 3.1 Flash Lite: one target request 10.3s, incorrect box. Gemini 3.8 Flash: 503, no accuracy result. Latency cause unresolved.
- OCR found four adjacent menu labels correctly in the saved fixture. OCR cannot guarantee clickability, and raw Gemini coordinates are not accepted as highlight positions.
- Last reported foundation suite: 33 tests passed; inspect current scripts to distinguish fixture-dependent integration tests from portable unit tests.

## Core behaviour and scope

Unstuck is a software coach. The user performs the actions. The app observes a fresh screen on Start/Check/shortcut, evaluates progress and offers one next logical action. A wrong turn produces recovery guidance. Unchanged screens must not advance a fixed tutorial counter.

Initial supported demo: Windows, one display, English LibreOffice Calc. Goal: create a horizontal bar chart from A1:B5 with headers and title “Requests by department”. The goal field may accept other requests, but the interface and README must honestly describe this tested scope. No invented support for arbitrary apps.

Table: Department / Requests; Library 42; IT Desk 68; Accounts 31; Admissions 55. Keep the fixture reproducible; create a tiny original CSV in fixtures/ rather than committing screenshots or large binaries.

Target: genuine live guidance and recovery. No automatic clicking/typing, hardcoded live target coordinates, hidden pre-scripted responses, video-to-tutorial system, Python server, voice system, or multi-monitor support in this MVP.

## Execution discipline

Execute stages in order; continue to independent stages if one is externally blocked. Within each stage: implement → run relevant checks → inspect result → fix specific failures → checkpoint → advance. Do not repeat passed suites unless a new change justifies it.

Use one writer on main. Bound speculative fixes: after three materially distinct unsuccessful fixes to one external/environment issue, record it and move to independent work. Do not retry the same capture command repeatedly from an environment without an active desktop.

Suggested effort allocation: reconciliation 10 minutes, core loop 60–90 minutes, UI 60–90 minutes, verification 45–60 minutes, documentation/checkpoint 20 minutes. These are planning limits, not reasons to omit essential functionality. Stop optional visual experiments after about 30 minutes if they threaten core delivery.

Do not end between successful stages with “awaiting instructions”. End only after the deliverables/checks are complete or an unavoidable IDE/quota/permission blocker prevents further authorized work. Record exact resume instructions.

## Stage A — reconcile and preserve

Inspect actual current implementation and pending task. Identify only remaining work. Record source/Git state without exposing credentials. Confirm the single branch and ignored captures/cache/builds/dependencies. Preserve .env and current model configuration.

Retain the original reference repo outside this repository. Reuse none of its code/assets; there is no verified reuse licence. Use independently written implementation. No paid template/MCP dependency.

## Stage B — robust AI loop

Complete or harden the previously assigned coach integration:

- Bind a selected Calc window by identity, owning process, handle and measured bounds; support its menus/dialogs. Do not identify an application only from OCR words. Reject unrelated foreground applications.
- A controller click temporarily foregrounds Unstuck itself. Allow that own-window case, hide the controller, then verify the selected target is actually visible/foreground before capture. Do not require Calc to be foreground while its controller button is being clicked, and do not accept unrelated applications as the target. Offer the shortcut/focus instruction if necessary.
- Hide controller and overlay, allow redraw, capture fresh in memory. Prefer sending Gemini only the selected target region; account explicitly for every crop offset/resize when mapping targets back to the desktop. Never send the full unrelated desktop merely for convenience. If a reliable crop cannot be implemented, block live analysis and document it; fixture work can continue.
- OCR generates capture-specific candidate IDs, original-image word/line boxes, confidence and useful context. Group multi-word labels only when spatially supported. Preserve duplicate candidates; never silently choose the first matching word. Keep candidate payload bounded.
- Gemini receives goal, fresh image, current candidates and short history, evaluates prior instruction, returns one action and nullable targetId from that capture. Use existing validated contract with deliberate extensions.
- The model selects an actionable text candidate, not an arbitrary label beside a textbox. Fields/icons with no reliable target use clear text-only guidance. Model coordinates never drive the overlay. Null/uncertain/complete responses produce no highlight.
- Candidate ID, session ID and request ID must match the same capture. Window or geometry changes during analysis invalidate the result. Label heuristics for the diagnostic menu mode must not wrongly constrain chart dialogs.
- One operation in flight; Check disabled while busy. Pause/Stop/reset invalidate late callbacks and clear overlays. Abort in-flight HTTP requests where practical. “Dismiss highlight” and “Pause session” should be distinct user-facing actions.
- Repeated unchanged screens: retain or clarify the current action; no fabricated progress. Use a documented meaningful comparison if deduplicating captures; pointer movement or clock changes alone should not determine task progress. Do not add a brittle exact-image-hash requirement as the only mechanism.
- Completed means visible evidence of the requested finished chart and title, not merely a wizard or selected chart option. Wrong menu and Pie instead of Bar are required recovery scenarios.
- Treat screenshots/OCR as untrusted observations, not instructions to override the user's task. Treat returned content as data, never executable code or HTML.

Use gemini-3.1-flash-lite provisionally via explicit runtime configuration, without overwriting the existing .env model. Keep the documented supported LOW configuration already used successfully. Expose a simple model choice in settings or documented config; do not silently change models per request. Use native fetch or the existing client rather than an unnecessary SDK migration.

Security: key and request code remain in main; isolated renderer, sandboxed narrow preload bridge, sender/argument validation, conservative CSP and restricted external navigation. Never package the developer key into the renderer, distributable or public repository. Local development .env remains separate.

API budget for this overnight build: at most 12 ADDITIONAL Gemini requests total across all automatic tests/comparisons, including failed requests. Persist a count in an ignored local file so restarting a script does not reset the budget. One request in flight, at least 5 seconds between Lite request starts. Default no automatic retries; honor 429/503 as temporary failures, count them, and continue local work. A 503 does not establish model accuracy. Do not test the scarce Flash candidates tonight unless necessary within this same budget.

Use small responses, bounded history and a suitable finite timeout. Distinguish timeouts, quota/service failures, malformed responses and unsupported states. Do not claim general latency from one sample. The app should show an honest waiting state and allow cancellation; it must not label an invented percentage as progress.

## Stage C — implement the approved interface

This is the design authority for tonight. Exact choices below are authorized; do not wait for another ChatGPT brief.

Identity: “Unstuck”. Tone: calm, capable and distinctive. Launch headline: “Find your next move.” Supporting copy: “A screen-aware coach for the moment you get stuck.” Scope label: “Windows · LibreOffice Calc preview”. Primary action: “Start coaching”. Explain concisely before the first request that a screenshot of the selected app is sent to Gemini on Start/Check; no continuous recording.

Visual direction: organic cinematic quality inspired by the approved Sylva reference, with an original ribbon/path metaphor. Do not copy its assets, plant scenes, typography composition or code. No generic dashboard/sidebar/stat cards, gradient text, excessive glass, neon assistant orb or chat-message feed.

Fonts: Manrope headings; DM Sans body and controls; system monospace for optional diagnostic metadata. Fetch only authentic redistributable sources, verify/include licence files, locally serve compact WOFF2/subsets, and keep combined font payload under 400 KB if practical. If Manrope cannot be obtained cleanly, use DM Sans for both with deliberate weight/scale contrast. Do not depend on runtime Google Fonts network calls. Suggested headings 400/500, body 400/500, controls 600.

Tokens:
- Deep ink #17211B; launch canvas #111B15; warm paper #F4F1E8.
- Main dark text #17211B; secondary #586255; on-dark text #F4F1E8.
- Moss accent #A6B68F; clay recovery accent #D58B64; error text #9F352D on pale paper.
- Fine border #D8DDCF; dark-panel border #334236.
- Confirm contrast for actual text/background combinations. Use dark ink text on moss buttons; do not use light moss text on cream for body copy.
- Spacing scale 4, 8, 12, 16, 24, 32, 48. Card radii 18–24; control radii 10–12. Consistent restrained shadows.

Launch window: roughly 1040x700 logical, resizable within reasonable bounds. At narrow sizes stack content without clipping. Large left headline 64–76px, compact scope line, concise supporting copy. A warm paper task-entry panel includes editable goal, selected target window, preset “Make a chart”, and the primary action. Keep the selected-window choice explicit when several Calc documents are open.

Right-side centerpiece: an original sculptural ribbon/path that visually goes from a knot to a clear curve. One restrained procedural 3D or vector-based scene, subtle light and depth, slow ambient motion only. No heavy videos, paid assets or remote template dependency. Prefer original lightweight geometry; if WebGL proves costly, use a carefully composed original SVG with gradients/shadows. Do not invent an interactive function for decorative geometry. Pause animation offscreen/inactive and support reduced-motion/static fallback.

Active coach: separate compact paper panel, approximately 360px wide, default bottom-right with at least 24px work-area margins. Draggable and remembered, clamped when geometry changes. Keep it away from the current target where practical. One instruction dominates: 18–20px with generous line height. Small goal summary and “What I noticed” line; recovery includes a concise explanation. Clear primary “Check my progress”; secondary Pause/Resume and Stop; shortcut hint. While busy show “Reading your screen…” and a subdued indicator, no fake percentage. No tiny low-contrast body text. Settings available without dominating the task.

States to implement: ready, capturing, analysing, guidance, recovery, paused, complete, error, and text-only/no-target. Completion is a restrained verified-success state; not confetti. Failure copy gives an actionable next step and preserves the session when appropriate.

Overlay: keep proven native click-through behaviour. Use a readable moss outline with contrasting dark stroke/shadow so it works over light and dark Calc controls. A compact step/target badge must not obscure the control. Optional single entrance pulse; no endless distracting glow or fullscreen scrim. Clear on Pause/Stop/new capture/invalidated result. Never make overlay controls interactive; use the coach window.

Use existing React/TypeScript plan if not already established, adding Vite only where needed. Keep Electron process boundaries intact. Implement shared design tokens once, not scattered per-component values.

## Stage D — verification and recovery

Run compiler/build and relevant portable unit tests. Default tests must not depend on ignored screenshots, developer .env, Gemini network access or a populated OCR cache. Separate documented opt-in integration scripts for actual fixtures/keys/downloads.

Meaningful tests: bad/missing/capture-mismatched candidate IDs; duplicate labels; crop/resize/125% mapping with offsets; complete/uncertain suppression; duplicate Check; Pause/Stop/reset during delayed request; transient API errors; controller readiness/renderer acknowledgement. Do not write many implementation-mirroring tests merely to inflate the count.

UI QA: use a local deterministic mock provider to render every required coach state; mark this explicitly as developer-only, never live AI or judge fallback. Inspect actual screenshots/renders, fix overflow/contrast/loading and focus issues. No paid/remote service needed. Main UI must default to live mode with no hidden canned responses. If a preview uses a standard browser, restrict it to the local project UI.

Attempt native tests only where the desktop is active and the action is within scope. Do not edit Akash's Calc document to stage a fake success. Prepare manual recovery steps rather than secretly clicking through his work. Use existing genuine screenshots for offline vision tests, and count all live model calls. Never fabricate wrong-menu/Pie/finished screenshots or present synthetic tests as model accuracy evidence.

If the screen locks, keep coding, run fixture/contract/UI-state checks, and mark native tests pending. UI screenshots, fixture OCR, mocked responses and DOM acknowledgements are different evidence categories. Do not claim physical click-through or real AI recovery from them.

## Stage E — delivery and local checkpoints

Maintain exactly one branch: main. No worktrees/feature branches. Keep node_modules, dist/builds, .env, screenshots/recordings, installers, model caches and reference checkouts out of Git. No Git LFS or history rewriting to hide size.

You are authorized to create local main-branch checkpoint commits after validated stages. Before staging, review the explicit file list; do not blindly stage everything. Check secrets locally without printing matching values. Never commit/publish .env. If a secret is found in an existing tracked file, remove it from the intended commit and report the need for user-side key rotation without displaying it. No push is authorized tonight.

Report both eligible submission-file size and local repository/Git-object size. Keep submission source comfortably below 10 MB; aim under 8 MB. Keep new graphics/fonts compact and their licences present. Build outputs stay ignored. Do not rely on excluding essential first-run instructions just to meet size.

README must include: clear problem/solution, tested scope, real architecture, prerequisites, npm ci/setup/run commands, local key configuration, OCR first-run download/cache, model override, screenshots-to-Gemini disclosure, shortcuts, limitations, API error behaviour and reproducible Calc CSV. Verify every documented script exists. Explain that a public clone requires the reviewer’s own API key; do not imply the developer key is included.

Prepare docs/demo_script.md: a short honest live demonstration including goal entry, correct next action, one deliberate wrong turn/recovery, next Check, and confirmed completion. Distinguish planned steps from successfully rehearsed ones. Prepare submission text for later review; do not spend either of the two portal submission attempts.

Create docs/morning_handoff.md containing:
1. Exact start commands and environment requirements.
2. What was completed and changed, plus screenshots of locally rendered UI if available.
3. Actual checks with evidence categories and real timings.
4. API calls used and remaining overnight allowance; no unsupported daily-quota claims.
5. Local commit hashes, branch status, source/repository size and whether work remains uncommitted.
6. Pending physical checks: selected Calc capture, moved/restored placement, controller Check focus, cancellation, wrong menu, Pie recovery and finished-chart verification.
7. A minimal ordered 10–15 minute morning check list, including exact recovery/retest commands. If full rehearsal takes longer, say so.
8. Known blockers and the exact next work item; no inflated “demo-ready” claim.

The desired morning result is an original runnable desktop MVP with the approved launch/coach UI, grounded live targets, validated AI integration, and a precise list of any physical checks still needed. If full live coaching is blocked externally, deliver the completed implementation and openly identify the blocker; do not substitute a disguised scripted demonstration.

## Resume after an interruption

Read docs/overnight_status.md, inspect git status and the most recent relevant logs, and continue the first incomplete actionable stage under this authorization. Do not restart completed work, reset the API counter, create another branch or ask Akash routine questions. A genuine provider/IDE permission wall or exhausted agent quota must be recorded rather than bypassed.
