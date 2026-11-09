import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { LocalObjectStorage } from '../../common/local-object-storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const KEY = 'post-media/0190a000-0000-7000-8000-0000001d0f11';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

async function boot(storage: ObjectStorage): Promise<NestFastifyApplication> {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(storage)
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      {
        logger: false,
      },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('dev storage upload route (STORAGE_DRIVER=local)', () => {
  let dir: string;
  let storage: LocalObjectStorage;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'influency-dev-storage-'));
    storage = new LocalObjectStorage(dir);
    app = await boot(storage);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const put = (url: string, contentType = 'image/png', payload: Buffer = PNG) =>
    app.inject({ method: 'PUT', url, headers: { 'content-type': contentType }, payload });

  it('stores the bytes for a valid upload URL', async () => {
    const { url } = await storage.createUploadUrl(KEY, 'image/png', 300);
    const res = await put(url);
    expect(res.statusCode).toBe(204);
    expect(await storage.get(KEY)).toEqual({ body: new Uint8Array(PNG), contentType: 'image/png' });
  });

  it('stores a stub-driver video upload', async () => {
    const videoKey = 'post-video/0190a000-0000-7000-8000-0000001e0f01';
    const mp4 = readFileSync(new URL('../../../test/fixtures/sample.mp4', import.meta.url));
    const { url } = await storage.createUploadUrl(videoKey, 'video/mp4', 300);
    expect((await put(url, 'video/mp4', mp4)).statusCode).toBe(204);
    expect((await storage.head(videoKey))?.size).toBe(mp4.length);
  });

  it('rejects another content type, a tampered or missing signature, and another key', async () => {
    const { url } = await storage.createUploadUrl(KEY, 'image/png', 300);
    const otherKey = url.replace('0f11', '0f12');
    for (const res of [
      await put(url, 'image/jpeg'),
      await put(url.replace(/sig=.*/, 'sig=AAAA')),
      await put(url.replace(/&sig=.*/, '')),
      await put(otherKey),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
    }
    expect(await storage.head(KEY.replace('0f11', '0f12'))).toBeNull();
  });

  it('rejects an expired URL', async () => {
    const { url } = await storage.createUploadUrl(KEY, 'image/png', 300);
    const expired = url.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) - 1}`);
    expect((await put(expired)).statusCode).toBe(403);
  });
});

describe('dev storage download route (STORAGE_DRIVER=local)', () => {
  const DOWNLOAD_KEY = 'post-media/0190a000-0000-7000-8000-0000001d0f21';
  let dir: string;
  let storage: LocalObjectStorage;
  let app: NestFastifyApplication;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'influency-dev-storage-'));
    storage = new LocalObjectStorage(dir);
    await storage.put(DOWNLOAD_KEY, PNG, 'image/png');
    app = await boot(storage);
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (url: string) => app.inject({ method: 'GET', url });

  it('serves the bytes with the stored type for a valid download URL', async () => {
    const res = await get((await storage.createDownloadUrl(DOWNLOAD_KEY, 300)).url);
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload).toEqual(PNG);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects tampered, missing, expired and upload-issued signatures', async () => {
    const { url } = await storage.createDownloadUrl(DOWNLOAD_KEY, 300);
    const upload = await storage.createUploadUrl(DOWNLOAD_KEY, 'image/png', 300);
    for (const res of [
      await get(url.replace(/sig=.*/, 'sig=AAAA')),
      await get(url.replace(/&sig=.*/, '')),
      await get(url.replace(/exp=\d+/, `exp=${Math.floor(Date.now() / 1000) - 1}`)),
      await get(upload.url),
    ]) {
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('FORBIDDEN');
    }
  });

  it('does not accept a download URL as an upload URL', async () => {
    const { url } = await storage.createDownloadUrl(DOWNLOAD_KEY, 300);
    const res = await app.inject({
      method: 'PUT',
      url,
      headers: { 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(res.statusCode).toBe(403);
  });

  it('is 404 for a validly signed but missing object', async () => {
    const missing = 'post-media/0190a000-0000-7000-8000-0000001d0f22';
    expect((await get((await storage.createDownloadUrl(missing, 300)).url)).statusCode).toBe(404);
  });
});

describe('dev storage upload route (other drivers)', () => {
  it('is 404 when the storage is not local', async () => {
    const app = await boot(createMemoryStorage().storage);
    const res = await app.inject({
      method: 'PUT',
      url: `/api/v1/dev-storage/${KEY}?exp=9999999999&sig=x`,
      headers: { 'content-type': 'image/png' },
      payload: PNG,
    });
    expect(res.statusCode).toBe(404);
    const download = await app.inject({
      method: 'GET',
      url: `/api/v1/dev-storage/${KEY}?exp=9999999999&sig=x`,
    });
    expect(download.statusCode).toBe(404);
    await app.close();
  });
});
