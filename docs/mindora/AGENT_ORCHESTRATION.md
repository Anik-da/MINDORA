# MINDORA Agent Orchestration

MINDORA's agent task path is an execution system, not a text-only chat endpoint. The launch window offers a separate **Plan & run** action while the existing screenshot coach remains available as before.

## Execution path

1. The Electron main process receives the task and creates an in-memory execution context plus a bounded local history record in MINDORA `userData`.
2. The Gemini planner receives the task and the registered tool catalog, then returns a structured plan. The planner validates tool IDs, input shape, dependencies, step count, and cycles before execution.
3. The orchestrator finds dependency-ready steps. Independent steps can run together; dependent inputs may reference a completed output with `$steps.<stepId>.<dot.path>`.
4. `AgentToolRegistry` executes only registered typed tools. Read tools can retry a bounded number of times. Write tools do not retry automatically.
5. The approval manager requires explicit user approval for all write-capability tools and for steps that appear to send messages, submit forms, purchase, publish, delete, change account settings, or take similar consequential actions.
6. Each tool step must return typed evidence. Tasks without evidence fail rather than reporting completion. Final UI results quote bounded tool output excerpts and identify evidence sources.
7. Task, step, approval, retry, evidence, and terminal events are sent to the launch renderer. Those same events map MIKO to planning, browsing/researching, executing, waiting, paused, success, or error.

## Current tools

- `tinyfish.search`: documented TinyFish Search API filters and result citations.
- `tinyfish.fetch`: documented TinyFish Fetch API URL extraction.
- `tinyfish.research`: async research start and polling, with citations/evidence from completed provider runs.
- `tinyfish.automation`: goal-based async Browser Agent runs. This tool is write-capable and always waits for approval. It never retries automatically, and it stops when CAPTCHA, MFA, or a security control requires human action.
- `desktop.observe`: user-triggered Gemini/OCR screenshot observation of the selected foreground application. It returns grounded guidance without mouse or keyboard control. When the screenshot does not verify completion, MINDORA pauses and waits for the user to follow the guidance; resuming requests another observation.

Gemini is the typed planning model and powers desktop observation. The existing manual desktop coach remains available alongside the central agent.

## State and controls

Task states are `created`, `planning`, `awaiting_approval`, `ready`, `running`, `waiting_for_tool`, `paused`, `completed`, `failed`, and `cancelled`. Pause takes effect at a safe step boundary; an active provider operation finishes before the task pauses. Cancellation aborts active requests, and the TinyFish adapter asks TinyFish to cancel an active automation run when possible. The UI exposes pause, resume, stop, approve, and decline controls. MIKO controls pause/resume/stop for the current agent task while one is active.

The last 100 task records are stored in `agent-task-history.json` with task inputs and raw tool outputs excluded from persisted step records. User text, logs, error text, and evidence metadata are redacted for common credential patterns. A task that was still active when MINDORA closed is restored as failed; it is never silently resumed.

## Security and limitations

- Gemini and TinyFish credentials stay in Electron's trusted main process. The renderer receives sanitized task snapshots without tool inputs or raw tool outputs.
- Tool access is allowlisted; model-generated code or arbitrary shell commands are never executed.
- Consequential actions cannot be approved implicitly by the model. Approval is a user action in the launch window.
- The agent does not solve or bypass CAPTCHA, MFA, paywalls, access controls, or site security checks.
- TinyFish Browser automation is goal-based and operates according to the provider's returned run status and evidence. A completed orchestration means planned tool steps finished; it does not prove an external side effect beyond the provider's actual returned result.
- MINDORA requires `GEMINI_API_KEY` through its existing secure key setup and `TINYFISH_API_KEY` in the Electron process environment to enable the agent task path.
- Task history is local to the current MINDORA installation. No cloud history or cross-device sync is added.
