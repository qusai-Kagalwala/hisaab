/// <reference types="node" />
import { randomBytes } from 'node:crypto';
import {
  autoBackupDue,
  backupsToPrune,
  decryptBackup,
  encryptBackup,
  encryptedFileName,
  fromBase64,
  isEncryptedBackup,
  newBackupKey,
  parseKey,
  serializeKey,
  toBase64,
  fromUtf8,
  utf8,
} from '../backupCrypto';

const random = (n: number) => new Uint8Array(randomBytes(n));

describe('backup encryption', () => {
  it('base64 round-trips every length', () => {
    for (let n = 0; n < 40; n++) {
      const b = random(n);
      expect(fromBase64(toBase64(b))).toEqual(b);
    }
    expect(toBase64(utf8('Hisaab'))).toBe('SGlzYWFi');
    const mixed = 'Chai ₹20 — नमस्ते 😀 ā';
    expect(utf8(mixed)).toEqual(new Uint8Array(Buffer.from(mixed, 'utf8')));
    expect(fromUtf8(utf8(mixed))).toBe(mixed);
  });

  it('encrypts and decrypts with the right password; wrong password fails clearly', async () => {
    const key = await newBackupKey('chai-20-rupees', random, 1_000);
    const text = JSON.stringify({ app: 'hisaab', tables: { note: 'Chai ₹20 — नमस्ते' } });
    const file = encryptBackup(text, key, random);
    expect(isEncryptedBackup(file)).toBe(true);
    expect(file).not.toContain('Chai');
    expect(await decryptBackup(file, 'chai-20-rupees')).toBe(text);
    await expect(decryptBackup(file, 'wrong-password')).rejects.toThrow(/Wrong password/);
  });

  it('the stored key encrypts the same way; short passwords are refused', async () => {
    const key = await newBackupKey('123456', random, 1_000);
    const again = parseKey(serializeKey(key))!;
    expect(await decryptBackup(encryptBackup('hello', again, random), '123456')).toBe('hello');
    await expect(newBackupKey('12345', random)).rejects.toThrow(/at least 6/);
    expect(parseKey('nope')).toBeNull();
    expect(isEncryptedBackup('{"app":"hisaab","format":1}')).toBe(false);
  });

  it('weekly schedule and keeping the newest 4 files', () => {
    const day = 86_400_000;
    expect(autoBackupDue(null, 0)).toBe(true);
    expect(autoBackupDue(0, 6 * day)).toBe(false);
    expect(autoBackupDue(0, 7 * day)).toBe(true);
    const names = ['hisaab-backup-2026-09-01.hisaab', 'hisaab-backup-2026-09-08.hisaab', 'notes.txt',
      'hisaab-backup-2026-09-15.hisaab', 'hisaab-backup-2026-09-22.hisaab', 'hisaab-backup-2026-09-29.hisaab'];
    expect(backupsToPrune(names)).toEqual(['hisaab-backup-2026-09-01.hisaab']);
    expect(encryptedFileName(new Date(2026, 9, 1).getTime())).toBe('hisaab-backup-2026-10-01.hisaab');
  });
});
