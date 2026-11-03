import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ObjectHead, ObjectStorage, StoredObject, UploadUrl } from './object-storage.js';

/** Every key is `<prefix>/<uuid>` (server-generated); anything else never reaches the filesystem. */
const KEY_PATTERN = /^[a-z-]+\/[0-9a-f-]{36}$/;

const isMissing = (error: unknown): boolean => (error as NodeJS.ErrnoException).code === 'ENOENT';

/**
 * Filesystem storage for development (STORAGE_DRIVER=local). Upload URLs point at the
 * dev-only `PUT /api/v1/dev-storage/<key>` route and carry an HMAC token instead of a SigV4 signature.
 */
export class LocalObjectStorage implements ObjectStorage {
  private readonly root: string;
  // Per process: a restart only invalidates pending upload URLs (minutes long).
  private readonly secret = randomBytes(32);

  constructor(dir: string) {
    this.root = resolve(dir);
  }

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, body);
    await writeFile(`${file}.type`, contentType);
  }

  async get(key: string): Promise<StoredObject | null> {
    const file = this.path(key);
    try {
      const [body, contentType] = await Promise.all([
        readFile(file),
        readFile(`${file}.type`, 'utf8'),
      ]);
      return { body: new Uint8Array(body), contentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async head(key: string): Promise<ObjectHead | null> {
    const file = this.path(key);
    try {
      const [info, contentType] = await Promise.all([stat(file), readFile(`${file}.type`, 'utf8')]);
      return { size: info.size, contentType };
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    const file = this.path(key);
    await rm(file, { force: true });
    await rm(`${file}.type`, { force: true });
  }

  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<UploadUrl> {
    // Inside then(): an invalid key rejects instead of throwing synchronously.
    return Promise.resolve().then(() => {
      this.path(key);
      const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
      const exp = Math.floor(expiresAt.getTime() / 1000);
      const sig = this.sign(key, contentType, exp);
      return {
        // Relative: resolves against the web origin through its /api/v1 rewrite.
        url: `/api/v1/dev-storage/${key}?exp=${exp}&sig=${sig}`,
        headers: { 'content-type': contentType },
        expiresAt,
      };
    });
  }

  /** True when `sig` was issued by createUploadUrl for this key + content type and has not expired. */
  verifyUploadToken(key: string, contentType: string, exp: string, sig: string): boolean {
    if (!KEY_PATTERN.test(key) || !/^\d+$/.test(exp)) return false;
    const expires = Number(exp);
    if (expires * 1000 < Date.now()) return false;
    const expected = Buffer.from(this.sign(key, contentType, expires));
    const given = Buffer.from(sig);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  private sign(key: string, contentType: string, exp: number): string {
    return createHmac('sha256', this.secret)
      .update(`${key}\n${contentType}\n${exp}`)
      .digest('base64url');
  }

  private path(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error('invalid storage key');
    return join(this.root, key);
  }
}
