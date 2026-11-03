import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalObjectStorage } from './local-object-storage.js';

const KEY = 'post-media/0190a000-0000-7000-8000-0000001d0f01';
const OTHER_KEY = 'post-media/0190a000-0000-7000-8000-0000001d0f02';
const BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

const tokenOf = (url: string) => {
  const params = new URL(url, 'http://x').searchParams;
  return { exp: params.get('exp')!, sig: params.get('sig')! };
};

describe('LocalObjectStorage', () => {
  let dir: string;
  let storage: LocalObjectStorage;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'influency-storage-'));
    storage = new LocalObjectStorage(dir);
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips put, head, get and delete with the content type', async () => {
    await storage.put(KEY, BYTES, 'image/png');
    expect(await storage.head(KEY)).toEqual({ size: BYTES.length, contentType: 'image/png' });
    expect(await storage.get(KEY)).toEqual({ body: BYTES, contentType: 'image/png' });
    await storage.delete(KEY);
    expect(await storage.get(KEY)).toBeNull();
    expect(await storage.head(KEY)).toBeNull();
  });

  it('returns null for missing objects and deletes missing objects without error', async () => {
    expect(await storage.get(KEY)).toBeNull();
    expect(await storage.head(KEY)).toBeNull();
    await expect(storage.delete(KEY)).resolves.toBeUndefined();
  });

  it.each([
    '../x',
    'post-media/../../etc/passwd',
    'post-media/abc',
    'Post-Media/' + '0'.repeat(36),
  ])('rejects key %s before touching the filesystem', async (key) => {
    await expect(storage.put(key, BYTES, 'image/png')).rejects.toThrow('invalid storage key');
    await expect(storage.get(key)).rejects.toThrow('invalid storage key');
    await expect(storage.createUploadUrl(key, 'image/png', 300)).rejects.toThrow();
  });

  it('issues a relative dev-storage upload URL with the signed content type', async () => {
    const upload = await storage.createUploadUrl(KEY, 'image/png', 300);
    expect(upload.url).toMatch(new RegExp(`^/api/v1/dev-storage/${KEY}\\?exp=\\d+&sig=[\\w-]+$`));
    expect(upload.headers).toEqual({ 'content-type': 'image/png' });
    expect(upload.expiresAt.getTime()).toBeGreaterThan(Date.now() + 299_000);
  });

  it('verifies a token only for the same key, content type and signature', async () => {
    const { exp, sig } = tokenOf((await storage.createUploadUrl(KEY, 'image/png', 300)).url);
    expect(storage.verifyUploadToken(KEY, 'image/png', exp, sig)).toBe(true);
    expect(storage.verifyUploadToken(OTHER_KEY, 'image/png', exp, sig)).toBe(false);
    expect(storage.verifyUploadToken(KEY, 'image/jpeg', exp, sig)).toBe(false);
    expect(storage.verifyUploadToken(KEY, 'image/png', String(Number(exp) + 1), sig)).toBe(false);
    // Tamper the first char: the last base64url char carries padding bits that decoding may ignore.
    const tampered = (sig.startsWith('A') ? 'B' : 'A') + sig.slice(1);
    expect(storage.verifyUploadToken(KEY, 'image/png', exp, tampered)).toBe(false);
    expect(storage.verifyUploadToken(KEY, 'image/png', exp, 'short')).toBe(false);
    expect(storage.verifyUploadToken(KEY, 'image/png', 'abc', sig)).toBe(false);
    expect(storage.verifyUploadToken('../x', 'image/png', exp, sig)).toBe(false);
  });

  it('rejects a token after it expires', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-03T00:00:00Z') });
    const { exp, sig } = tokenOf((await storage.createUploadUrl(KEY, 'image/png', 60)).url);
    vi.setSystemTime(new Date('2026-11-03T00:00:59Z'));
    expect(storage.verifyUploadToken(KEY, 'image/png', exp, sig)).toBe(true);
    vi.setSystemTime(new Date('2026-11-03T00:01:01Z'));
    expect(storage.verifyUploadToken(KEY, 'image/png', exp, sig)).toBe(false);
  });

  it('issues download tokens that only verify as downloads for the same key', async () => {
    const download = await storage.createDownloadUrl(KEY, 300);
    expect(download.url).toMatch(new RegExp(`^/api/v1/dev-storage/${KEY}\\?exp=\\d+&sig=[\\w-]+$`));
    expect(download.expiresAt.getTime()).toBeGreaterThan(Date.now() + 299_000);
    const { exp, sig } = tokenOf(download.url);
    expect(storage.verifyDownloadToken(KEY, exp, sig)).toBe(true);
    expect(storage.verifyDownloadToken(OTHER_KEY, exp, sig)).toBe(false);
    expect(storage.verifyDownloadToken(KEY, String(Number(exp) + 1), sig)).toBe(false);
    // Not interchangeable with upload tokens, in either direction.
    expect(storage.verifyUploadToken(KEY, 'image/png', exp, sig)).toBe(false);
    const upload = tokenOf((await storage.createUploadUrl(KEY, 'image/png', 300)).url);
    expect(storage.verifyDownloadToken(KEY, upload.exp, upload.sig)).toBe(false);
    await expect(storage.createDownloadUrl('../x', 300)).rejects.toThrow('invalid storage key');
  });

  it('rejects a download token after it expires', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-03T00:00:00Z') });
    const { exp, sig } = tokenOf((await storage.createDownloadUrl(KEY, 60)).url);
    vi.setSystemTime(new Date('2026-11-03T00:01:01Z'));
    expect(storage.verifyDownloadToken(KEY, exp, sig)).toBe(false);
  });

  it('does not accept tokens from another instance (per-process secret)', async () => {
    const { exp, sig } = tokenOf((await storage.createUploadUrl(KEY, 'image/png', 300)).url);
    expect(new LocalObjectStorage(dir).verifyUploadToken(KEY, 'image/png', exp, sig)).toBe(false);
  });
});
