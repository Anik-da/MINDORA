/**
 * Bounded live verification of changed-goal handling and chart completion isolation
 * Spends at most 2 HTTP attempts against the local server /api/check.
 */

import fs from 'node:fs';
import path from 'node:path';

async function main() {
  const chartFixturePath = path.resolve('fixtures/calc-clean-bar-chart.png');
  const imageBuffer = fs.readFileSync(chartFixturePath);
  const base64Image = imageBuffer.toString('base64');

  console.log('=== TEST 1: Ambiguous Goal with Chart Screenshot ===');
  const goal1 = "Simplify all three columns and highlight the highest number";
  const res1 = await fetch('http://localhost:8080/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'verify_ambiguous_goal',
      goal: goal1,
      imageBase64: base64Image
    })
  });

  const data1 = await res1.json();
  console.log('HTTP Status:', res1.status);
  console.log('Success:', data1.success);
  console.log('Status returned:', data1.guidance?.status);
  console.log('Assessment returned:', data1.guidance?.assessment);
  console.log('Instruction:', data1.guidance?.instruction);
  console.log('Observation:', data1.guidance?.observation);

  // Wait 6 seconds to respect rate pacing
  console.log('\nPacing 6 seconds before Test 2...');
  await new Promise(r => setTimeout(r, 6000));

  console.log('\n=== TEST 2: Unambiguous Custom Formatting Goal with Chart Screenshot ===');
  const goal2 = "Highlight the largest numeric value in B2:C5 with a yellow background.";
  const res2 = await fetch('http://localhost:8080/api/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: 'verify_formatting_goal',
      goal: goal2,
      imageBase64: base64Image
    })
  });

  const data2 = await res2.json();
  console.log('HTTP Status:', res2.status);
  console.log('Success:', data2.success);
  console.log('Status returned:', data2.guidance?.status);
  console.log('Assessment returned:', data2.guidance?.assessment);
  console.log('Instruction:', data2.guidance?.instruction);
  console.log('Observation:', data2.guidance?.observation);
  console.log('Selected Candidate ID:', data2.guidance?.selectedCandidateId);
}

main().catch(console.error);
