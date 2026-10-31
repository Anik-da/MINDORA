import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.cwd();
const source = path.join(root, 'release-build', 'MINDORA-Setup-x64.exe');
const destination = path.join(root, 'dist', 'MINDORA-Setup-x64.exe');

if (!fs.existsSync(source)) {
  throw new Error(`Windows installer artifact is missing: ${source}`);
}

const stat = fs.statSync(source);
if (!stat.isFile() || stat.size < 1024 * 1024) {
  throw new Error(`Windows installer artifact is unexpectedly small (${stat.size} bytes).`);
}

const fd = fs.openSync(source, 'r');
const signature = Buffer.alloc(2);
try { fs.readSync(fd, signature, 0, 2, 0); } finally { fs.closeSync(fd); }
if (signature.toString('ascii') !== 'MZ') {
  throw new Error('Windows installer does not have a valid PE executable signature.');
}

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.copyFileSync(source, destination);
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (fs.statSync(destination).size !== stat.size || hash(destination) !== hash(source)) {
  throw new Error('Copied installer does not match the electron-builder artifact.');
}

console.log(`[Release] Verified Windows x64 installer: ${destination}`);
console.log(`[Release] Bytes: ${stat.size}`);
console.log(`[Release] SHA-256: ${hash(destination)}`);
