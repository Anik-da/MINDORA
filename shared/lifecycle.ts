/**
 * MINDORA - Request Lifecycle & Session Controller Module
 * 
 * Manages session and request identity, strictly enforces one in-flight request,
 * and handles invalidation so late responses (after Pause, Stop, or Session Replacement)
 * never update active guidance.
 */

import { ValidatedGuidance } from './contracts.js';

export type SessionStateStatus = 'idle' | 'checking' | 'paused' | 'stopped';

export interface InFlightToken {
  sessionId: string;
  requestId: number;
  timestamp: number;
}

export interface SessionSnapshot {
  sessionId: string;
  goal: string;
  supportedApplication: string;
  status: SessionStateStatus;
  currentRequestId: number;
  hasInFlightRequest: boolean;
  activeGuidance: ValidatedGuidance | null;
  historySummary: string[];
}

export type CheckTriggerResult =
  | { allowed: true; sessionId: string; requestId: number }
  | { allowed: false; reason: string };

export type ResponseResolution =
  | { status: 'applied'; sessionId: string; requestId: number; guidance: ValidatedGuidance }
  | { status: 'discarded'; reason: string };

export class SessionController {
  private _sessionId: string = '';
  private _goal: string = '';
  private _supportedApplication: string = 'Active application';
  private _status: SessionStateStatus = 'stopped';
  private _currentRequestId: number = 0;
  private _inFlightToken: InFlightToken | null = null;
  private _activeGuidance: ValidatedGuidance | null = null;
  private _historySummary: string[] = [];

  constructor() {}

  get status(): SessionStateStatus {
    return this._status;
  }

  get sessionId(): string {
    return this._sessionId;
  }

  get currentRequestId(): number {
    return this._currentRequestId;
  }

  get activeGuidance(): ValidatedGuidance | null {
    return this._activeGuidance;
  }

  /**
   * Starts a new session with an initial goal.
   * Invalidates any previous session's in-flight requests immediately.
   */
  public startSession(goal: string, supportedApplication = 'Active application'): SessionSnapshot {
    this._sessionId = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this._goal = goal.trim();
    this._supportedApplication = supportedApplication;
    this._status = 'idle';
    this._currentRequestId = 0;
    this._inFlightToken = null;
    this._activeGuidance = null;
    this._historySummary = [];

    return this.getSnapshot();
  }

  /**
   * Triggers a Check operation.
   * Strictly enforces that only ONE request can be in-flight at any time.
   */
  public triggerCheck(): CheckTriggerResult {
    if (this._status === 'stopped') {
      return { allowed: false, reason: 'Cannot check: Session is stopped.' };
    }

    if (this._status === 'paused') {
      return { allowed: false, reason: 'Cannot check: Session is paused.' };
    }

    if (this._status === 'checking' || this._inFlightToken !== null) {
      return { allowed: false, reason: 'Duplicate check ignored: A request is already in-flight.' };
    }

    this._currentRequestId += 1;
    this._inFlightToken = {
      sessionId: this._sessionId,
      requestId: this._currentRequestId,
      timestamp: Date.now()
    };
    this._status = 'checking';

    return {
      allowed: true,
      sessionId: this._sessionId,
      requestId: this._currentRequestId
    };
  }

  /**
   * Resolves an incoming model response.
   * If the request was invalidated by Stop, Pause, or Session Replacement,
   * the response is discarded and guidance is NOT updated.
   */
  public handleResponse(payload: {
    sessionId: string;
    requestId: number;
    guidance: ValidatedGuidance;
  }): ResponseResolution {
    if (!this._inFlightToken) {
      return {
        status: 'discarded',
        reason: 'Discarded: No request is currently in-flight (was stopped or already resolved).'
      };
    }

    if (payload.sessionId !== this._inFlightToken.sessionId) {
      return {
        status: 'discarded',
        reason: `Discarded: Response session ID (${payload.sessionId}) does not match active session (${this._inFlightToken.sessionId}).`
      };
    }

    if (payload.requestId !== this._inFlightToken.requestId) {
      return {
        status: 'discarded',
        reason: `Discarded: Response request ID (#${payload.requestId}) does not match active in-flight request (#${this._inFlightToken.requestId}).`
      };
    }

    if (this._status !== 'checking') {
      return {
        status: 'discarded',
        reason: `Discarded: Session state is '${this._status}', expected 'checking'.`
      };
    }

    // Response is valid and matches the in-flight request
    this._inFlightToken = null;
    this._activeGuidance = payload.guidance;
    this._status = payload.guidance.status === 'complete' ? 'idle' : 'idle';

    if (payload.guidance.observation) {
      this._historySummary.push(`[#${payload.requestId}] ${payload.guidance.instruction}`);
    }

    return {
      status: 'applied',
      sessionId: payload.sessionId,
      requestId: payload.requestId,
      guidance: payload.guidance
    };
  }

  /**
   * Pauses the session. Immediately invalidates any in-flight check.
   */
  public pause(): void {
    if (this._status !== 'stopped') {
      this._status = 'paused';
      this._inFlightToken = null; // Invalidate in-flight request
    }
  }

  /**
   * Resumes a paused session.
   */
  public resume(): void {
    if (this._status === 'paused') {
      this._status = 'idle';
    }
  }

  /**
   * Stops the session. Clears active guidance and invalidates in-flight requests.
   */
  public stop(): void {
    this._status = 'stopped';
    this._inFlightToken = null;
    this._activeGuidance = null;
  }

  public getSnapshot(): SessionSnapshot {
    return {
      sessionId: this._sessionId,
      goal: this._goal,
      supportedApplication: this._supportedApplication,
      status: this._status,
      currentRequestId: this._currentRequestId,
      hasInFlightRequest: this._inFlightToken !== null,
      activeGuidance: this._activeGuidance,
      historySummary: [...this._historySummary]
    };
  }
}
