/**
 * Unit tests for Unstuck Recovery Scenarios & Robust State Invariants
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { validateModelResponse } from '../shared/contracts.js';
import { calculateWindowCrop, mapCroppedBoxToFullCapture } from '../shared/crop-geometry.js';

describe('Recovery Scenarios - Wrong Menu & Wrong Chart Type', () => {
  const sampleCandidates = new Set(['c_insert', 'c_bar', 'c_next', 'c_finish']);

  it('validates a wrong menu recovery response (e.g. Format opened instead of Insert)', () => {
    const rawResponse = {
      assessment: 'unexpected',
      status: 'recover',
      observation: 'The "Format" dropdown menu is currently open.',
      instruction: 'Click "Insert" on the top menu bar to open chart options.',
      selectedCandidateId: 'c_insert',
      expectedOutcome: 'The Insert menu opens displaying the Chart option.',
      reason: 'The Format menu controls cell styles. Charts are created via the Insert menu.'
    };

    const result = validateModelResponse(rawResponse, sampleCandidates);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.guidance.status, 'recover');
      assert.equal(result.guidance.selectedCandidateId, 'c_insert');
      assert.match(result.guidance.instruction, /Insert/);
    }
  });

  it('validates a wrong chart type recovery response (e.g. Pie selected instead of Bar)', () => {
    const rawResponse = {
      assessment: 'unexpected',
      status: 'recover',
      observation: 'The Chart Wizard is open with "Pie" selected.',
      instruction: 'Select "Bar" from the chart type list.',
      selectedCandidateId: 'c_bar',
      expectedOutcome: 'The chart preview switches to a horizontal bar chart.',
      reason: 'The goal specifies a horizontal bar chart.'
    };

    const result = validateModelResponse(rawResponse, sampleCandidates);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.guidance.status, 'recover');
      assert.equal(result.guidance.selectedCandidateId, 'c_bar');
      assert.match(result.guidance.instruction, /Bar/);
    }
  });

  it('validates unselected initial data range recovery (text-only drag guidance)', () => {
    const rawResponse = {
      assessment: 'not_started',
      status: 'guide',
      observation: 'The spreadsheet is open but cells A1:B5 are not selected.',
      instruction: 'Click cell A1 and drag down to cell B5 to highlight the data table.',
      selectedCandidateId: null,
      expectedOutcome: 'Cells A1:B5 are highlighted with a blue selection border.'
    };

    const result = validateModelResponse(rawResponse, sampleCandidates);
    assert.equal(result.valid, true);
    if (result.valid) {
      assert.equal(result.guidance.status, 'guide');
      assert.equal(result.guidance.selectedCandidateId, null);
    }
  });
});

describe('Crop & Coordinate Offset End-to-End Mapping', () => {
  it('combines window crop calculation and box translation accurately', () => {
    // Calc window positioned at logical [x: 80, y: 40, w: 1600, h: 1000]
    // Full display: 2560x1600 @ 1.25 DPI
    const logicalCalcBounds = { left: 80, top: 40, width: 1600, height: 1000 };
    const captureDims = { width: 2560, height: 1600 };
    const scaleFactor = 1.25;

    const cropCalc = calculateWindowCrop(logicalCalcBounds, captureDims, scaleFactor);
    assert.equal(cropCalc.isCropped, true);
    assert.equal(cropCalc.offsetX, 100);
    assert.equal(cropCalc.offsetY, 50);

    // Inside the crop, an OCR word "Insert" is found at [x: 120, y: 30, w: 60, h: 22]
    const wordInCrop = { x: 120, y: 30, width: 60, height: 22 };
    const wordInFullCapture = mapCroppedBoxToFullCapture(wordInCrop, cropCalc.offsetX, cropCalc.offsetY);

    assert.equal(wordInFullCapture.x, 220); // 120 + 100
    assert.equal(wordInFullCapture.y, 80);  // 30 + 50
    assert.equal(wordInFullCapture.width, 60);
    assert.equal(wordInFullCapture.height, 22);

    // Back in logical display coordinates: 220 / 1.25 = 176, 80 / 1.25 = 64
    const logicalX = wordInFullCapture.x / scaleFactor;
    const logicalY = wordInFullCapture.y / scaleFactor;
    assert.equal(logicalX, 176);
    assert.equal(logicalY, 64);
  });
});
