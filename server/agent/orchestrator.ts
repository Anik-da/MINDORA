import { ApprovalManager, ApprovalRequest } from './approval-manager.js';
import { AgentEventBus } from './event-bus.js';
import { AgentAnswerModel, AgentEvent, AgentEvidence, AgentPlanStep, AgentTaskRecord, AgentTaskState, AgentToolResult, TaskExecutionState, waitWithSignal } from './execution-state.js';
import { AgentPlanner } from './planner.js';
import { AgentTaskManager } from './task-manager.js';
import { AgentToolRegistry } from './tool-registry.js';

export interface AgentOrchestratorOptions {
  planner: AgentPlanner;
  answerModel?: AgentAnswerModel;
  tools: AgentToolRegistry;
  tasks?: AgentTaskManager;
  approvals?: ApprovalManager;
  events?: AgentEventBus;
  retryDelayMs?: (attempt: number) => number;
  now?: () => string;
}

function cleanError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/AIza[\w-]{20,}/g, '[redacted credential]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/(api[_-]?key|password|secret)\s*[:=]\s*[^\s,;]+/gi, '$1=[redacted]')
    .slice(0, 1000);
}

function outputExcerpt(output: unknown): string {
  let text: string;
  try { text = typeof output === 'string' ? output : JSON.stringify(output); }
  catch { return '[Tool returned a non-serializable result.]'; }
  return (text || 'No result content was returned.')
    .replace(/AIza[\w-]{20,}/g, '[redacted credential]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/("?(?:password|api[_-]?key|secret|token)"?\s*[:=]\s*)"?[^",}\s]+/gi, '$1[redacted]')
    .slice(0, 600);
}

function isEvidence(value: unknown): value is AgentEvidence {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<AgentEvidence>;
  if (typeof item.id !== 'string' || !item.id.length || typeof item.source !== 'string' || !item.source.length
    || !['url', 'provider_run', 'desktop_observation', 'provider_record', 'document'].includes(String(item.type))) return false;
  if (item.type === 'url') {
    try { const url = new URL(item.url || item.source); return ['http:', 'https:'].includes(url.protocol); }
    catch { return false; }
  }
  return true;
}

function resolveInput(value: unknown, outputs: Map<string, unknown>): unknown {
  if (Array.isArray(value)) return value.map((item) => resolveInput(item, outputs));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveInput(item, outputs)]));
  if (typeof value !== 'string') return value;
  const exact = /^\$steps\.([a-z0-9_-]+)(?:\.(.+))?$/i.exec(value);
  if (exact) {
    let output: unknown = outputs.get(exact[1]);
    for (const part of (exact[2] || '').split('.').filter(Boolean)) output = output && typeof output === 'object' ? (output as Record<string, unknown>)[part] : undefined;
    return output;
  }
  return value.replace(/\$steps\.([a-z0-9_-]+)(?:\.([a-z0-9_.]+))?/gi, (_match, id: string, path = '') => {
    let output: unknown = outputs.get(id);
    for (const part of path.split('.').filter(Boolean)) output = output && typeof output === 'object' ? (output as Record<string, unknown>)[part] : undefined;
    return output === undefined ? '' : String(output);
  });
}

export class AgentOrchestrator {
  readonly tasks: AgentTaskManager;
  readonly approvals: ApprovalManager;
  readonly events: AgentEventBus;
  private readonly runtimes = new Map<string, TaskExecutionState>();
  private readonly outputs = new Map<string, Map<string, unknown>>();

  constructor(private readonly options: AgentOrchestratorOptions) {
    this.tasks = options.tasks || new AgentTaskManager();
    this.approvals = options.approvals || new ApprovalManager(options.now);
    this.events = options.events || new AgentEventBus();
  }

  startTask(taskText: string): AgentTaskRecord {
    const task = taskText.trim();
    if (!task || task.length > 10_000) throw new Error('Task must contain between 1 and 10,000 characters.');
    const record = this.tasks.create(task);
    const runtime = new TaskExecutionState();
    this.runtimes.set(record.id, runtime);
    this.outputs.set(record.id, new Map());
    this.emit('task_created', record.id, 'Task received.');
    void this.planAndRun(record.id, runtime);
    return record;
  }

  getTask(id: string): AgentTaskRecord | undefined { return this.tasks.get(id); }
  getHistory(): AgentTaskRecord[] { return this.tasks.history(); }
  getPendingApprovals(taskId?: string): ApprovalRequest[] { return this.approvals.pending().filter((item) => !taskId || item.taskId === taskId); }

  approve(approvalId: string): AgentTaskRecord | undefined { return this.resolveApproval(approvalId, true); }
  reject(approvalId: string): AgentTaskRecord | undefined { return this.resolveApproval(approvalId, false); }

  pause(taskId: string): AgentTaskRecord | undefined {
    const task = this.tasks.get(taskId);
    const runtime = this.runtimes.get(taskId);
    if (!task || !runtime || this.isTerminal(task.state)) return task;
    const immediatelyPaused = runtime.requestPause();
    if (immediatelyPaused) {
      this.tasks.setState(taskId, 'paused');
      this.log(taskId, 'info', 'task_paused', 'Task paused at a safe execution boundary.');
      this.emit('task_state', taskId, 'Task paused.');
    } else {
      this.log(taskId, 'info', 'pause_requested', 'Pause requested; the current tool operation will finish before execution pauses.');
      this.emit('task_state', taskId, 'Pause requested; finishing the active tool operation.');
    }
    return this.tasks.get(taskId);
  }

  resume(taskId: string): AgentTaskRecord | undefined {
    const task = this.tasks.get(taskId);
    const runtime = this.runtimes.get(taskId);
    if (!task || !runtime || this.isTerminal(task.state)) return task;
    runtime.resume();
    this.tasks.setState(taskId, 'ready');
    this.log(taskId, 'info', 'task_resumed', 'Task resumed.');
    this.emit('task_state', taskId, 'Task resumed.');
    return this.tasks.get(taskId);
  }

  cancel(taskId: string): AgentTaskRecord | undefined {
    const task = this.tasks.get(taskId);
    const runtime = this.runtimes.get(taskId);
    if (!task || !runtime || this.isTerminal(task.state)) return task;
    runtime.cancel();
    this.approvals.getPendingForTask(taskId).forEach((approval) => this.approvals.resolve(approval.id, false));
    this.tasks.setState(taskId, 'cancelled');
    this.log(taskId, 'warning', 'task_cancelled', 'Task was cancelled.');
    this.emit('task_cancelled', taskId, 'Task cancelled.');
    return this.tasks.get(taskId);
  }

  private resolveApproval(approvalId: string, approved: boolean): AgentTaskRecord | undefined {
    const request = this.approvals.resolve(approvalId, approved);
    if (!request) return undefined;
    const task = this.tasks.get(request.taskId);
    const text = approved ? 'User approved the consequential action.' : 'User declined the consequential action.';
    if (task) {
      this.log(task.id, approved ? 'info' : 'warning', approved ? 'approval_granted' : 'approval_denied', text, request.stepId);
      this.emit('approval_resolved', task.id, text, { stepId: request.stepId, approvalId });
      if (!approved) this.cancel(task.id);
    }
    return task;
  }

  private async planAndRun(taskId: string, runtime: TaskExecutionState): Promise<void> {
    try {
      this.tasks.setState(taskId, 'planning');
      this.log(taskId, 'info', 'planning_started', 'Gemini is interpreting the request and selecting tools.');
      this.emit('task_state', taskId, 'Planning task.');
      const task = this.tasks.get(taskId)!;
      const plan = await this.options.planner.createPlan(task.task, runtime.signal);
      if (runtime.signal.aborted) return;
      this.tasks.setPlan(taskId, plan);
      this.log(taskId, 'info', 'plan_ready', `Plan created with ${plan.steps.length} step${plan.steps.length === 1 ? '' : 's'}.`);
      this.emit('plan_ready', taskId, plan.summary);
      this.tasks.setState(taskId, 'ready');
      this.emit('task_state', taskId, 'Plan ready.');
      await this.executePlan(taskId, runtime);
    } catch (error) {
      if (runtime.signal.aborted) {
        const current = this.tasks.get(taskId);
        if (current && !this.isTerminal(current.state)) this.failTask(taskId, error);
        return;
      }
      this.failTask(taskId, error);
    }
  }

  private async executePlan(taskId: string, runtime: TaskExecutionState): Promise<void> {
    const outputs = this.outputs.get(taskId)!;
    while (true) {
      await runtime.checkpoint();
      if (runtime.isPaused) {
        this.tasks.setState(taskId, 'paused');
        this.emit('task_state', taskId, 'Task paused.');
        continue;
      }
      const task = this.tasks.get(taskId)!;
      if (this.isTerminal(task.state)) return;
      const ready = task.steps.filter((step) => step.state === 'pending' && step.dependsOn.every((id) => task.steps.find((item) => item.id === id)?.state === 'completed'));
      if (!ready.length) {
        if (task.steps.every((step) => step.state === 'completed')) {
          await this.completeTask(taskId, runtime);
          return;
        }
        if (task.steps.some((step) => step.state === 'awaiting_approval')) {
          this.tasks.setState(taskId, 'awaiting_approval');
          this.emit('task_state', taskId, 'Waiting for approval.');
          await this.waitForApprovalCompletion(taskId, runtime);
          continue;
        }
        throw new Error('Task plan is blocked because no pending step can run.');
      }

      const approved = await this.obtainApprovals(taskId, ready, runtime);
      if (!approved || runtime.signal.aborted) return;
      await runtime.checkpoint();
      if (runtime.isPaused) continue;
      this.tasks.setState(taskId, 'running');
      this.emit('task_state', taskId, 'Executing plan steps.');
      const outcomes = await Promise.all(ready.map((step) => this.executeStep(taskId, step, runtime, outputs)));
      const failure = outcomes.find((result) => result instanceof Error);
      if (failure instanceof Error) throw failure;
      if (outcomes.some((result) => !(result instanceof Error) && result.needsUserAction)) {
        runtime.requestPause();
        this.tasks.setState(taskId, 'paused');
        this.log(taskId, 'info', 'user_action_required', 'Follow the desktop guidance, then resume the task for another verified observation.');
        this.emit('task_state', taskId, 'Follow the desktop guidance, then resume for another verified observation.');
        continue;
      }
      if (runtime.isPaused) {
        this.tasks.setState(taskId, 'paused');
        this.log(taskId, 'info', 'task_paused', 'Task paused after the active tool operation completed.');
        this.emit('task_state', taskId, 'Task paused.');
      }
    }
  }

  private async obtainApprovals(taskId: string, steps: AgentPlanStep[], runtime: TaskExecutionState): Promise<boolean> {
    const task = this.tasks.get(taskId)!;
    for (const step of steps) {
      const tool = this.options.tools.get(step.tool)!;
      if (!this.approvals.requiresApproval(task.task, step, tool.capability)) continue;
      const action = `${step.title}: ${step.tool}`;
      const approval = this.approvals.request(taskId, step.id, action, runtime.signal);
      this.tasks.updateStep(taskId, step.id, { state: 'awaiting_approval' });
      this.tasks.setState(taskId, 'awaiting_approval');
      this.log(taskId, 'warning', 'approval_required', `Approval required before: ${step.title}.`, step.id);
      this.emit('approval_required', taskId, action, { stepId: step.id, approvalId: approval.request.id });
      const approved = await approval.decision;
      if (runtime.signal.aborted) return false;
      if (!approved) { this.cancel(taskId); return false; }
      this.tasks.updateStep(taskId, step.id, { state: 'pending' });
    }
    return true;
  }

  private async waitForApprovalCompletion(taskId: string, runtime: TaskExecutionState): Promise<void> {
    while (!runtime.signal.aborted && this.approvals.getPendingForTask(taskId).length) await new Promise((resolve) => setTimeout(resolve, 40));
    if (runtime.signal.aborted) throw runtime.signal.reason;
    const task = this.tasks.get(taskId);
    if (task?.steps.some((step) => step.state === 'awaiting_approval')) {
      for (const step of task.steps.filter((item) => item.state === 'awaiting_approval')) this.tasks.updateStep(taskId, step.id, { state: 'pending' });
    }
  }

  private async executeStep(taskId: string, step: AgentPlanStep, runtime: TaskExecutionState, outputs: Map<string, unknown>): Promise<AgentToolResult | Error> {
    const tool = this.options.tools.get(step.tool)!;
    const maxAttempts = tool.capability === 'write' ? 1 : Math.max(1, tool.maxAttempts ?? 2);
    runtime.beginStep();
    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        if (runtime.signal.aborted) return new Error('Task cancelled.');
        this.tasks.updateStep(taskId, step.id, { state: attempt > 1 ? 'retrying' : 'running', attempts: attempt });
        this.tasks.setState(taskId, attempt > 1 ? 'waiting_for_tool' : 'running');
        this.emit('step_state', taskId, attempt > 1 ? `Retrying ${step.title} (attempt ${attempt}).` : `Starting ${step.title}.`, { stepId: step.id });
        try {
          const input = resolveInput(step.input, outputs) as Record<string, unknown>;
          this.tasks.setState(taskId, 'waiting_for_tool');
          this.emit('task_state', taskId, `Waiting for ${step.tool}.`, { stepId: step.id });
          const result = await this.options.tools.execute(step.tool, input, { taskId, stepId: step.id, signal: runtime.signal });
          if (!result || !Array.isArray(result.evidence) || result.evidence.length === 0 || result.evidence.some((item) => !isEvidence(item))) {
            throw new Error(`Tool ${step.tool} returned no valid evidence; completion cannot be claimed.`);
          }
          if (runtime.signal.aborted) return new Error('Task cancelled.');
          this.tasks.updateStep(taskId, step.id, { state: result.needsUserAction ? 'pending' : 'completed', output: result.output, evidence: result.evidence, error: undefined });
          outputs.set(step.id, result.output);
          this.tasks.addEvidence(taskId, result.evidence);
          this.log(taskId, 'info', result.needsUserAction ? 'user_action_required' : 'step_completed', result.needsUserAction ? 'Desktop guidance is ready; user action is needed before another check.' : `${step.title} completed with evidence.`, step.id);
          this.emit('step_state', taskId, result.needsUserAction ? 'Waiting for you to follow the desktop guidance.' : `${step.title} completed.`, { stepId: step.id });
          for (const evidence of result.evidence) this.emit('evidence', taskId, evidence.title || evidence.source, { stepId: step.id });
          return result;
        } catch (error) {
          if (runtime.signal.aborted) return new Error('Task cancelled.');
          const message = cleanError(error);
          this.tasks.updateStep(taskId, step.id, { state: attempt < maxAttempts ? 'retrying' : 'failed', error: message, attempts: attempt });
          this.log(taskId, attempt < maxAttempts ? 'warning' : 'error', attempt < maxAttempts ? 'step_retry' : 'step_failed', attempt < maxAttempts ? `Step failed and will retry: ${message}` : `Step failed: ${message}`, step.id);
          if (attempt >= maxAttempts) { runtime.cancel(`Task step failed: ${message}`); return new Error(message); }
          this.tasks.setState(taskId, 'waiting_for_tool');
          this.emit('step_state', taskId, `Retrying ${step.title}.`, { stepId: step.id });
          await waitWithSignal(this.options.retryDelayMs?.(attempt) ?? Math.min(1000 * attempt, 5000), runtime.signal).catch(() => {});
        }
      }
      return new Error('Step retry limit reached.');
    } finally {
      runtime.endStep();
    }
  }

  private async completeTask(taskId: string, runtime: TaskExecutionState): Promise<void> {
    const task = this.tasks.get(taskId)!;
    if (!task.evidence.length) { this.failTask(taskId, new Error('No validated evidence was collected; task cannot be marked complete.')); return; }
    let response: string;
    if (this.options.answerModel) {
      this.tasks.setState(taskId, 'waiting_for_tool');
      this.emit('task_state', taskId, 'Gemini is preparing an answer from verified tool results.');
      try {
        response = await this.options.answerModel.answer(task.task, task.plan?.summary || '', task.steps.map((step) => ({
          title: step.title, output: step.output,
          sources: step.evidence.map((item) => ({ title: item.title || item.source, ...(item.url ? { url: item.url } : {}), ...(item.detail ? { detail: item.detail } : {}) }))
        })), runtime.signal);
      } catch (error) {
        if (runtime.signal.aborted) return;
        this.failTask(taskId, error); return;
      }
      if (runtime.signal.aborted) return;
      response = `${response.trim()}\n\nSources: ${[...new Set(task.evidence.filter((item) => item.url).map((item) => item.url!))].join('; ')}`;
    } else {
      const sources = task.evidence.map((item) => item.title || item.url || item.source).filter(Boolean);
      response = `MINDORA finished the planned tool steps for: ${task.plan?.summary || 'your request'}\n\n${task.steps.map((step) => `• ${step.title}\n  Result: ${outputExcerpt(step.output)}\n  Evidence: ${step.evidence.map((item) => item.title || item.url || item.source).join('; ')}`).join('\n')}\n\nSources: ${[...new Set(sources)].join('; ')}`;
    }
    this.tasks.setState(taskId, 'completed', { response });
    this.log(taskId, 'info', 'task_completed', 'Task completed with validated tool evidence.');
    this.emit('task_completed', taskId, response);
  }

  private failTask(taskId: string, error: unknown): void {
    const message = cleanError(error);
    const task = this.tasks.get(taskId);
    if (!task || this.isTerminal(task.state)) return;
    this.tasks.setState(taskId, 'failed', { error: message });
    this.log(taskId, 'error', 'task_failed', message);
    this.emit('task_failed', taskId, message);
  }

  private log(taskId: string, level: 'info' | 'warning' | 'error', event: string, message: string, stepId?: string): void {
    const task = this.tasks.addLog(taskId, { level, event, message, ...(stepId ? { stepId } : {}) });
    this.emit('log', taskId, message, stepId ? { stepId } : {});
  }

  private emit(type: AgentEvent['type'], taskId: string, message?: string, extra: { stepId?: string; approvalId?: string } = {}): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    this.events.publish({ type, taskId, at: new Date().toISOString(), task: structuredClone(task), ...(message ? { message } : {}), ...extra });
  }

  private isTerminal(state: AgentTaskState): boolean { return state === 'completed' || state === 'failed' || state === 'cancelled'; }
}
