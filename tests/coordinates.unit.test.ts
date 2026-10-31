/**
 * [ARTIFICIAL TEST FIXTURE]
 * Unit tests for Unstuck Coordinate Conversion Module.
 * 
 * NOTE: These are synthetic test fixtures verifying mathematical transformations.
 * Passing these tests does not establish real model accuracy or native OS capture correctness.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertTargetBox,
  validateNormalizedBox,
  validateCaptureAndDisplay,
  mapToDisplayLogical,
  mapToCapturePixels,
  mapLogicalToOverlay,
  pixelRectToNormalizedBox,
  convertCapturePixelRect,
  NormalizedBox,
  DisplayBounds,
  CaptureDimensions
} from '../shared/coordinates.js';

describe('Coordinate Conversion - Validation Guards', () => {
  it('rejects non-array inputs', () => {
    const res = validateNormalizedBox('not-an-array');
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.match(res.error, /must be an array of 4 numbers/i);
    }
  });

  it('rejects array with wrong length', () => {
    const res = validateNormalizedBox([10, 20, 30]);
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.match(res.error, /must have exactly 4 numbers/i);
    }
  });

  it('rejects NaN or non-finite values', () => {
    const res = validateNormalizedBox([NaN, 10, 100, 200]);
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.match(res.error, /not a finite number/i);
    }
  });

  it('rejects coordinates outside 0..1000 range', () => {
    const res1 = validateNormalizedBox([-5, 10, 100, 200]);
    assert.equal(res1.valid, false);
    const res2 = validateNormalizedBox([10, 10, 1050, 200]);
    assert.equal(res2.valid, false);
  });

  it('rejects inverted or zero-area boxes', () => {
    // Inverted y: ymin > ymax
    const invY = validateNormalizedBox([300, 100, 200, 400]);
    assert.equal(invY.valid, false);
    if (!invY.valid) assert.match(invY.error, /strictly less than ymax/i);

    // Inverted x: xmin > xmax
    const invX = validateNormalizedBox([100, 500, 300, 400]);
    assert.equal(invX.valid, false);
    if (!invX.valid) assert.match(invX.error, /strictly less than xmax/i);

    // Zero-height box: ymin === ymax
    const zeroH = validateNormalizedBox([100, 100, 100, 200]);
    assert.equal(zeroH.valid, false);

    // Zero-width box: xmin === xmax
    const zeroW = validateNormalizedBox([100, 100, 200, 100]);
    assert.equal(zeroW.valid, false);
  });

  it('rejects aspect ratio mismatches between capture and display', () => {
    // 16:9 capture (1920x1080) on 16:10 display (2048x1280)
    const capture: CaptureDimensions = { width: 1920, height: 1080 };
    const display: DisplayBounds = { x: 0, y: 0, width: 2048, height: 1280 };
    const res = validateCaptureAndDisplay(capture, display);
    assert.equal(res.valid, false);
    if (!res.valid) {
      assert.match(res.error, /does not match display aspect ratio/i);
    }
  });
});

describe('Coordinate Conversion - Reported 125% Display Configuration', () => {
  // Baseline reported from environment:
  // Physical capture: 2560 x 1600 (aspect 1.6)
  // Logical monitor: x=0, y=0, width=2048, height=1280 (aspect 1.6)
  const capture: CaptureDimensions = { width: 2560, height: 1600 };
  const display: DisplayBounds = { x: 0, y: 0, width: 2048, height: 1280 };
  const testBox: NormalizedBox = [100, 200, 300, 600]; // ymin=100, xmin=200, ymax=300, xmax=600

  it('correctly maps box to physical capture pixels', () => {
    const pixels = mapToCapturePixels(testBox, capture);
    assert.equal(pixels.x, (200 / 1000) * 2560); // 512
    assert.equal(pixels.y, (100 / 1000) * 1600); // 160
    assert.equal(pixels.width, ((600 - 200) / 1000) * 2560); // 1024
    assert.equal(pixels.height, ((300 - 100) / 1000) * 1600); // 320
  });

  it('correctly maps box to logical OS display bounds (accounting for 125% DPI scale)', () => {
    const logical = mapToDisplayLogical(testBox, display);
    assert.equal(logical.x, (200 / 1000) * 2048); // 409.6
    assert.equal(logical.y, (100 / 1000) * 1280); // 128
    assert.equal(logical.width, ((600 - 200) / 1000) * 2048); // 819.2
    assert.equal(logical.height, ((300 - 100) / 1000) * 1280); // 256

    // Ratio between physical capture pixel and logical coord equals exactly 1.25 (125% DPI scale factor)
    const pixels = mapToCapturePixels(testBox, capture);
    assert.equal(pixels.width / logical.width, 1.25);
    assert.equal(pixels.height / logical.height, 1.25);
  });
});

describe('Coordinate Conversion - Proportionally Downscaled Captures', () => {
  const display: DisplayBounds = { x: 0, y: 0, width: 2048, height: 1280 };
  const testBox: NormalizedBox = [250, 150, 450, 750];

  it('maps full-resolution (2560x1600) and downscaled (1280x800) captures to identical logical targets', () => {
    const fullCapture: CaptureDimensions = { width: 2560, height: 1600 };
    const halfCapture: CaptureDimensions = { width: 1280, height: 800 };

    const fullResult = convertTargetBox(testBox, fullCapture, display);
    const halfResult = convertTargetBox(testBox, halfCapture, display);

    assert.equal(fullResult.valid, true);
    assert.equal(halfResult.valid, true);

    if (fullResult.valid && halfResult.valid) {
      // Logical coordinates must match exactly regardless of capture scale
      assert.equal(fullResult.value.displayLogical.x, halfResult.value.displayLogical.x);
      assert.equal(fullResult.value.displayLogical.y, halfResult.value.displayLogical.y);
      assert.equal(fullResult.value.displayLogical.width, halfResult.value.displayLogical.width);
      assert.equal(fullResult.value.displayLogical.height, halfResult.value.displayLogical.height);
    }
  });
});

describe('Coordinate Conversion - Arbitrary & Negative Display Origins', () => {
  const capture: CaptureDimensions = { width: 1920, height: 1080 };
  const testBox: NormalizedBox = [200, 300, 400, 700];

  it('correctly handles non-zero positive origin (e.g. secondary display on right)', () => {
    const display: DisplayBounds = { x: 2560, y: 100, width: 1920, height: 1080 };
    const logical = mapToDisplayLogical(testBox, display);

    assert.equal(logical.x, 2560 + (300 / 1000) * 1920); // 3136
    assert.equal(logical.y, 100 + (200 / 1000) * 1080); // 316
  });

  it('correctly handles negative origin (e.g. secondary display on left)', () => {
    const display: DisplayBounds = { x: -1920, y: -200, width: 1920, height: 1080 };
    const logical = mapToDisplayLogical(testBox, display);

    assert.equal(logical.x, -1920 + (300 / 1000) * 1920); // -1344
    assert.equal(logical.y, -200 + (200 / 1000) * 1080); // 16
  });
});

describe('Coordinate Conversion - Overlay Origin Offsets', () => {
  const logicalTarget = { x: 500, y: 300, width: 200, height: 100 };

  it('correctly computes overlay-relative position when overlay has custom origin', () => {
    const overlayOrigin = { x: 100, y: 50 };
    const local = mapLogicalToOverlay(logicalTarget, overlayOrigin);

    assert.equal(local.x, 400); // 500 - 100
    assert.equal(local.y, 250); // 300 - 50
    assert.equal(local.width, 200);
    assert.equal(local.height, 100);
  });
});

describe('Coordinate Conversion - Pixel Rect to Normalized & Overlay Conversion', () => {
  const capture: CaptureDimensions = { width: 2560, height: 1600 };
  const display: DisplayBounds = { x: 0, y: 0, width: 2048, height: 1280 };

  it('converts capture pixel rect to normalized bounding box accurately', () => {
    // 2560x1600 image; pixel rect x: 256, y: 160, width: 512, height: 320
    const pixelRect = { x: 256, y: 160, width: 512, height: 320 };
    const norm = pixelRectToNormalizedBox(pixelRect, capture);
    assert.equal(norm.valid, true);
    if (norm.valid) {
      assert.equal(norm.value[0], 100); // ymin: 160 / 1600 * 1000 = 100
      assert.equal(norm.value[1], 100); // xmin: 256 / 2560 * 1000 = 100
      assert.equal(norm.value[2], 300); // ymax: (160 + 320) / 1600 * 1000 = 300
      assert.equal(norm.value[3], 300); // xmax: (256 + 512) / 2560 * 1000 = 300
    }
  });

  it('converts capture pixel rect directly into logical overlay coordinates', () => {
    const pixelRect = { x: 256, y: 160, width: 512, height: 320 };
    const res = convertCapturePixelRect(pixelRect, capture, display);
    assert.equal(res.valid, true);
    if (res.valid) {
      // 125% scale factor: 256px / 1.25 = 204.8 logical
      assert.equal(res.value.displayLogical.x, 204.8);
      assert.equal(res.value.displayLogical.y, 128);
      assert.equal(res.value.displayLogical.width, 409.6);
      assert.equal(res.value.displayLogical.height, 256);
      // overlayLocal equals displayLogical when origin is 0,0
      assert.equal(res.value.overlayLocal.x, 204.8);
      assert.equal(res.value.overlayLocal.y, 128);
    }
  });
});
