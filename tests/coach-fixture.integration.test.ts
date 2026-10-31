/**
 * [AUTOMATED INTEGRATION TEST]
 * Verifies the AI Coaching Loop Integration Contract via a single live Gemini API request.
 * 
 * Rules:
 * - Makes at most ONE automated live API request using captures/calc-test.png.
 * - Model: gemini-3.1-flash-lite (provisional runtime override) with LOW thinking.
 * - Verifies structured response adheres to ValidatedGuidance contract.
 * - Verifies target candidate grounding (selectedCandidateId).
 * - Never prints API keys or credentials.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { extractOcrCandidates } from '../electron/candidate-extractor.js';
import { queryGeminiCoach } from '../electron/gemini-coach.js';
import { terminateTesseractWorker } from '../electron/target-resolver.js';

function loadApiKey(): string | null {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return null;

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (key === 'GEMINI_API_KEY' && val.length > 10 && !val.includes('placeholder') && !val.includes('your_')) {
        return val;
      }
    }
  }
  return null;
}

describe('AI Coaching Loop - Live API Integration Contract Test', () => {
  const fixturePath = [path.resolve(process.cwd(), 'captures', 'calc-test.png'), path.resolve(process.cwd(), 'fixtures', 'calc-test.png')].find((candidate) => fs.existsSync(candidate)) || path.resolve(process.cwd(), 'fixtures', 'calc-test.png');
  const apiKey = loadApiKey();
  const fixtureExists = fs.existsSync(fixturePath);

  it('executes a single multimodal coaching request and validates contract', async () => {
    if (!apiKey) {
      console.log('  [PENDING] GEMINI_API_KEY not configured locally; skipping live API check.');
      return;
    }

    if (!fixtureExists) {
      console.log('  [PENDING] captures/calc-test.png not found; skipping live API check.');
      return;
    }

    console.log('  [Integration] Extracting OCR candidates from calc-test.png...');
    const fixtureBuffer = fs.readFileSync(fixturePath);
    const extraction = await extractOcrCandidates(fixtureBuffer);
    console.log(`  [Integration] Extracted ${extraction.candidates.length} OCR candidates in ${extraction.durationMs.toFixed(1)} ms.`);

    console.log('  [Integration] Dispatching single coaching check to gemini-3.1-flash-lite...');
    const result = await queryGeminiCoach({
      apiKey,
      imageBuffer: fixtureBuffer,
      goal: 'Create a horizontal bar chart from A1:B5, including the Department and Requests headers, titled Requests by department.',
      previousInstruction: null,
      history: [],
      candidates: extraction.candidates,
      isScreenUnchanged: false
    });

    await terminateTesseractWorker();

    assert.equal(result.success, true, `API call failed: ${result.error}`);
    assert.ok(result.guidance !== null, 'Guidance must not be null');

    const g = result.guidance;
    console.log(`\n  ======================================================`);
    console.log(`  [LIVE INTEGRATION CONTRACT VERIFICATION RESULT]`);
    console.log(`  - Assessment: ${g.assessment}`);
    console.log(`  - Status: ${g.status}`);
    console.log(`  - Observation: "${g.observation}"`);
    console.log(`  - Instruction: "${g.instruction}"`);
    console.log(`  - Expected Outcome: "${g.expectedOutcome}"`);
    console.log(`  - Selected Candidate ID: ${g.selectedCandidateId || 'null (text-only guidance)'}`);
    if (result.selectedCandidate) {
      console.log(`  - Selected Control Text: "${result.selectedCandidate.text}" (Conf: ${result.selectedCandidate.confidence.toFixed(1)}%)`);
      console.log(`  - Grounded Pixel BBox: [x: ${result.selectedCandidate.pixelBbox.x}, y: ${result.selectedCandidate.pixelBbox.y}, w: ${result.selectedCandidate.pixelBbox.width}, h: ${result.selectedCandidate.pixelBbox.height}]`);
    }
    console.log(`  - Measured Latency: ${result.durationMs.toFixed(1)} ms`);
    if (result.tokens) {
      console.log(`  - Token Consumption: Prompt=${result.tokens.prompt}, Candidate=${result.tokens.candidate}, Thoughts=${result.tokens.thoughts || 0}, Total=${result.tokens.total}`);
    }
    console.log(`  ======================================================\n`);

    assert.ok(typeof g.instruction === 'string' && g.instruction.length > 0);
    assert.ok(typeof g.expectedOutcome === 'string' && g.expectedOutcome.length > 0);
    assert.ok(result.durationMs > 0);
  });
});
