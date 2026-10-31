import * as fs from 'node:fs';
import * as path from 'node:path';

const root = process.cwd();
const source = path.join(root, 'node_modules', 'electron-winstaller', 'vendor', 'rcedit.exe');
const toolDir = path.join(root, 'node_modules', '.cache', 'mindora-builder-tools');
const target = path.join(toolDir, 'rcedit-x64.exe');

if (!fs.existsSync(source)) {
  throw new Error('The electron-builder dependency tree does not contain its rcedit helper. Run npm ci before building the Windows installer.');
}

fs.mkdirSync(toolDir, { recursive: true });
fs.copyFileSync(source, target);
console.log('[Release] Prepared the locally installed rcedit helper for x64 resource editing.');
