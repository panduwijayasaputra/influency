import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  mediaUploadResponseSchema,
  POST_MEDIA_MAX_PER_POST,
  POST_VIDEO_MAX_BYTES,
  studioMediaListSchema,
  studioMediaSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createFakeVideoProvider } from '../../../test/fake-video-provider.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { VIDEO_PROVIDER } from '../../common/video-provider.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';
const MP4 = { contentType: 'video/mp4', byteSize: 4556 };

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-0000001e0001',
  creatorB: '0190a000-0000-7000-8000-0000001e0002',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-media-video-spec-${name}`;
const POSTS = {
  a: '0190a000-0000-7000-8000-0000001e0101',
  aLimit: '0190a000-0000-7000-8000-0000001e0102',
  b: '0190a000-0000-7000-8000-0000001e0201',
} as const;

describe('studio post video', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const fake = createFakeVideoProvider();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Video ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    const [profileA, profileB] = await Promise.all(
      (['creatorA', 'creatorB'] as const).map((name, i) =>
        prisma.creatorProfile.create({
          data: {
            userId: USERS[name],
            slug: `video-spec-${i}`,
            status: 'APPROVED',
            ...profileFields(name),
          },
        }),
      ),
    );
    await prisma.post.createMany({
      data: [
        { id: POSTS.a, creatorProfileId: profileA!.id, visibility: 'PREMIUM' },
        { id: POSTS.aLimit, creatorProfileId: profileA!.id, visibility: 'FREE' },
        { id: POSTS.b, creatorProfileId: profileB!.id, visibility: 'FREE' },
      ],
    });

    const telegram = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(telegram.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .overrideProvider(VIDEO_PROVIDER)
      .useValue(fake.provider)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const base = (postId: string) => `/api/v1/creators/me/posts/${postId}/media`;
  const cookies = (name: UserName) => ({ influency_session: token(name) });
  const slot = (name: UserName, postId: string, payload: object = MP4) =>
    app.inject({
      method: 'POST',
      url: base(postId),
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
      payload,
    });
  const complete = (name: UserName, postId: string, mediaId: string) =>
    app.inject({
      method: 'POST',
      url: `${base(postId)}/${mediaId}/complete`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
    });
  const list = (name: UserName, postId: string) =>
    app.inject({ method: 'GET', url: base(postId), cookies: cookies(name) });
  const listed = async (postId: string) =>
    studioMediaListSchema.parse((await list('creatorA', postId)).json()).media;
  const content = (name: UserName, postId: string, mediaId: string) =>
    app.inject({
      method: 'GET',
      url: `${base(postId)}/${mediaId}/content`,
      cookies: cookies(name),
    });
  const remove = (name: UserName, postId: string, mediaId: string) =>
    app.inject({
      method: 'DELETE',
      url: `${base(postId)}/${mediaId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
    });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const rowOf = (mediaId: string) =>
    prisma.mediaAsset.findUniqueOrThrow({ where: { id: mediaId } });

  /** Video slot on A's post; returns the media id and the provider uid. */
  const videoSlot = async (postId: string = POSTS.a) => {
    const res = await slot('creatorA', postId);
    expect(res.statusCode).toBe(201);
    const { media } = mediaUploadResponseSchema.parse(res.json());
    return { id: media.id, uid: (await rowOf(media.id)).videoUid! };
  };

  it('issues a provider upload slot without exposing the provider uid', async () => {
    const before = Date.now();
    const res = await slot('creatorA', POSTS.a);
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = mediaUploadResponseSchema.parse(res.json());
    expect(body.media).toMatchObject({
      kind: 'VIDEO',
      status: 'PENDING_UPLOAD',
      contentType: 'video/mp4',
      durationSeconds: null,
    });
    const row = await rowOf(body.media.id);
    expect(row).toMatchObject({ kind: 'VIDEO', objectKey: null });
    expect(body.upload).toMatchObject({
      url: `fake://upload/${row.videoUid}`,
      method: 'POST',
      headers: {},
      formField: 'file',
    });
    const expiresAt = Date.parse(body.upload.expiresAt);
    expect(expiresAt).toBeGreaterThanOrEqual(before + 1800_000 - 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + 1800_000 + 1000);
    // The uid appears only inside the one-shot upload URL.
    expect(JSON.stringify(body.media)).not.toContain(row.videoUid!);
  });

  it('validates the declared video type and size', async () => {
    for (const [payload, path] of [
      [{ contentType: 'video/mp4', byteSize: POST_VIDEO_MAX_BYTES + 1 }, 'byteSize'],
      [{ contentType: 'video/avi', byteSize: 10 }, 'contentType'],
    ] as const) {
      const res = await slot('creatorA', POSTS.a, payload);
      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(errorOf(res).details)).toContain(path);
    }
  });

  it('goes PENDING_UPLOAD → PROCESSING → READY via complete and list, idempotently', async () => {
    const { id, uid } = await videoSlot();

    const early = await complete('creatorA', POSTS.a, id);
    expect(early.statusCode).toBe(409);
    expect(errorOf(early).code).toBe('MEDIA_UPLOAD_MISSING');
    expect((await rowOf(id)).status).toBe('PENDING_UPLOAD');

    fake.set(uid, 'processing');
    const processing = await complete('creatorA', POSTS.a, id);
    expect(processing.statusCode).toBe(200);
    expect(studioMediaSchema.parse(processing.json()).status).toBe('PROCESSING');
    expect((await listed(POSTS.a)).find((m) => m.id === id)?.status).toBe('PROCESSING');

    fake.set(uid, 'ready', { durationSeconds: 12, byteSize: 1234 });
    expect((await listed(POSTS.a)).find((m) => m.id === id)).toMatchObject({
      status: 'READY',
      durationSeconds: 12,
      byteSize: 1234,
    });
    const again = await complete('creatorA', POSTS.a, id);
    expect(again.statusCode).toBe(200);
    expect(studioMediaSchema.parse(again.json())).toMatchObject({
      status: 'READY',
      byteSize: 1234,
    });
  });

  it('completes straight to READY when the provider is already done', async () => {
    const { id, uid } = await videoSlot();
    fake.set(uid, 'ready', { durationSeconds: 3 });
    const res = await complete('creatorA', POSTS.a, id);
    expect(studioMediaSchema.parse(res.json())).toMatchObject({
      status: 'READY',
      durationSeconds: 3,
      byteSize: MP4.byteSize,
    });
  });

  it('rejects a video the provider failed to process, on complete and while PROCESSING', async () => {
    const failed = await videoSlot();
    fake.set(failed.uid, 'error');
    const res = await complete('creatorA', POSTS.a, failed.id);
    expect(res.statusCode).toBe(422);
    expect(errorOf(res).code).toBe('VIDEO_PROCESSING_FAILED');
    expect((await rowOf(failed.id)).status).toBe('REJECTED');
    expect(fake.deleted).toContain(failed.uid);

    const later = await videoSlot();
    fake.set(later.uid, 'processing');
    await complete('creatorA', POSTS.a, later.id);
    fake.set(later.uid, 'error');
    expect((await listed(POSTS.a)).map((m) => m.id)).not.toContain(later.id);
    expect((await rowOf(later.id)).status).toBe('REJECTED');
    expect(fake.deleted).toContain(later.uid);
  });

  it('keeps the list working when the provider is down', async () => {
    const { id, uid } = await videoSlot();
    fake.set(uid, 'processing');
    await complete('creatorA', POSTS.a, id);
    fake.failNext.getStatus = true;
    const res = await list('creatorA', POSTS.a);
    expect(res.statusCode).toBe(200);
    expect((await rowOf(id)).status).toBe('PROCESSING');
  });

  it('has no owner content route for video', async () => {
    const { id, uid } = await videoSlot();
    fake.set(uid, 'ready');
    await complete('creatorA', POSTS.a, id);
    const res = await content('creatorA', POSTS.a, id);
    expect(res.statusCode).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });

  it('deletes the row and the provider video; a provider failure still deletes the row', async () => {
    const first = await videoSlot();
    expect((await remove('creatorA', POSTS.a, first.id)).statusCode).toBe(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: first.id } })).toBeNull();
    expect(fake.deleted).toContain(first.uid);

    const second = await videoSlot();
    fake.failNext.delete = true;
    expect((await remove('creatorA', POSTS.a, second.id)).statusCode).toBe(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: second.id } })).toBeNull();
  });

  it('counts PROCESSING videos toward the per-post limit', async () => {
    for (let i = 0; i < POST_MEDIA_MAX_PER_POST - 1; i++) {
      await prisma.mediaAsset.create({
        data: {
          postId: POSTS.aLimit,
          kind: 'IMAGE',
          status: 'READY',
          objectKey: `post-media/0190a000-0000-7000-8000-0000001e1${String(i).padStart(3, '0')}`,
          contentType: 'image/png',
          byteSize: 1,
          uploadExpiresAt: new Date(),
        },
      });
    }
    const { id, uid } = await videoSlot(POSTS.aLimit);
    fake.set(uid, 'processing');
    await complete('creatorA', POSTS.aLimit, id);
    // Expire the slot: only the PROCESSING status keeps it counting now.
    await prisma.mediaAsset.update({ where: { id }, data: { uploadExpiresAt: new Date(0) } });
    const res = await slot('creatorA', POSTS.aLimit);
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('MEDIA_LIMIT_REACHED');
  });

  it("isolates creators: B can't touch A's video, and nothing changes", async () => {
    const { id, uid } = await videoSlot();
    fake.set(uid, 'processing');
    const unknown = await complete('creatorB', POSTS.a, UNKNOWN_ID);
    for (const res of [
      await complete('creatorB', POSTS.a, id),
      await complete('creatorB', POSTS.b, id),
      await list('creatorB', POSTS.a),
      await content('creatorB', POSTS.a, id),
      await remove('creatorB', POSTS.a, id),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(errorOf(res)).toMatchObject({ code: 'NOT_FOUND', message: errorOf(unknown).message });
    }
    expect((await rowOf(id)).status).toBe('PENDING_UPLOAD');
    expect(fake.deleted).not.toContain(uid);
  });

  it('enforces the storage reference CHECK in the database', async () => {
    await expect(
      prisma.mediaAsset.create({
        data: {
          postId: POSTS.a,
          kind: 'VIDEO',
          videoUid: 'check-violation-uid',
          objectKey: 'post-media/0190a000-0000-7000-8000-0000001e0f99',
          contentType: 'video/mp4',
          byteSize: 1,
          uploadExpiresAt: new Date(),
        },
      }),
    ).rejects.toThrow(/media_assets_storage_ref/);
    await expect(
      prisma.mediaAsset.create({
        data: {
          postId: POSTS.a,
          kind: 'IMAGE',
          contentType: 'image/png',
          byteSize: 1,
          uploadExpiresAt: new Date(),
        },
      }),
    ).rejects.toThrow(/media_assets_storage_ref/);
  });
});
