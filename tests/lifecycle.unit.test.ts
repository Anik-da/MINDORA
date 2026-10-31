/**
 * [ARTIFICIAL TEST FIXTURE]
 * Unit tests for MINDORA Request Lifecycle & Session Controller.
 * 
 * NOTE: These are synthetic test fixtures verifying lifecycle and invalidation state machines.
 * Passing these tests does not establish real model accuracy or native capture correctness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionController } from '../shared/lifecycle.js';
import { ValidatedGuidance } from '../shared/contracts.js';

function createDummyGuidance(instruction = 'Click next control'): ValidatedGuidance {
  return {
    assessment: 'expected',
    status: 'guide',
    observation: 'Dummy observation for test',
    instruction,
    targetLabel: 'Target',
    targetBox: [100, 200, 300, 400],
    selectedCandidateId: null,
    expectedOutcome: 'Dummy outcome',
    reason: 'Testing lifecycle',
    hasTargetHighlight: true
  };
}

describe('Request Lifecycle - Request Identity & Enforcing One In-Flight Request', () => {
  it('increments request ID monotonically on each check trigger', () => {
    const controller = new SessionController();
    controller.startSession('Create a horizontal bar chart');

    const check1 = controller.triggerCheck();
    assert.equal(check1.allowed, true);
    if (check1.allowed) {
      assert.equal(check1.requestId, 1);
    }

    // Resolve request 1
    if (check1.allowed) {
      const res = controller.handleResponse({
        sessionId: check1.sessionId,
        requestId: check1.requestId,
        guidance: createDummyGuidance('Step 1')
      });
      assert.equal(res.status, 'applied');
    }

    const check2 = controller.triggerCheck();
    assert.equal(check2.allowed, true);
    if (check2.allowed) {
      assert.equal(check2.requestId, 2);
    }
  });

  it('rejects duplicate check requests while a check is currently in-flight', () => {
    const controller = new SessionController();
    controller.startSession('Create a horizontal bar chart');

    const firstCheck = controller.triggerCheck();
    assert.equal(firstCheck.allowed, true);

    // Immediate second check while first is still pending
    const duplicateCheck = controller.triggerCheck();
    assert.equal(duplicateCheck.allowed, false);
    if (!duplicateCheck.allowed) {
      assert.match(duplicateCheck.reason, /already in-flight/i);
    }
  });
});

describe('Request Lifecycle - Invalidation State Invariants', () => {
  it('discards a response that arrives after user pressed Stop', () => {
    const controller = new SessionController();
    controller.startSession('Create a horizontal bar chart');

    const check = controller.triggerCheck();
    assert.equal(check.allowed, true);

    // User stops the session while the request is in-flight
    controller.stop();
    assert.equal(controller.status, 'stopped');
    assert.equal(controller.activeGuidance, null);

    // Late network response arrives
    if (check.allowed) {
      const lateRes = controller.handleResponse({
        sessionId: check.sessionId,
        requestId: check.requestId,
        guidance: createDummyGuidance('Should be discarded')
      });

      assert.equal(lateRes.status, 'discarded');
      if (lateRes.status === 'discarded') {
        assert.match(lateRes.reason, /No request is currently in-flight/i);
      }
      // Verify guidance was NOT updated
      assert.equal(controller.activeGuidance, null);
    }
  });

  it('discards a response that arrives after user pressed Pause', () => {
    const controller = new SessionController();
    controller.startSession('Create a horizontal bar chart');

    const check = controller.triggerCheck();
    assert.equal(check.allowed, true);

    // User pauses
    controller.pause();
    assert.equal(controller.status, 'paused');

    // Late response arrives
    if (check.allowed) {
      const lateRes = controller.handleResponse({
        sessionId: check.sessionId,
        requestId: check.requestId,
        guidance: createDummyGuidance('Should be discarded on pause')
      });

      assert.equal(lateRes.status, 'discarded');
      assert.equal(controller.activeGuidance, null);
    }
  });

  it('discards a response from a previous session after a new session started', () => {
    const controller = new SessionController();
    controller.startSession('Goal 1');

    const checkSess1 = controller.triggerCheck();
    assert.equal(checkSess1.allowed, true);

    // User restarts / starts a new session
    const newSession = controller.startSession('Goal 2');
    assert.notEqual(newSession.sessionId, (checkSess1 as any).sessionId);

    // Late response from Goal 1 arrives
    if (checkSess1.allowed) {
      const lateRes = controller.handleResponse({
        sessionId: checkSess1.sessionId,
        requestId: checkSess1.requestId,
        guidance: createDummyGuidance('From obsolete session')
      });

      assert.equal(lateRes.status, 'discarded');
      assert.equal(controller.activeGuidance, null);
    }
  });
});
