import { randomUUID } from 'node:crypto';
import { AgentPlanStep, AgentTaskRecord } from './execution-state.js';

export interface ApprovalRequest {
  id: string;
  taskId: string;
  stepId: string;
  action: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
}
export interface PendingApproval { request: ApprovalRequest; decision: Promise<boolean> }

const CONSEQUENTIAL_ACTION = /\b(send|email|message|submit|purchase|buy|checkout|pay|publish|post|delete|remove|change account|account settings|transfer|book|order|share|invite|revoke|cancel subscription)\b/i;

export class ApprovalManager {
  private readonly requests = new Map<string, ApprovalRequest>();
  private readonly waiters = new Map<string, (approved: boolean) => void>();
  constructor(private readonly now: () => string = () => new Date().toISOString()) {}

  requiresApproval(task: string, step: AgentPlanStep, capability: 'read' | 'write'): boolean {
    return capability === 'write' || step.effect !== 'read' || CONSEQUENTIAL_ACTION.test(`${task}\n${step.title}\n${JSON.stringify(step.input)}`);
  }

  request(taskId: string, stepId: string, action: string, signal: AbortSignal): PendingApproval {
    const id = randomUUID();
    const request: ApprovalRequest = { id, taskId, stepId, action, createdAt: this.now(), status: 'pending' };
    this.requests.set(id, request);
    const decision = new Promise<boolean>((resolve, reject) => {
      const abort = () => {
        this.waiters.delete(id);
        this.requests.delete(id);
        signal.removeEventListener('abort', abort);
        reject(signal.reason || new Error('Approval request cancelled.'));
      };
      this.waiters.set(id, (approved) => {
        signal.removeEventListener('abort', abort);
        request.status = approved ? 'approved' : 'rejected';
        resolve(approved);
      });
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    });
    return { request, decision };
  }

  resolve(id: string, approved: boolean): ApprovalRequest | undefined {
    const request = this.requests.get(id);
    const waiter = this.waiters.get(id);
    if (!request || !waiter || request.status !== 'pending') return undefined;
    this.waiters.delete(id);
    waiter(approved);
    return request;
  }

  getPendingForTask(taskId: string): ApprovalRequest[] {
    return [...this.requests.values()].filter((request) => request.taskId === taskId && request.status === 'pending');
  }

  pending(): ApprovalRequest[] { return [...this.requests.values()].filter((request) => request.status === 'pending'); }
}

export function hasApproval(task: AgentTaskRecord, stepId: string, approvals: ApprovalRequest[]): boolean {
  return approvals.some((request) => request.taskId === task.id && request.stepId === stepId && request.status === 'approved');
}
