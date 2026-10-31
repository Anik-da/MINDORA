import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AgentLogEntry, AgentPlan, AgentTaskRecord, AgentTaskState, AgentStepRecord } from './execution-state.js';

function redact(text: string): string {
  return text.replace(/AIza[\w-]{20,}/g, '[redacted credential]')
    .replace(/\bBearer\s+[^\s"']+/gi, 'Bearer [redacted]')
    .replace(/([?&](?:key|token|password|secret|signature|sig|auth)=)[^&\s]+/gi, '$1[redacted]')
    .replace(/(password|passcode|api[_ -]?key|secret|token)\s*(?:is|[:=])\s*[^\s,;]+/gi, '$1=[redacted]');
}

export class AgentTaskManager {
  private readonly tasks = new Map<string, AgentTaskRecord>();
  constructor(private readonly historyLimit = 100, private readonly now: () => string = () => new Date().toISOString(), private readonly filePath?: string) {
    this.loadHistory();
  }

  create(task: string): AgentTaskRecord {
    const timestamp = this.now();
    const record: AgentTaskRecord = {
      id: randomUUID(), task, state: 'created', steps: [], evidence: [], logs: [], createdAt: timestamp, updatedAt: timestamp
    };
    this.tasks.set(record.id, record);
    this.prune();
    this.persist();
    return record;
  }

  get(id: string): AgentTaskRecord | undefined { return this.tasks.get(id); }
  history(): AgentTaskRecord[] { return [...this.tasks.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }

  setState(id: string, state: AgentTaskState, patch: Partial<Pick<AgentTaskRecord, 'response' | 'error'>> = {}): AgentTaskRecord {
    const task = this.require(id);
    Object.assign(task, patch, { state, updatedAt: this.now() });
    this.persist();
    return task;
  }

  setPlan(id: string, plan: AgentPlan): AgentTaskRecord {
    const task = this.require(id);
    task.plan = plan;
    task.steps = plan.steps.map((step): AgentStepRecord => ({ ...step, state: 'pending', attempts: 0, evidence: [] }));
    task.updatedAt = this.now();
    this.persist();
    return task;
  }

  updateStep(id: string, stepId: string, patch: Partial<AgentStepRecord>): AgentTaskRecord {
    const task = this.require(id);
    const step = task.steps.find((item) => item.id === stepId);
    if (!step) throw new Error(`Unknown step ${stepId} on task ${id}.`);
    Object.assign(step, patch);
    task.updatedAt = this.now();
    this.persist();
    return task;
  }

  addEvidence(id: string, evidence: AgentStepRecord['evidence']): AgentTaskRecord {
    const task = this.require(id);
    const existing = new Set(task.evidence.map((item) => item.id));
    for (const item of evidence) if (!existing.has(item.id)) task.evidence.push(item);
    task.updatedAt = this.now();
    this.persist();
    return task;
  }

  addLog(id: string, entry: Omit<AgentLogEntry, 'at'>): AgentTaskRecord {
    const task = this.require(id);
    task.logs.push({ ...entry, at: this.now() });
    task.updatedAt = this.now();
    this.persist();
    return task;
  }

  private require(id: string): AgentTaskRecord {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Unknown task ${id}.`);
    return task;
  }

  private prune(): void {
    const oldestFirst = [...this.tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    while (oldestFirst.length > this.historyLimit) {
      const oldest = oldestFirst.shift();
      if (oldest) this.tasks.delete(oldest.id);
    }
  }

  private loadHistory(): void {
    if (!this.filePath) return;
    try {
      const records = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if (!Array.isArray(records)) return;
      for (const record of records.slice(-this.historyLimit)) {
        if (!record || typeof record.id !== 'string' || typeof record.task !== 'string') continue;
        if (!Array.isArray(record.steps) || !Array.isArray(record.logs) || !Array.isArray(record.evidence)) continue;
        const safe = record as AgentTaskRecord;
        safe.task = redact(safe.task);
        if (!['completed', 'failed', 'cancelled'].includes(safe.state)) {
          safe.state = 'failed';
          safe.error = 'MINDORA closed before this task finished.';
        }
        safe.steps = safe.steps.map((step) => ({ ...step, input: {}, output: undefined }));
        if (safe.plan) safe.plan = { ...safe.plan, steps: safe.plan.steps.map((step) => ({ ...step, input: {} })) };
        this.tasks.set(safe.id, safe);
      }
    } catch { /* Missing or malformed optional history starts a clean in-memory history. */ }
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
      const records = this.history().map((task) => ({
        ...task, task: redact(task.task),
        ...(task.plan ? { plan: { summary: redact(task.plan.summary), steps: task.plan.steps.map(({ input: _input, ...step }) => ({ ...step, title: redact(step.title) })) } } : {}),
        steps: task.steps.map(({ input: _input, output: _output, ...step }) => ({ ...step, title: redact(step.title), error: step.error ? redact(step.error) : undefined })),
        evidence: task.evidence.map((item) => ({ ...item, source: redact(item.source), title: item.title ? redact(item.title) : undefined, url: item.url ? redact(item.url) : undefined, detail: item.detail ? redact(item.detail) : undefined })),
        logs: task.logs.map((entry) => ({ ...entry, message: redact(entry.message) })),
        ...(task.response ? { response: redact(task.response) } : {}), ...(task.error ? { error: redact(task.error) } : {})
      }));
      const temporary = `${this.filePath}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(records.slice(0, this.historyLimit), null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(temporary, this.filePath);
    } catch { /* History persistence is best-effort and cannot interrupt task execution. */ }
  }
}
