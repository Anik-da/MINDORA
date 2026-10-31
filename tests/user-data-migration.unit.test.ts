import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { migrateLegacyUserData } from '../electron/user-data-migration.js';

describe('MINDORA legacy user-data migration', () => {
  it('copies encrypted credentials byte-for-byte and never overwrites existing MINDORA data', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mindora-migration-'));
    const legacyPath = path.join(root, 'Unstuck');
    const destinationPath = path.join(root, 'MINDORA');
    fs.mkdirSync(path.join(legacyPath, 'Preferences'), { recursive: true });
    fs.mkdirSync(path.join(destinationPath, 'Preferences'), { recursive: true });
    const ciphertext = Buffer.from([0x01, 0x02, 0xfe, 0xff]);
    fs.writeFileSync(path.join(legacyPath, 'gemini_credential.enc'), ciphertext);
    fs.writeFileSync(path.join(legacyPath, 'Preferences', 'settings.json'), '{"theme":"old"}');
    fs.writeFileSync(path.join(destinationPath, 'Preferences', 'settings.json'), '{"theme":"new"}');

    let verificationCalls = 0;
    const result = migrateLegacyUserData({
      legacyPath,
      destinationPath,
      verifyEncryptedCredential: (data) => {
        verificationCalls++;
        assert.deepEqual(data, ciphertext);
      },
      log: () => undefined
    });

    assert.equal(verificationCalls, 1);
    assert.deepEqual(fs.readFileSync(path.join(destinationPath, 'gemini_credential.enc')), ciphertext);
    assert.equal(fs.readFileSync(path.join(destinationPath, 'Preferences', 'settings.json'), 'utf8'), '{"theme":"new"}');
    assert.equal(fs.existsSync(path.join(legacyPath, 'gemini_credential.enc')), true);
    assert.equal(result.copiedFiles, 1);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('is idempotent, merges new files into existing directories, and retains unverifiable credentials', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mindora-migration-'));
    const legacyPath = path.join(root, 'Unstuck');
    const destinationPath = path.join(root, 'MINDORA');
    fs.mkdirSync(path.join(legacyPath, 'Preferences'), { recursive: true });
    fs.mkdirSync(path.join(destinationPath, 'Preferences'), { recursive: true });
    fs.writeFileSync(path.join(legacyPath, 'Preferences', 'language.json'), '{"language":"en"}');
    fs.writeFileSync(path.join(legacyPath, 'gemini_credential.enc'), Buffer.from('opaque-ciphertext'));

    const messages: string[] = [];
    const first = migrateLegacyUserData({
      legacyPath,
      destinationPath,
      verifyEncryptedCredential: () => { throw new Error('decryption failed'); },
      log: (_level, message) => messages.push(message)
    });
    const second = migrateLegacyUserData({
      legacyPath,
      destinationPath,
      verifyEncryptedCredential: () => { throw new Error('decryption failed'); },
      log: () => undefined
    });

    assert.equal(first.copiedFiles, 1);
    assert.equal(second.copiedFiles, 0);
    assert.equal(fs.existsSync(path.join(destinationPath, 'gemini_credential.enc')), false);
    assert.equal(fs.existsSync(path.join(legacyPath, 'gemini_credential.enc')), true);
    assert.ok(messages.some((message) => message.includes('could not be verified')));
    assert.ok(messages.every((message) => !message.includes('opaque-ciphertext')));
    fs.rmSync(root, { recursive: true, force: true });
  });
});
