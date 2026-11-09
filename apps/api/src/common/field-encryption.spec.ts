import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decryptField, encryptField, isFieldKey, loadFieldKey } from './field-encryption.js';

const key = () => randomBytes(32);
const CREATOR = '0190a000-0000-7000-8000-000000000001';

describe('field key', () => {
  it('accepts base64 of exactly 32 bytes', () => {
    const base64 = randomBytes(32).toString('base64');
    expect(isFieldKey(base64)).toBe(true);
    expect(loadFieldKey(base64)).toHaveLength(32);
  });

  it.each([
    ['too short', randomBytes(16).toString('base64')],
    ['too long', randomBytes(48).toString('base64')],
    ['not base64', 'this is not base64 at all!!'],
    ['stray characters', `${randomBytes(32).toString('base64')}!!`],
    ['empty', ''],
  ])('rejects a key that is %s', (_label, value) => {
    expect(isFieldKey(value)).toBe(false);
    expect(() => loadFieldKey(value)).toThrow();
  });
});

describe('encryptField / decryptField', () => {
  it('round-trips a value', () => {
    const k = key();
    expect(decryptField(encryptField('1234564821', k, CREATOR), k, CREATOR)).toBe('1234564821');
  });

  it('round-trips non-ASCII text and an empty string', () => {
    const k = key();
    expect(decryptField(encryptField('Nadia Kirana ✓', k), k)).toBe('Nadia Kirana ✓');
    expect(decryptField(encryptField('', k), k)).toBe('');
  });

  it('never puts the plain value in the payload and uses the v1 layout', () => {
    const payload = encryptField('1234564821', key(), CREATOR);
    expect(payload).not.toContain('1234564821');
    expect(payload.split(':')).toHaveLength(4);
    expect(payload.startsWith('v1:')).toBe(true);
  });

  it('encrypts the same value differently each time (random IV)', () => {
    const k = key();
    expect(encryptField('1234564821', k)).not.toBe(encryptField('1234564821', k));
  });

  it('refuses a wrong key', () => {
    const payload = encryptField('1234564821', key());
    expect(() => decryptField(payload, key())).toThrow();
  });

  it("refuses another owner's context: a ciphertext copied into another row does not open", () => {
    const k = key();
    const payload = encryptField('1234564821', k, CREATOR);
    expect(() => decryptField(payload, k, '0190a000-0000-7000-8000-000000000002')).toThrow();
    expect(() => decryptField(payload, k)).toThrow();
  });

  it('refuses a tampered ciphertext, tag or IV', () => {
    const k = key();
    const [v, iv, tag, ct] = encryptField('1234564821', k).split(':') as [
      string,
      string,
      string,
      string,
    ];
    const flip = (b64: string) => {
      const bytes = Buffer.from(b64, 'base64');
      bytes[0] = bytes[0]! ^ 0xff;
      return bytes.toString('base64');
    };
    expect(() => decryptField([v, iv, tag, flip(ct)].join(':'), k)).toThrow();
    expect(() => decryptField([v, iv, flip(tag), ct].join(':'), k)).toThrow();
    expect(() => decryptField([v, flip(iv), tag, ct].join(':'), k)).toThrow();
  });

  it.each([
    ['an unknown version', (p: string) => p.replace(/^v1/, 'v2')],
    ['a missing part', (p: string) => p.split(':').slice(0, 3).join(':')],
    ['an extra part', (p: string) => `${p}:extra`],
    ['an empty string', () => ''],
    ['plain text', () => '1234564821'],
  ])('refuses %s', (_label, mutate) => {
    const k = key();
    expect(() => decryptField(mutate(encryptField('1234564821', k)), k)).toThrow();
  });
});
