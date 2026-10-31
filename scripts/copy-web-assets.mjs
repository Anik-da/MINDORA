import * as fs from 'node:fs';
import * as path from 'node:path';

const srcDir = path.resolve(process.cwd(), 'web');
const destDir = path.resolve(process.cwd(), 'dist', 'web');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    // Only copy non-typescript files
    if (!src.endsWith('.ts')) {
      fs.copyFileSync(src, dest);
    }
  }
}

copyRecursive(srcDir, destDir);

// Copy example capture fixtures from fixtures or captures
const exampleDestDir = path.resolve(destDir, 'assets');
if (!fs.existsSync(exampleDestDir)) fs.mkdirSync(exampleDestDir, { recursive: true });

const fixtureFiles = [
  'calc-test.png',
  'calc-clean-unselected.png',
  'calc-clean-selected.png',
  'calc-clean-pie-chart.png',
  'calc-clean-bar-chart.png',
  'calc-three-column-unformatted.png',
  'calc-three-column-formatted.png'
];

for (const file of fixtureFiles) {
  const p1 = path.resolve(process.cwd(), 'fixtures', file);
  const p2 = path.resolve(process.cwd(), 'captures', file);
  const src = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
  if (src) {
    fs.copyFileSync(src, path.join(exampleDestDir, file));
    console.log(`[Assets] Fixture copied: ${file}`);
  }
}

console.log('[Assets] Static web companion assets, styles, and fonts copied to dist/web');
