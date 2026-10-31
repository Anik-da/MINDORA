import * as fs from 'node:fs';
import * as path from 'node:path';

const srcDir = path.resolve(process.cwd(), 'electron');
const destDir = path.resolve(process.cwd(), 'dist', 'electron');

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
console.log('[Assets] Static UI assets and fonts copied to dist/electron');
