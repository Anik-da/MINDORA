/**
 * MINDORA - Persistent API Budget Tracker
 * 
 * Enforces strict 12-request session limit and 5-second pacing
 * to prevent quota exhaustion and runaway loops.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BudgetHistoryEntry {
  timestamp: string;
  model: string;
  status: 'success' | 'error' | 'timeout' | 'blocked';
  latencyMs?: number;
  statusCode?: number;
  notes?: string;
}

export interface BudgetFileState {
  used: number;
  max: number;
  lastRequestTime: number;
  history: BudgetHistoryEntry[];
}

const DEFAULT_BUDGET_FILE = '.api_budget.json';
const MAX_BUDGET = 12;
const MIN_REQUEST_INTERVAL_MS = 5000;

export class ApiBudgetManager {
  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || path.resolve(process.cwd(), DEFAULT_BUDGET_FILE);
  }

  public getState(): BudgetFileState {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
          used: typeof parsed.used === 'number' ? parsed.used : 0,
          max: typeof parsed.max === 'number' ? parsed.max : MAX_BUDGET,
          lastRequestTime: typeof parsed.lastRequestTime === 'number' ? parsed.lastRequestTime : 0,
          history: Array.isArray(parsed.history) ? parsed.history : []
        };
      }
    } catch {
      // Fallback on read failure
    }

    return {
      used: 0,
      max: MAX_BUDGET,
      lastRequestTime: 0,
      history: []
    };
  }

  public checkAllowance(): { allowed: boolean; reason?: string; waitMs?: number } {
    const state = this.getState();

    if (state.used >= state.max) {
      return {
        allowed: false,
        reason: `API Budget exhausted: ${state.used} of ${state.max} allowed requests used.`
      };
    }

    const now = Date.now();
    const elapsed = now - state.lastRequestTime;
    if (state.lastRequestTime > 0 && elapsed < MIN_REQUEST_INTERVAL_MS) {
      const waitMs = MIN_REQUEST_INTERVAL_MS - elapsed;
      return {
        allowed: false,
        reason: `Rate pacing: at least 5s required between requests. Wait ${Math.ceil(waitMs / 1000)}s.`,
        waitMs
      };
    }

    return { allowed: true };
  }

  public recordRequest(entry: Omit<BudgetHistoryEntry, 'timestamp'>): BudgetFileState {
    const state = this.getState();
    const now = Date.now();

    state.used += 1;
    state.lastRequestTime = now;
    state.history.push({
      timestamp: new Date(now).toISOString(),
      ...entry
    });

    try {
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ApiBudgetManager] Failed to persist budget state:', err);
    }

    return state;
  }

  public resetBudget(): BudgetFileState {
    const state: BudgetFileState = {
      used: 0,
      max: MAX_BUDGET,
      lastRequestTime: 0,
      history: []
    };
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('[ApiBudgetManager] Failed to reset budget file:', err);
    }
    return state;
  }
}

export const defaultApiBudget = new ApiBudgetManager();

export interface SessionBudgetState {
  used: number;
  max: number;
  lastRequestTime: number;
}

/**
 * In-memory budget manager for live user coaching sessions.
 * Keeps interactive limits separate from the persistent automated build/test budget.
 */
export class InteractiveSessionBudget {
  private used: number = 0;
  private max: number;
  private lastRequestTime: number = 0;
  private minIntervalMs: number;

  constructor(maxPerSession = 15, minIntervalMs = 5000) {
    this.max = maxPerSession;
    this.minIntervalMs = minIntervalMs;
  }

  public getState(): SessionBudgetState {
    return {
      used: this.used,
      max: this.max,
      lastRequestTime: this.lastRequestTime
    };
  }

  public getRemaining(): number {
    return Math.max(0, this.max - this.used);
  }

  public checkAllowance(): { allowed: boolean; reason?: string; waitMs?: number } {
    if (this.used >= this.max) {
      return {
        allowed: false,
        reason: `Session check limit reached (${this.used}/${this.max}). Reset session (Ctrl+Alt+R) to begin a fresh coaching run.`
      };
    }

    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (this.lastRequestTime > 0 && elapsed < this.minIntervalMs) {
      const waitMs = this.minIntervalMs - elapsed;
      const waitSec = Math.ceil(waitMs / 1000);
      return {
        allowed: false,
        reason: `Rate pacing: please wait ${waitSec}s between checks for model stabilization.`,
        waitMs
      };
    }

    return { allowed: true };
  }

  public recordRequest(): void {
    this.used += 1;
    this.lastRequestTime = Date.now();
  }

  public resetSession(): void {
    this.used = 0;
    this.lastRequestTime = 0;
  }
}

export const defaultSessionBudget = new InteractiveSessionBudget();
