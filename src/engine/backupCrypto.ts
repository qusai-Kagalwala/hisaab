/**
 * Password-protected backups. AES-256-GCM, with the key derived from the
 * backup password by PBKDF2-SHA256. Pure JS (audited @noble libraries), so it
 * works the same on the phone and in tests. The password is never stored:
 * only the derived key, in secure storage, so weekly backups need no typing.
 */
import { gcm } from '@noble/ciphers/aes';
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

export const ENCRYPTED_FORMAT = 'hisaab-encrypted-1';
export const PBKDF2_ITERATIONS = 60_000;
export const MIN_PASSWORD_LENGTH = 6;

export type RandomBytes = (n: number) => Uint8Array;

export interface BackupKey {
  key: Uint8Array;
  salt: Uint8Array;
  iterations: number;
}

interface EncryptedFile {
  app: 'hisaab';
  format: typeof ENCRYPTED_FORMAT;
  kdf: 'pbkdf2-sha256';
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

// --- base64 (no reliance on Buffer/atob being present) ---------------------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? B64[n & 63] : '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let k = 0;
  for (const ch of clean) {
    value = (value << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[k++] = (value >> bits) & 255;
    }
  }
  return out.slice(0, k);
}

/** UTF-8 by hand: TextEncoder/TextDecoder aren't guaranteed on every phone runtime. */
export function utf8(text: string): Uint8Array {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

export function fromUtf8(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let c: number;
    let size: number;
    if (b < 0x80) [c, size] = [b, 1];
    else if (b < 0xe0) [c, size] = [((b & 31) << 6) | (bytes[i + 1] & 63), 2];
    else if (b < 0xf0) [c, size] = [((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63), 3];
    else [c, size] = [((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) | ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63), 4];
    out += String.fromCodePoint(c);
    i += size;
  }
  return out;
}

// ---------------------------------------------------------------------------

export function checkPassword(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
  return null;
}

export function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8(password), salt, { c: iterations, dkLen: 32 });
}

export async function newBackupKey(password: string, random: RandomBytes, iterations = PBKDF2_ITERATIONS): Promise<BackupKey> {
  const problem = checkPassword(password);
  if (problem) throw new Error(problem);
  const salt = random(16);
  return { key: await deriveKey(password, salt, iterations), salt, iterations };
}

export function encryptBackup(plainText: string, k: BackupKey, random: RandomBytes): string {
  const iv = random(12);
  const data = gcm(k.key, iv).encrypt(utf8(plainText));
  const file: EncryptedFile = {
    app: 'hisaab', format: ENCRYPTED_FORMAT, kdf: 'pbkdf2-sha256', iterations: k.iterations,
    salt: toBase64(k.salt), iv: toBase64(iv), data: toBase64(data),
  };
  return JSON.stringify(file);
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const f = JSON.parse(text) as Partial<EncryptedFile>;
    return f?.app === 'hisaab' && f.format === ENCRYPTED_FORMAT;
  } catch {
    return false;
  }
}

/** Decrypt with the password. Throws "Wrong password" if it doesn't open. */
export async function decryptBackup(text: string, password: string): Promise<string> {
  const f = JSON.parse(text) as EncryptedFile;
  if (f.format !== ENCRYPTED_FORMAT) throw new Error("This isn't a protected Hisaab backup.");
  const key = await deriveKey(password, fromBase64(f.salt), f.iterations);
  try {
    return fromUtf8(gcm(key, fromBase64(f.iv)).decrypt(fromBase64(f.data)));
  } catch {
    throw new Error('Wrong password — this backup could not be opened.');
  }
}

/** For keeping the derived key in secure storage. */
export function serializeKey(k: BackupKey): string {
  return JSON.stringify({ key: toBase64(k.key), salt: toBase64(k.salt), iterations: k.iterations });
}

export function parseKey(raw: string | null): BackupKey | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { key: string; salt: string; iterations: number };
    return { key: fromBase64(o.key), salt: fromBase64(o.salt), iterations: o.iterations };
  } catch {
    return null;
  }
}

const DAY = 86_400_000;
export const AUTO_BACKUP_EVERY_DAYS = 7;

/** Weekly automatic backup to the chosen folder. */
export function autoBackupDue(lastAt: number | null, nowMs: number): boolean {
  return lastAt == null || nowMs - lastAt >= AUTO_BACKUP_EVERY_DAYS * DAY;
}

/** Keep the newest `keep` dated backups; return the names to delete. */
export function backupsToPrune(names: readonly string[], keep = 4): string[] {
  return names
    .filter((n) => /^hisaab-backup-\d{4}-\d{2}-\d{2}\.hisaab$/.test(n))
    .sort()
    .reverse()
    .slice(keep);
}

export function encryptedFileName(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `hisaab-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.hisaab`;
}
