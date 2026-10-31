/**
 * [ARTIFICIAL TEST FIXTURE]
 * Unit tests for Unstuck Response Contract & Model Validation Module.
 * 
 * NOTE: These are synthetic test fixtures verifying schema integrity.
 * Passing these tests does not establish real model accuracy or native capture correctness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateModelResponse } from '../shared/contracts.js';

describe('Response Contract - Valid Payloads', () => {
  it('validates a standard guide response with targetBox', () => {
    const raw = {
      assessment: 'not_started',
      status: 'guide',
      observation: 'The Calc window is visible with tabular data.',
      instruction: 'Click on the Insert menu.',
      targetLabel: 'Insert',
      targetBox: [20, 140, 55, 190],
      expectedOutcome: 'The Insert menu dropdown opens.',
      reason: 'The chart tool is located inside the Insert menu.'
    };

    const res = validateModelResponse(raw);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.assessment, 'not_started');
      assert.equal(res.guidance.status, 'guide');
      assert.equal(res.guidance.hasTargetHighlight, true);
      assert.deepEqual(res.guidance.targetBox, [20, 140, 55, 190]);
      assert.equal(res.guidance.targetLabel, 'Insert');
    }
  });

  it('validates a recovery response with deviation instruction', () => {
    const raw = {
      assessment: 'unexpected',
      status: 'recover',
      observation: 'The Chart Wizard is open with Pie chart selected instead of Bar.',
      instruction: 'Select "Bar" from the chart type list.',
      targetLabel: 'Bar',
      targetBox: [120, 80, 160, 220],
      expectedOutcome: 'The chart type switches to horizontal Bar.',
      reason: 'The requested goal specifies a horizontal bar chart.'
    };

    const res = validateModelResponse(raw);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.status, 'recover');
      assert.equal(res.guidance.hasTargetHighlight, true);
      assert.deepEqual(res.guidance.targetBox, [120, 80, 160, 220]);
    }
  });
});

describe('Response Contract - Uncertain & Completed Highlight Suppression', () => {
  it('ensures uncertain status NEVER produces a target highlight even if model returned coordinates', () => {
    const raw = {
      assessment: 'uncertain',
      status: 'uncertain',
      observation: 'The spreadsheet window is partially minimized or occluded.',
      instruction: 'Bring the LibreOffice Calc window into focus on the main screen.',
      targetLabel: 'Window',
      targetBox: [100, 200, 300, 400], // Model incorrectly returned guessed coordinates
      expectedOutcome: 'The full Calc spreadsheet is visible.',
      reason: null
    };

    const res = validateModelResponse(raw);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.status, 'uncertain');
      assert.equal(res.guidance.hasTargetHighlight, false);
      assert.equal(res.guidance.targetBox, null); // Highlight box strictly suppressed
    }
  });

  it('ensures complete status NEVER produces a target highlight', () => {
    const raw = {
      assessment: 'expected',
      status: 'complete',
      observation: 'Horizontal bar chart titled "Requests by department" is rendered on sheet.',
      instruction: 'Task complete! You may end the session.',
      targetLabel: null,
      targetBox: [400, 300, 700, 800],
      expectedOutcome: 'Finished task.',
      reason: 'All requirements met.'
    };

    const res = validateModelResponse(raw);
    assert.equal(res.valid, true);
    if (res.valid) {
      assert.equal(res.guidance.status, 'complete');
      assert.equal(res.guidance.hasTargetHighlight, false);
      assert.equal(res.guidance.targetBox, null);
    }
  });
});

describe('Response Contract - Rejection of Malformed Responses', () => {
  it('rejects non-object responses', () => {
    assert.equal(validateModelResponse(null).valid, false);
    assert.equal(validateModelResponse('string').valid, false);
    assert.equal(validateModelResponse([1, 2, 3]).valid, false);
  });

  it('rejects invalid enum values for assessment and status', () => {
    const raw = {
      assessment: 'hallucinated_assessment',
      status: 'guide',
      observation: 'Some observation',
      instruction: 'Some instruction',
      expectedOutcome: 'Some outcome'
    };
    const res1 = validateModelResponse(raw);
    assert.equal(res1.valid, false);
    if (!res1.valid) {
      assert.ok(res1.errors.some(e => e.includes('Invalid or missing assessment')));
    }

    const raw2 = { ...raw, assessment: 'expected', status: 'unknown_status' };
    const res2 = validateModelResponse(raw2);
    assert.equal(res2.valid, false);
    if (!res2.valid) {
      assert.ok(res2.errors.some(e => e.includes('Invalid or missing status')));
    }
  });

  it('rejects missing or empty required string fields', () => {
    const base = {
      assessment: 'not_started',
      status: 'guide',
      observation: '   ',
      instruction: '',
      expectedOutcome: 'Outcome'
    };
    const res = validateModelResponse(base);
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.ok(res.errors.some(e => e.includes('Observation must be a non-empty string')));
      assert.ok(res.errors.some(e => e.includes('Instruction must be a non-empty string')));
    }
  });

  it('rejects malformed targetBox when status is guide', () => {
    const raw = {
      assessment: 'not_started',
      status: 'guide',
      observation: 'Observation text',
      instruction: 'Click menu',
      expectedOutcome: 'Outcome text',
      targetBox: [500, 200, 100, 300] // Inverted: ymin (500) > ymax (100)
    };
    const res = validateModelResponse(raw);
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.ok(res.errors.some(e => e.includes('Invalid targetBox')));
    }
  });
});
