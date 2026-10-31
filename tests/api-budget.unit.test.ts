/**
 * Unit tests for API Budget Manager
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ApiBudgetManager } from '../shared/api-budget.js';

describe('ApiBudgetManager Unit Tests', () => {
  const tmpBudgetFile = path.resolve(process.cwd(), '.tmp_test_budget.json');

  function cleanup() {
    if (fs.existsSync(tmpBudgetFile)) {
      try { fs.unlinkSync(tmpBudgetFile); } catch {}
    }
  }

  it('initializes with default max budget of 12 and 0 used', () => {
    cleanup();
    const manager = new ApiBudgetManager(tmpBudgetFile);
    const state = manager.getState();
    assert.equal(state.used, 0);
    assert.equal(state.max, 12);
    assert.equal(state.history.length, 0);
    cleanup();
  });

  it('allows request when under budget', () => {
    cleanup();
    const manager = new ApiBudgetManager(tmpBudgetFile);
    const check = manager.checkAllowance();
    assert.equal(check.allowed, true);
    cleanup();
  });

  it('blocks request when budget limit is reached', () => {
    cleanup();
    const manager = new ApiBudgetManager(tmpBudgetFile);
    for (let i = 0; i < 12; i++) {
      manager.recordRequest({ model: 'gemini-3.1-flash-lite', status: 'success' });
    }
    const state = manager.getState();
    assert.equal(state.used, 12);
    const check = manager.checkAllowance();
    assert.equal(check.allowed, false);
    assert.match(check.reason || '', /budget exhausted/i);
    cleanup();
  });

  it('enforces at least 5s interval between requests', () => {
    cleanup();
    const manager = new ApiBudgetManager(tmpBudgetFile);
    manager.recordRequest({ model: 'gemini-3.1-flash-lite', status: 'success' });
    // Immediate second check should be rejected due to rate pacing
    const check = manager.checkAllowance();
    assert.equal(check.allowed, false);
    assert.match(check.reason || '', /rate pacing/i);
    assert.ok(check.waitMs && check.waitMs > 0);
    cleanup();
  });

  it('resets budget cleanly', () => {
    cleanup();
    const manager = new ApiBudgetManager(tmpBudgetFile);
    manager.recordRequest({ model: 'gemini-3.1-flash-lite', status: 'success' });
    assert.equal(manager.getState().used, 1);
    manager.resetBudget();
    assert.equal(manager.getState().used, 0);
    cleanup();
  });
});

import { InteractiveSessionBudget } from '../shared/api-budget.js';

describe('InteractiveSessionBudget Unit Tests', () => {
  it('initializes with default session limit of 15 and 0 used', () => {
    const session = new InteractiveSessionBudget();
    assert.equal(session.getState().used, 0);
    assert.equal(session.getState().max, 15);
    assert.equal(session.getRemaining(), 15);
  });

  it('allows request when within session limit', () => {
    const session = new InteractiveSessionBudget();
    assert.equal(session.checkAllowance().allowed, true);
  });

  it('blocks request when session limit is reached with understandable message', () => {
    const session = new InteractiveSessionBudget(3);
    session.recordRequest();
    session.recordRequest();
    session.recordRequest();
    assert.equal(session.getRemaining(), 0);
    const check = session.checkAllowance();
    assert.equal(check.allowed, false);
    assert.match(check.reason || '', /session check limit reached/i);
    assert.match(check.reason || '', /Ctrl\+Alt\+R/i);
  });

  it('resets session without touching disk or automated budget', () => {
    const session = new InteractiveSessionBudget(5);
    session.recordRequest();
    assert.equal(session.getRemaining(), 4);
    session.resetSession();
    assert.equal(session.getRemaining(), 5);
    assert.equal(session.getState().used, 0);
  });
});
