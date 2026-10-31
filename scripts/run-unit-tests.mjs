import { readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const testsDir = resolve(process.cwd(), 'dist', 'tests');
const testFiles = readdirSync(testsDir)
  .filter(f => f.endsWith('.unit.test.js'))
  .map(f => join(testsDir, f));

if (testFiles.length === 0) {
  console.error('[Test Runner Error] No unit test files found in dist/tests!');
  process.exit(1);
}

const result = spawnSync(process.execPath, ['--test', ...testFiles], { stdio: 'inherit' });
process.exit(result.status ?? 0);
