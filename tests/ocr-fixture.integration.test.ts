/**
 * [AUTOMATED TEST SUITE]
 * Unit tests for Local OCR Target Resolver
 * 
 * Verifies that the OCR resolver:
 * 1. Correctly resolves target labels (Insert, Format, Styles, Sheet) on test captures.
 * 2. Returns 'unresolved' for missing or non-existent labels.
 * 3. Returns 'unresolved' for empty strings.
 * 4. Never produces guessed coordinates or fallback rectangles.
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveTargetInCapture, terminateTesseractWorker } from '../electron/target-resolver.js';

describe('Local OCR Target Resolver - Verification', () => {
  const fixturePath = [path.resolve(process.cwd(), 'captures', 'calc-test.png'), path.resolve(process.cwd(), 'fixtures', 'calc-test.png')].find((candidate) => fs.existsSync(candidate)) || path.resolve(process.cwd(), 'fixtures', 'calc-test.png');
  const fixtureExists = fs.existsSync(fixturePath);

  after(async () => {
    await terminateTesseractWorker();
  });

  it('rejects empty target label immediately as unresolved', async () => {
    const fakeBuffer = Buffer.from('empty');
    const result = await resolveTargetInCapture(fakeBuffer, '   ');
    assert.equal(result.status, 'unresolved');
    if (result.status === 'unresolved') {
      assert.match(result.reason, /cannot be empty/i);
    }
  });

  if (fixtureExists) {
    const fixtureBuffer = fs.readFileSync(fixturePath);

    it('resolves "Insert" conservatively with high confidence', async () => {
      const result = await resolveTargetInCapture(fixtureBuffer, 'Insert');
      assert.equal(result.status, 'resolved');
      if (result.status === 'resolved') {
        assert.equal(result.label, 'Insert');
        assert.ok(result.confidence >= 60, `Confidence was ${result.confidence}`);
        assert.ok(result.pixelBbox.width > 0);
        assert.ok(result.pixelBbox.height > 0);
        // Menu item expected in upper menu area (y < 100)
        assert.ok(result.pixelBbox.y < 100, `Expected y < 100, got ${result.pixelBbox.y}`);
      }
    });

    it('resolves "Format" conservatively with high confidence', async () => {
      const result = await resolveTargetInCapture(fixtureBuffer, 'Format');
      assert.equal(result.status, 'resolved');
      if (result.status === 'resolved') {
        assert.equal(result.label, 'Format');
        assert.ok(result.confidence >= 60);
        assert.ok(result.pixelBbox.y < 100);
      }
    });

    it('resolves "Styles" conservatively with high confidence', async () => {
      const result = await resolveTargetInCapture(fixtureBuffer, 'Styles');
      assert.equal(result.status, 'resolved');
      if (result.status === 'resolved') {
        assert.equal(result.label, 'Styles');
        assert.ok(result.confidence >= 60);
        assert.ok(result.pixelBbox.y < 100);
      }
    });

    it('resolves "Sheet" conservatively with high confidence', async () => {
      const result = await resolveTargetInCapture(fixtureBuffer, 'Sheet');
      assert.equal(result.status, 'resolved');
      if (result.status === 'resolved') {
        assert.equal(result.label, 'Sheet');
        assert.ok(result.confidence >= 60);
        assert.ok(result.pixelBbox.y < 100);
      }
    });

    it('returns "unresolved" for missing or non-existent labels', async () => {
      const result = await resolveTargetInCapture(fixtureBuffer, 'NonExistentControlXYZ');
      assert.equal(result.status, 'unresolved');
      if (result.status === 'unresolved') {
        assert.match(result.reason, /not detected in capture/i);
      }
    });
  }
});
