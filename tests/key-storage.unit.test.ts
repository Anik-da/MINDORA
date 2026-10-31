import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { maskKey, saveKey, getKeyStatus, removeKey, testKeyConnection } from '../electron/key-storage.js';

describe('Gemini API Key Secure Storage & Secret Isolation Unit Tests', () => {
  it('masks API keys securely, never exposing more than the last 4 characters', () => {
    assert.equal(maskKey('AIzaSyD-sample1234567890ABCD'), '••••••••ABCD');
    assert.equal(maskKey('short'), '••••••••');
    assert.equal(maskKey(''), '••••••••');
  });

  it('rejects malformed, empty, or whitespace keys on save', () => {
    const emptyResult = saveKey('');
    assert.equal(emptyResult.success, false);
    assert.match(emptyResult.error || '', /invalid/i);

    const spaceResult = saveKey('AIzaSy space in key');
    assert.equal(spaceResult.success, false);

    const shortResult = saveKey('AIzaSyShort');
    assert.equal(shortResult.success, false);
  });

  it('saves and clears key safely and reports masked status without leaking secret', () => {
    const dummyKey = 'AIzaSySampleKeyForTest123456789XYZ';
    const saveRes = saveKey(dummyKey);
    assert.equal(saveRes.success, true);

    const status = getKeyStatus();
    assert.equal(status.configured, true);
    assert.ok(status.maskedKey?.endsWith('9XYZ'));
    assert.doesNotMatch(status.maskedKey || '', /AIzaSySampleKeyForTest/);

    // Remove key
    const removeRes = removeKey();
    assert.equal(removeRes, true);

    const afterRemoveStatus = getKeyStatus();
    // If local dev .env exists, status might fall back to env; otherwise none
    if (afterRemoveStatus.source === 'env') {
      assert.equal(afterRemoveStatus.configured, true);
    } else {
      assert.equal(afterRemoveStatus.configured, false);
      assert.equal(afterRemoveStatus.maskedKey, null);
    }
  });

  it('testKeyConnection rejects empty and invalid keys without network transmission', async () => {
    const emptyTest = await testKeyConnection('');
    assert.equal(emptyTest.success, false);
    assert.match(emptyTest.error || '', /enter/i);

    const invalidTest = await testKeyConnection('short key with spaces');
    assert.equal(invalidTest.success, false);
    assert.match(invalidTest.error || '', /invalid/i);
  });
});
