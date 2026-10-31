import * as fs from 'node:fs';
import * as path from 'node:path';

async function run() {
  const unformattedPath = path.resolve('fixtures', 'calc-three-column-unformatted.png');
  const formattedPath = path.resolve('fixtures', 'calc-three-column-formatted.png');

  if (!fs.existsSync(unformattedPath) || !fs.existsSync(formattedPath)) {
    console.error('Fixture files missing!');
    process.exit(1);
  }

  const unformattedBase64 = fs.readFileSync(unformattedPath).toString('base64');
  const formattedBase64 = fs.readFileSync(formattedPath).toString('base64');

  const sessionId = 'test-three-col-' + Date.now();
  const goal = 'Highlight the largest numeric value in B2:C5 with a yellow background.';

  console.log('=== TEST 1: Initial Guidance on 3-Column Table (Unformatted C5) ===');
  console.log('Goal:', goal);
  console.log('Resetting session for sessionId:', sessionId);

  await fetch('http://localhost:8080/api/session/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });

  const res1 = await fetch('http://localhost:8080/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      goal,
      imageBase64: unformattedBase64,
      history: []
    })
  });

  const data1 = await res1.json();
  console.log('Status HTTP:', res1.status);
  console.log('Guidance 1 Result:');
  console.log(JSON.stringify(data1.guidance, null, 2));

  // Wait 5.5s to respect rate pacing
  console.log('\nPacing wait (5.5s)...');
  await new Promise(r => setTimeout(r, 5500));

  console.log('\n=== TEST 2: Progress Check on Formatted State (C5 has Yellow Background) ===');
  console.log('Goal:', goal);
  console.log('Preserving Turn 1 history...');

  const turn1Guidance = data1.guidance;
  const history = [
    {
      turnNumber: 1,
      instruction: turn1Guidance.instruction,
      assessment: turn1Guidance.assessment,
      status: turn1Guidance.status,
      selectedCandidateText: turn1Guidance.targetLabel
    }
  ];

  const res2 = await fetch('http://localhost:8080/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      goal,
      imageBase64: formattedBase64,
      previousInstruction: turn1Guidance.instruction,
      history
    })
  });

  const data2 = await res2.json();
  console.log('Status HTTP:', res2.status);
  console.log('Guidance 2 Result:');
  console.log(JSON.stringify(data2.guidance, null, 2));
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
