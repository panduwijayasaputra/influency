import { createHmac } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createFakeVideoProvider } from '../../../test/fake-video-provider.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, type Env, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { VIDEO_PROVIDER } from '../../common/video-provider.js';
import type { MediaStatus } from '../../generated/prisma/client.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const URL = '/api/v1/webhooks/video/cloudflare-stream';
const SECRET = 'video-webhook-spec-secret';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USER = '0190a000-0000-7000-8000-000000270001';
const POST = '0190a000-0000-7000-8000-000000270101';
const SESSION_TOKEN = 'video-webhook-spec-session';

describe('Cloudflare Stream webhook', () => {
  const prisma = createTestPrisma();
  const fake = createFakeVideoProvider();
  const env: Env = { ...parseEnv(process.env), CLOUDFLARE_STREAM_WEBHOOK_SECRET: SECRET };
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.create({ data: { id: USER, displayName: 'Webhook creator' } });
    await prisma.session.create({
      data: {
        userId: USER,
        tokenHash: sha256hex(SESSION_TOKEN),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: USER,
        slug: 'video-webhook-spec',
        status: 'APPROVED',
        ...profileFields('webhook'),
      },
    });
    await prisma.post.create({
      data: { id: POST, creatorProfileId: profile.id, visibility: 'FREE' },
    });

    const telegram = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(telegram.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .overrideProvider(VIDEO_PROVIDER)
      .useValue(fake.provider)
      .overrideProvider(ENV)
      .useValue(env)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false, rawBody: true },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterEach(async () => {
    await prisma.mediaAsset.deleteMany({ where: { postId: POST } });
    fake.deleted.length = 0;
    env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = SECRET;
  });

  afterAll(async () => {
    await app.close();
    await prisma.post.deleteMany({ where: { id: POST } });
    await prisma.creatorProfile.deleteMany({ where: { userId: USER } });
    await prisma.session.deleteMany({ where: { userId: USER } });
    await prisma.user.deleteMany({ where: { id: USER } });
    await prisma.$disconnect();
  });

  let seq = 0;
  const video = async (status: MediaStatus, uploadExpiresAt = new Date(Date.now() + 60_000)) => {
    seq += 1;
    const uid = `webhook${String(seq).padStart(8, '0')}`;
    const row = await prisma.mediaAsset.create({
      data: {
        postId: POST,
        kind: 'VIDEO',
        status,
        videoUid: uid,
        contentType: 'video/mp4',
        byteSize: 1,
        uploadExpiresAt,
      },
    });
    return { id: row.id, uid };
  };
  const rowOf = (id: string) => prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
  const body = (uid: string) =>
    JSON.stringify({ uid, readyToStream: true, status: { state: 'ready' } });
  const signature = (payload: string, time = Math.floor(Date.now() / 1000), secret = SECRET) =>
    `time=${time},sig1=${createHmac('sha256', secret).update(`${time}.${payload}`).digest('hex')}`;
  const send = (payload: string, sig?: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: URL,
      headers: {
        'content-type': 'application/json',
        ...(sig ? { 'webhook-signature': sig } : {}),
        ...headers,
      },
      payload,
    });

  it('is off (404) without a configured secret', async () => {
    env.CLOUDFLARE_STREAM_WEBHOOK_SECRET = undefined;
    const payload = body('anything');
    expect((await send(payload, signature(payload))).statusCode).toBe(404);
  });

  it.each([
    ['no signature', undefined],
    ['the wrong secret', (p: string) => signature(p, undefined, 'other-secret')],
    ['a stale timestamp', (p: string) => signature(p, Math.floor(Date.now() / 1000) - 301)],
  ])('rejects %s with 403 and leaves the row alone', async (_name, sign) => {
    const { id, uid } = await video('PROCESSING');
    fake.set(uid, 'ready', { durationSeconds: 5 });
    const payload = body(uid);
    const res = await send(payload, sign?.(payload));
    expect(res.statusCode).toBe(403);
    expect((await rowOf(id)).status).toBe('PROCESSING');
  });

  it('rejects a body changed after signing', async () => {
    const { id, uid } = await video('PROCESSING');
    fake.set(uid, 'ready');
    const res = await send(body(uid).replace('true', 'false'), signature(body(uid)));
    expect(res.statusCode).toBe(403);
    expect((await rowOf(id)).status).toBe('PROCESSING');
  });

  it("applies the provider's state, not the event's, and ignores duplicates", async () => {
    const { id, uid } = await video('PROCESSING');
    fake.set(uid, 'ready', { durationSeconds: 12, byteSize: 2048 });
    const payload = body(uid);
    const res = await send(payload, signature(payload));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({});
    const ready = await rowOf(id);
    expect(ready).toMatchObject({ status: 'READY', durationSeconds: 12, byteSize: 2048 });

    expect((await send(payload, signature(payload))).statusCode).toBe(200);
    expect((await rowOf(id)).updatedAt).toEqual(ready.updatedAt);
  });

  it('never regresses a READY or REJECTED row on a replayed or out-of-order event', async () => {
    const ready = await video('READY');
    const rejected = await video('PENDING_UPLOAD');
    await prisma.mediaAsset.update({
      where: { id: rejected.id },
      data: { status: 'REJECTED', rejectionReason: 'PROCESSING_FAILED' },
    });
    fake.set(ready.uid, 'processing');
    fake.set(rejected.uid, 'ready');
    for (const uid of [ready.uid, rejected.uid]) {
      const payload = body(uid);
      expect((await send(payload, signature(payload))).statusCode).toBe(200);
    }
    expect((await rowOf(ready.id)).status).toBe('READY');
    expect((await rowOf(rejected.id)).status).toBe('REJECTED');
    expect(fake.deleted).toEqual([]);
  });

  it('rejects and deletes a video the provider failed to process', async () => {
    const { id, uid } = await video('PROCESSING');
    fake.set(uid, 'error');
    const payload = body(uid);
    expect((await send(payload, signature(payload))).statusCode).toBe(200);
    expect(await rowOf(id)).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'PROCESSING_FAILED',
    });
    await vi.waitFor(() => expect(fake.deleted).toContain(uid));
  });

  it('rejects an expired upload slot even when the provider has the video', async () => {
    const { id, uid } = await video('PENDING_UPLOAD', new Date(Date.now() - 1000));
    fake.set(uid, 'ready');
    const payload = body(uid);
    expect((await send(payload, signature(payload))).statusCode).toBe(200);
    expect((await rowOf(id)).rejectionReason).toBe('UPLOAD_EXPIRED');
  });

  it('refuses a non-JSON delivery without touching the row', async () => {
    const { id, uid } = await video('PROCESSING');
    fake.set(uid, 'ready');
    const payload = body(uid);
    const res = await send(payload, signature(payload), { 'content-type': 'text/plain' });
    expect(res.statusCode).toBe(403);
    expect((await rowOf(id)).status).toBe('PROCESSING');
  });

  it('acknowledges an unknown video', async () => {
    const payload = body('unknownvideo0001');
    expect((await send(payload, signature(payload))).statusCode).toBe(200);
  });

  it('rejects a signed body without a valid uid with 400', async () => {
    for (const payload of ['{"readyToStream":true}', '{"uid":"../etc"}']) {
      expect((await send(payload, signature(payload))).statusCode).toBe(400);
    }
  });

  it('answers 500 on a provider error so the event can be retried; the row is unchanged', async () => {
    const { id, uid } = await video('PROCESSING');
    fake.failNext.getStatus = true;
    const payload = body(uid);
    expect((await send(payload, signature(payload))).statusCode).toBe(500);
    expect((await rowOf(id)).status).toBe('PROCESSING');
  });

  it('still applies the CSRF check to a request carrying a session cookie', async () => {
    const { uid } = await video('PROCESSING');
    const payload = body(uid);
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: {
        'content-type': 'application/json',
        'webhook-signature': signature(payload),
        origin: 'https://evil.example',
      },
      cookies: { influency_session: SESSION_TOKEN },
      payload,
    });
    expect(res.statusCode).toBe(403);
  });
});
