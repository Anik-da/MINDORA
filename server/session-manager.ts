/**
 * MINDORA Web - Session Lifecycle & Server-side Rate Pacing Manager
 * 
 * Enforces server-side constraints for Cloud Run readiness and API quota protection:
 * - 1 analysis in flight per session (rejects duplicate submissions).
 * - Server-side request pacing (minimum 5s between checks per session).
 * - Bounded session check limit (default 15 checks).
 * - Progressive step number tracking (only advances on verified expected progress).
 * - Compact turn history retention (max 5 items).
 * - In-memory automatic session eviction after 30 minutes of inactivity.
 */

export interface SessionTurn {
  turnNumber: number;
  instruction: string;
  assessment: string;
  status: string;
  selectedCandidateText: string | null;
  timestamp: number;
}

export interface UserSession {
  sessionId: string;
  checkCount: number;
  maxChecks: number;
  lastCheckTime: number;
  inFlight: boolean;
  currentStepNumber: number;
  history: SessionTurn[];
  tutorialSteps?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface PacingCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfterSec?: number;
}

export class SessionManager {
  private sessions = new Map<string, UserSession>();
  private readonly defaultMaxChecks = 15;
  private readonly minCheckIntervalMs = 5000; // 5 seconds pacing
  private readonly sessionTtlMs = 30 * 60 * 1000; // 30 minutes TTL

  constructor() {
    // Periodic session cleanup every 5 minutes
    const timer = setInterval(() => this.cleanupExpiredSessions(), 5 * 60 * 1000);
    if (timer.unref) {
      timer.unref();
    }
  }

  /**
   * Retrieves or initializes an active session.
   */
  public getOrCreateSession(sessionId: string): UserSession {
    let session = this.sessions.get(sessionId);
    const now = Date.now();

    if (!session) {
      session = {
        sessionId,
        checkCount: 0,
        maxChecks: this.defaultMaxChecks,
        lastCheckTime: 0,
        inFlight: false,
        currentStepNumber: 1,
        history: [],
        createdAt: now,
        updatedAt: now
      };
      this.sessions.set(sessionId, session);
    } else {
      session.updatedAt = now;
    }

    return session;
  }

  /**
   * Checks whether a new request is permitted under rate pacing and session quota.
   */
  public checkRateAndPacing(sessionId: string): PacingCheckResult {
    const session = this.getOrCreateSession(sessionId);
    const now = Date.now();

    // Guard 1: Reject duplicate concurrent submissions
    if (session.inFlight) {
      return {
        allowed: false,
        reason: 'An analysis is already in progress for this session. Please wait.'
      };
    }

    // Guard 2: Enforce 5s minimum interval between checks
    const elapsedSinceLastCheck = now - session.lastCheckTime;
    if (session.lastCheckTime > 0 && elapsedSinceLastCheck < this.minCheckIntervalMs) {
      const waitRemainingMs = this.minCheckIntervalMs - elapsedSinceLastCheck;
      const retryAfterSec = Math.ceil(waitRemainingMs / 1000);
      return {
        allowed: false,
        retryAfterSec,
        reason: `Please wait ${retryAfterSec}s before checking again to maintain steady guidance.`
      };
    }

    // Guard 3: Session check limit
    if (session.checkCount >= session.maxChecks) {
      return {
        allowed: false,
        reason: `Session check limit reached (${session.maxChecks} checks). Please reset your session to start fresh.`
      };
    }

    return { allowed: true };
  }

  /**
   * Marks a session as having an in-flight request.
   */
  public beginRequest(sessionId: string): boolean {
    const session = this.getOrCreateSession(sessionId);
    if (session.inFlight) return false;
    session.inFlight = true;
    return true;
  }

  /**
   * Completes a request, records check count and turn history, and updates progressive step.
   */
  public completeRequest(
    sessionId: string,
    success: boolean,
    details?: {
      instruction: string;
      assessment: string;
      status: string;
      selectedCandidateText: string | null;
    }
  ): void {
    const session = this.getOrCreateSession(sessionId);
    session.inFlight = false;
    const now = Date.now();
    session.lastCheckTime = now;
    session.updatedAt = now;

    if (success && details) {
      session.checkCount++;

      // Progressive step number logic:
      // Only advance step if progress was verified ('expected') and not complete/error
      if (details.assessment === 'expected' && details.status === 'guide') {
        session.currentStepNumber++;
      }

      // Add to compact history (keep last 5)
      session.history.push({
        turnNumber: session.checkCount,
        instruction: details.instruction,
        assessment: details.assessment,
        status: details.status,
        selectedCandidateText: details.selectedCandidateText,
        timestamp: now
      });

      if (session.history.length > 5) {
        session.history.shift();
      }
    }
  }

  /**
   * Cancels an in-flight request.
   */
  public cancelRequest(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.inFlight = false;
    }
  }

  /**
   * Resets a session cleanly.
   */
  public resetSession(sessionId: string): void {
    const now = Date.now();
    this.sessions.set(sessionId, {
      sessionId,
      checkCount: 0,
      maxChecks: this.defaultMaxChecks,
      lastCheckTime: 0,
      inFlight: false,
      currentStepNumber: 1,
      history: [],
      tutorialSteps: null,
      createdAt: now,
      updatedAt: now
    });
  }

  /**
   * Sets cached tutorial steps for the session.
   */
  public setTutorialSteps(sessionId: string, steps: string | null): void {
    const session = this.getOrCreateSession(sessionId);
    session.tutorialSteps = steps;
    session.updatedAt = Date.now();
  }

  /**
   * Gets cached tutorial steps for the session.
   */
  public getTutorialSteps(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    return session?.tutorialSteps || null;
  }

  /**
   * Evicts sessions inactive for longer than TTL.
   */
  public cleanupExpiredSessions(): number {
    const now = Date.now();
    let evicted = 0;
    for (const [id, session] of this.sessions.entries()) {
      if (now - session.updatedAt > this.sessionTtlMs && !session.inFlight) {
        this.sessions.delete(id);
        evicted++;
      }
    }
    return evicted;
  }
}

export const sessionManager = new SessionManager();
