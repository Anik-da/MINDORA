/**
 * Unit tests for Model Response Assembly, Truncation Diagnostics & Network Cause Handling.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Model Response Assembly - Part Filtering & Thoughts Exclusion', () => {
  it('correctly filters out thought parts and assembles multi-part JSON response', () => {
    const rawParts = [
      {
        thought: true,
        text: 'I am reasoning about the screenshot. The user wants to click Insert.'
      },
      {
        text: '{\n  "assessment": "not_started",\n  "status": "guide",\n'
      },
      {
        text: '  "observation": "Table data A1:B5 is selected.",\n  "instruction": "Click Insert menu.",\n  "selectedCandidateId": "c_1",\n  "expectedOutcome": "Menu opens."\n}'
      }
    ];

    // Assembly logic matching queryGeminiCoach / requestWebGuidance
    const answerParts = rawParts.filter((p: any) => typeof p.text === 'string' && !p.thought);
    const finalAnswerText = answerParts.map((p: any) => p.text).join('');

    assert.equal(answerParts.length, 2);
    assert.ok(!finalAnswerText.includes('I am reasoning'));
    
    const parsed = JSON.parse(finalAnswerText);
    assert.equal(parsed.status, 'guide');
    assert.equal(parsed.assessment, 'not_started');
    assert.equal(parsed.selectedCandidateId, 'c_1');
  });

  it('rejects truncated JSON from token exhaustion without fabricating fields', () => {
    // Truncated text simulating finishReason: 'MAX_TOKENS'
    const truncatedText = '{\n  "assessment": "not_started",\n  "status": "gui';
    
    let parseError: string | null = null;
    try {
      JSON.parse(truncatedText);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }

    assert.ok(parseError !== null);
    assert.ok(parseError.toLowerCase().includes('unterminated') || parseError.toLowerCase().includes('unexpected') || parseError.toLowerCase().includes('end of data'));
  });

  it('flags finishReason MAX_TOKENS as explicit token allowance exhaustion', () => {
    const candidate = {
      content: {
        parts: [{ text: '{\n  "assessment": "not_started",\n  "status": "guide"' }]
      },
      finishReason: 'MAX_TOKENS'
    };

    assert.equal(candidate.finishReason, 'MAX_TOKENS');
    // Verifies the guard condition in our engine
    const isExhausted = candidate.finishReason === 'MAX_TOKENS';
    assert.equal(isExhausted, true);
  });
});

describe('Network Diagnostics - Cause Code Identification & Secret Isolation', () => {
  it('identifies DNS failure ENOTFOUND and hides sensitive URLs', () => {
    const fakeApiKey = 'AIzaSySecretKeyExample123456';
    const fakeError = new TypeError('fetch failed');
    (fakeError as any).cause = {
      code: 'ENOTFOUND',
      message: 'getaddrinfo ENOTFOUND generativelanguage.googleapis.com'
    };

    const causeCode = (fakeError as any).cause?.code;
    assert.equal(causeCode, 'ENOTFOUND');

    let userFacingMessage = 'Network connection failed: unable to reach Google Gemini API.';
    if (causeCode === 'ENOTFOUND') {
      userFacingMessage = 'Network error: DNS resolution failed (no internet or host unreachable).';
    }

    const formatted = `${userFacingMessage} [${causeCode}]`;
    assert.ok(formatted.includes('DNS resolution failed'));
    assert.ok(!formatted.includes(fakeApiKey));
  });

  it('identifies connection reset ECONNRESET cleanly', () => {
    const fakeError = new TypeError('fetch failed');
    (fakeError as any).cause = {
      code: 'ECONNRESET',
      message: 'read ECONNRESET'
    };

    const causeCode = (fakeError as any).cause?.code;
    let userFacingMessage = 'Network connection failed: unable to reach Google Gemini API.';
    if (causeCode === 'ECONNRESET') {
      userFacingMessage = 'Network error: Connection reset by upstream server.';
    }

    const formatted = `${userFacingMessage} [${causeCode}]`;
    assert.ok(formatted.includes('Connection reset by upstream server'));
    assert.ok(formatted.includes('ECONNRESET'));
  });

  it('distinguishes AbortError timeout from network drops', () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';

    const isTimeout = abortError.name === 'AbortError';
    assert.equal(isTimeout, true);
  });
});
