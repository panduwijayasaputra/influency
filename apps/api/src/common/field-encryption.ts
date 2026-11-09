import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** A strict base64 AES-256 key: exactly 32 bytes, nothing else accepted (Node ignores stray characters by default). */
export function isFieldKey(base64: string): boolean {
  const bytes = Buffer.from(base64, 'base64');
  return bytes.length === KEY_BYTES && bytes.toString('base64') === base64;
}

/** Decodes the key from the environment. Throws unless it is base64 of exactly 32 bytes (`openssl rand -base64 32`). */
export function loadFieldKey(base64: string): Buffer {
  if (!isFieldKey(base64)) throw new Error('field key must be base64 of exactly 32 bytes');
  return Buffer.from(base64, 'base64');
}

/**
 * Encrypts a short sensitive value (a bank account number) for storage: AES-256-GCM, a random IV per value, stored as
 * `v1:<iv>:<tag>:<ciphertext>` (base64 parts). `context` (e.g. the owner's id) is authenticated but not stored, so a
 * ciphertext copied into another owner's row fails to decrypt. The `v1` prefix leaves room for key rotation.
 */
export function encryptField(plain: string, key: Buffer, context = ''): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

/** Reverses {@link encryptField}. Throws on an unknown version, a wrong key or context, or any tampering. */
export function decryptField(payload: string, key: Buffer, context = ''): string {
  const [version, iv, tag, ciphertext, ...rest] = payload.split(':');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined || rest.length > 0) {
    throw new Error('unsupported encrypted field');
  }
  const ivBytes = Buffer.from(iv, 'base64');
  const tagBytes = Buffer.from(tag, 'base64');
  if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
    throw new Error('unsupported encrypted field');
  }
  const decipher = createDecipheriv(ALGORITHM, key, ivBytes);
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
