/**
 * Unit tests for Crop Geometry & Offset Mapping
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { calculateWindowCrop, mapCroppedBoxToFullCapture } from '../shared/crop-geometry.js';

describe('Crop Geometry Unit Tests', () => {
  const captureDims = { width: 2560, height: 1600 };
  const scaleFactor = 1.25;

  it('calculates accurate physical pixel crop for normal window bounds', () => {
    // Logical window: left=100, top=50, width=1200, height=800
    // At 1.25 scale: x=125, y=63, width=1500, height=1000
    const crop = calculateWindowCrop(
      { left: 100, top: 50, width: 1200, height: 800 },
      captureDims,
      scaleFactor
    );

    assert.equal(crop.isCropped, true);
    assert.equal(crop.offsetX, 125);
    assert.equal(crop.offsetY, 63);
    assert.equal(crop.cropRect.width, 1500);
    assert.equal(crop.cropRect.height, 1000);
  });

  it('clamps window extending past right/bottom monitor edge', () => {
    // Window partially offscreen: left=1800, top=1000, width=800, height=800
    // At 1.25: x=2250, y=1250. Max remaining width = 2560 - 2250 = 310
    const crop = calculateWindowCrop(
      { left: 1800, top: 1000, width: 800, height: 800 },
      captureDims,
      scaleFactor
    );

    assert.equal(crop.isCropped, true);
    assert.equal(crop.offsetX, 2250);
    assert.equal(crop.offsetY, 1250);
    assert.equal(crop.cropRect.width, 310);
    assert.equal(crop.cropRect.height, 350);
  });

  it('falls back to full capture if window bounds are invalid or zero', () => {
    const crop = calculateWindowCrop(
      { left: 0, top: 0, width: 0, height: 0 },
      captureDims,
      scaleFactor
    );

    assert.equal(crop.isCropped, false);
    assert.equal(crop.offsetX, 0);
    assert.equal(crop.offsetY, 0);
    assert.equal(crop.cropRect.width, 2560);
    assert.equal(crop.cropRect.height, 1600);
  });

  it('falls back to full capture if crop dimensions are too tiny (<100px)', () => {
    const crop = calculateWindowCrop(
      { left: 100, top: 100, width: 50, height: 50 },
      captureDims,
      scaleFactor
    );

    assert.equal(crop.isCropped, false);
    assert.equal(crop.offsetX, 0);
    assert.equal(crop.offsetY, 0);
  });

  it('correctly maps cropped bounding box back to full capture coordinates', () => {
    const boxInCrop = { x: 50, y: 30, width: 80, height: 24 };
    const mapped = mapCroppedBoxToFullCapture(boxInCrop, 200, 100);

    assert.equal(mapped.x, 250);
    assert.equal(mapped.y, 130);
    assert.equal(mapped.width, 80);
    assert.equal(mapped.height, 24);
  });
});
