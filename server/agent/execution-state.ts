export type AgentTaskState = 'created' | 'planning' | 'awaiting_approval' | 'ready' | 'running' | 'waiting_for_tool' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type AgentStepState = 'pending' | 'awaiting_approval' | 'running' | 'retrying' | 'completed' | 'failed' | 'skipped';

export interface AgentEvidence {
  id: string;
  type: 'url' | 'provider_run' | 'desktop_observation' | 'provider_record' | 'document';
  source: string;
  title?: string;
  url?: string;
  detail?: string;
}

export interface AgentLogEntry {
  at: string;
  level: 'info' | 'warning' | 'error';
  event: string;
  message: string;
  stepId?: string;
}

export interface AgentPlanStep {
  id: string;
  title: string;
  tool: string;
  input: Record<string, unknown>;
  dependsOn: string[];
  effect: 'read' | 'write' | 'external';
}

export interface AgentPlan {
  summary: string;
  steps: AgentPlanStep[];
}

export interface AgentStepRecord extends AgentPlanStep {
  state: AgentStepState;
  attempts: number;
  output?: unknown;
  evidence: AgentEvidence[];
  error?: string;
}

export interface AgentTaskRecord {
  id: string;
  task: string;
  state: AgentTaskState;
  plan?: AgentPlan;
  steps: AgentStepRecord[];
  evidence: AgentEvidence[];
  logs: AgentLogEntry[];
  response?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPlanModel {
  plan(task: string, tools: Array<{ id: string; description: string; capability: 'read' | 'write' }>, signal?: AbortSignal): Promise<unknown>;
}

export interface AgentAnswerModel {
  answer(task: string, planSummary: string, results: Array<{ title: string; output: unknown; sources: Array<{ title: string; url?: string; detail?: string }> }>, signal?: AbortSignal): Promise<string>;
}

export interface AgentEvent {
  type: 'task_created' | 'task_state' | 'plan_ready' | 'step_state' | 'approval_required' | 'approval_resolved' | 'evidence' | 'log' | 'task_completed' | 'task_failed' | 'task_cancelled';
  taskId: string;
  at: string;
  task: AgentTaskRecord;
  stepId?: string;
  approvalId?: string;
  message?: string;
}

export interface AgentExecutionContext {
  taskId: string;
  stepId: string;
  signal: AbortSignal;
}

export interface AgentToolResult {
  output: unknown;
  evidence: AgentEvidence[];
  needsUserAction?: boolean;
}

export interface AgentTool {
  id: string;
  description: string;
  capability: 'read' | 'write';
  maxAttempts?: number;
  execute(input: Record<string, unknown>, context: AgentExecutionContext): Promise<AgentToolResult>;
}

export function waitWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new Error('Operation cancelled.')); return; }
    const cleanup = () => signal?.removeEventListener('abort', onAbort);
    const timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(signal?.reason || new Error('Operation cancelled.')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class TaskExecutionState {
  readonly controller = new AbortController();
  private paused = false;
  private activeSteps = 0;
  private resumeWaiters: Array<() => void> = [];

  get signal(): AbortSignal { return this.controller.signal; }
  get isPaused(): boolean { return this.paused; }
  get hasActiveSteps(): boolean { return this.activeSteps > 0; }
  get isCancelled(): boolean { return this.signal.aborted; }
  requestPause(): boolean { this.paused = true; return this.activeSteps === 0; }
  resume(): void { this.paused = false; for (const release of this.resumeWaiters.splice(0)) release(); }
  cancel(reason = 'Task cancelled by user.'): void { this.controller.abort(new Error(reason)); this.resume(); }
  beginStep(): void { this.activeSteps++; }
  endStep(): void { this.activeSteps = Math.max(0, this.activeSteps - 1); }

  async checkpoint(): Promise<void> {
    while (this.paused && !this.signal.aborted) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => { this.signal.removeEventListener('abort', abort); reject(this.signal.reason); };
        if (this.signal.aborted) { abort(); return; }
        this.signal.addEventListener('abort', abort, { once: true });
        this.resumeWaiters.push(() => { this.signal.removeEventListener('abort', abort); resolve(); });
      });
    }
    if (this.signal.aborted) throw this.signal.reason || new Error('Task cancelled.');
  }
}
