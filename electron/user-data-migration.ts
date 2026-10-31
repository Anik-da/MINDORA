import * as fs from 'node:fs';
import * as path from 'node:path';

export interface UserDataMigrationOptions {
  legacyPath: string;
  destinationPath: string;
  verifyEncryptedCredential?: (data: Buffer) => void;
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export interface UserDataMigrationResult {
  copiedFiles: number;
  preservedItems: number;
  skipped: boolean;
}

const IDENTITY_BOUND_CHROMIUM_DATA = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'blob_storage', 'Session Storage',
  'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'DevToolsActivePort', 'LOCK'
]);

/** Copies legacy app-owned data without removing or overwriting either directory. */
export function migrateLegacyUserData(options: UserDataMigrationOptions): UserDataMigrationResult {
  const { legacyPath, destinationPath } = options;
  const log = options.log || ((level, message) => console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'info'](message));

  if (path.resolve(legacyPath).toLowerCase() === path.resolve(destinationPath).toLowerCase()) {
    return { copiedFiles: 0, preservedItems: 0, skipped: true };
  }
  if (!fs.existsSync(legacyPath)) {
    log('info', '[Data Migration] No legacy Unstuck data directory found.');
    return { copiedFiles: 0, preservedItems: 0, skipped: true };
  }

  let copiedFiles = 0;
  let preservedItems = 0;
  try {
    fs.mkdirSync(destinationPath, { recursive: true });

    const copyMissing = (source: string, target: string): void => {
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) {
        preservedItems++;
        return;
      }
      if (stat.isDirectory()) {
        fs.mkdirSync(target, { recursive: true });
        for (const child of fs.readdirSync(source)) {
          copyMissing(path.join(source, child), path.join(target, child));
        }
        return;
      }
      if (fs.existsSync(target)) {
        preservedItems++;
        return;
      }
      fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      copiedFiles++;
    };

    for (const entry of fs.readdirSync(legacyPath, { withFileTypes: true })) {
      if (IDENTITY_BOUND_CHROMIUM_DATA.has(entry.name)) {
        preservedItems++;
        continue;
      }

      const source = path.join(legacyPath, entry.name);
      const target = path.join(destinationPath, entry.name);
      if (entry.name === 'gemini_credential.enc' && entry.isFile() && options.verifyEncryptedCredential) {
        try {
          options.verifyEncryptedCredential(fs.readFileSync(source));
        } catch {
          log('warn', '[Data Migration] Legacy encrypted credential could not be verified; it remains in the old directory.');
          preservedItems++;
          continue;
        }
      }
      copyMissing(source, target);
    }

    log('info', `[Data Migration] Legacy data migration finished; copied ${copiedFiles} file(s), preserved ${preservedItems} existing or identity-bound item(s).`);
    return { copiedFiles, preservedItems, skipped: false };
  } catch (error) {
    log('error', `[Data Migration] Legacy data migration did not complete: ${error instanceof Error ? error.message : 'unknown filesystem error'}`);
    return { copiedFiles, preservedItems, skipped: false };
  }
}
