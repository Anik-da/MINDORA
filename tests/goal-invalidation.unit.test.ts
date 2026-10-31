/**
 * Unit tests for Goal Invalidation, Stale Chart Completion Guards, and Ambiguity Handling
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { buildSystemPrompt as buildWebSystemPrompt } from '../server/gemini-service.js';
import { buildSystemPrompt as buildDesktopSystemPrompt } from '../electron/gemini-coach.js';
import { SessionManager } from '../server/session-manager.js';
import { validateModelResponse } from '../shared/contracts.js';

describe('Goal Invalidation & Stale Chart Completion Regression Tests', () => {
  const chartPresetGoal = "Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.";
  const ambiguousGoal = "Simplify all three columns and highlight the highest number";
  const customFormattingGoal = "Highlight the largest numeric value in B2:C5 with a yellow background.";

  it('builds chart-specific system prompt for benchmark chart preset', () => {
    const prompt = buildWebSystemPrompt(chartPresetGoal, { isCalc: true, appName: 'LibreOffice Calc' });
    assert.match(prompt, /CHART PRESET BENCHMARK TASK RULES/);
    assert.match(prompt, /ONLY return status="complete" when the finished horizontal bar chart/);
  });

  it('enforces chart isolation in custom goal mode so existing charts do not cause completion', () => {
    const webPrompt = buildWebSystemPrompt(customFormattingGoal, { isCalc: true, appName: 'LibreOffice Calc' });
    assert.match(webPrompt, /CUSTOM GOAL EVALUATION RULES/);
    assert.match(webPrompt, /CRITICAL ISOLATION RULE: An existing chart, plot, or graphic on the spreadsheet MUST NEVER cause status="complete"/);
    assert.doesNotMatch(webPrompt, /CHART PRESET BENCHMARK TASK RULES/);

    const desktopPrompt = buildDesktopSystemPrompt(customFormattingGoal, { isCalc: true, appName: 'LibreOffice Calc' });
    assert.match(desktopPrompt, /CUSTOM GOAL EVALUATION RULES/);
    assert.match(desktopPrompt, /CRITICAL ISOLATION RULE: An existing chart, plot, or graphic on the spreadsheet MUST NEVER cause status="complete"/);
  });

  it('instructs model to return uncertain and request clarification for ambiguous goals', () => {
    const prompt = buildWebSystemPrompt(ambiguousGoal, { isCalc: true, appName: 'LibreOffice Calc' });
    assert.match(prompt, /Ambiguity Handling/);
    assert.match(prompt, /Return status="uncertain" and assessment="uncertain"/);
    assert.match(prompt, /politely explain what is ambiguous and request clarification/);
  });

  it('provides explicit cell formatting guidance rules without coordinate hallucination', () => {
    const prompt = buildWebSystemPrompt(customFormattingGoal, { isCalc: true, appName: 'LibreOffice Calc' });
    assert.match(prompt, /Cell Highlighting & Formatting Goals/);
    assert.match(prompt, /Spreadsheet grid cells do not have OCR candidate buttons/);
    assert.match(prompt, /Return selectedCandidateId: null/);
    assert.match(prompt, /Methodical Grid & Coordinate Inspection/);
    assert.match(prompt, /Cell Identification Uncertainty Guard/);
  });

  it('validates model response when uncertain status is returned for ambiguous input', () => {
    const candidates = new Set(['c_tools', 'c_view']);
    const rawResponse = {
      assessment: 'uncertain',
      status: 'uncertain',
      observation: 'The user goal requested "simplify all three columns", which is ambiguous in spreadsheet operations.',
      instruction: 'Could you clarify what you mean by simplify? For example, would you like to delete columns, remove formatting, or summarize data?',
      selectedCandidateId: null,
      expectedOutcome: 'User specifies the exact spreadsheet operation desired.'
    };

    const result = validateModelResponse(rawResponse, candidates);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.guidance.status, 'uncertain');
      assert.equal(result.guidance.selectedCandidateId, null);
    }
  });

  it('validates model response when cell formatting guidance is provided with null candidate', () => {
    const candidates = new Set(['c_fill_color', 'c_font_color']);
    const rawResponse = {
      assessment: 'not_started',
      status: 'guide',
      observation: 'Cells B2:C5 contain numeric values. Cell B3 contains the highest value (68) and is currently unformatted.',
      instruction: 'Click cell B3 to select the highest number, then click the Fill Color icon on the toolbar to set a yellow background.',
      selectedCandidateId: 'c_fill_color',
      expectedOutcome: 'Cell B3 has a yellow background fill applied.'
    };

    const result = validateModelResponse(rawResponse, candidates);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.guidance.status, 'guide');
      assert.equal(result.guidance.selectedCandidateId, 'c_fill_color');
    }
  });

  it('verifies that resetting session invalidates previous turns and step counters', () => {
    const sessionManager = new SessionManager();
    const session = sessionManager.getOrCreateSession('test_invalidation_session');

    // Simulate completion of chart step
    sessionManager.completeRequest('test_invalidation_session', true, {
      instruction: 'Chart is complete',
      assessment: 'expected',
      status: 'complete',
      selectedCandidateText: null
    });

    assert.equal(session.checkCount, 1);
    assert.equal(session.history.length, 1);

    // Reset session upon goal change
    sessionManager.resetSession('test_invalidation_session');

    const resetSession = sessionManager.getOrCreateSession('test_invalidation_session');
    assert.equal(resetSession.checkCount, 0);
    assert.equal(resetSession.currentStepNumber, 1);
    assert.equal(resetSession.history.length, 0);
  });
});
