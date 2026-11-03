import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import sharp from 'sharp';
import {
  errorResponseSchema,
  type PostStatus,
  type PostVisibility,
  studioPostSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createFakeVideoProvider } from '../../../test/fake-video-provider.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { VIDEO_PROVIDER } from '../../common/video-provider.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-000000240001',
  creatorB: '0190a000-0000-7000-8000-000000240002',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-cover-spec-${name}`;

/** Noisy RGB PNG: plenty of fine detail a preview must not carry. */
function png(width: number, height = width): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 256;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

describe('studio post cover', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  const fake = createFakeVideoProvider();
  const profiles = {} as Record<UserName, string>;
  let app: NestFastifyApplication;
  let clearApp: NestFastifyApplication;

  async function boot(env: Record<string, string> = {}) {
    const telegram = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(telegram.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(memory.storage)
      .overrideProvider(VIDEO_PROVIDER)
      .useValue(fake.provider)
      .overrideProvider(ENV)
      .useValue(parseEnv({ ...process.env, ...env }))
      .compile();
    const instance = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await instance.init();
    await instance.getHttpAdapter().getInstance().ready();
    return instance;
  }

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Cover ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    for (const [i, name] of (['creatorA', 'creatorB'] as const).entries()) {
      const profile = await prisma.creatorProfile.create({
        data: {
          userId: USERS[name],
          slug: `cover-spec-${i}`,
          status: 'APPROVED',
          ...profileFields(name),
        },
      });
      profiles[name] = profile.id;
    }
    app = await boot();
    clearApp = await boot({ PREMIUM_COVER_CLEAR_ALLOWED: 'true' });
  });

  afterAll(async () => {
    await Promise.all([app.close(), clearApp.close()]);
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.post.updateMany({ where, data: { coverMediaId: null, previewKey: null } });
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const newPost = async (
    visibility: PostVisibility = 'PREMIUM',
    status: PostStatus = 'DRAFT',
    owner: UserName = 'creatorA',
  ) =>
    (
      await prisma.post.create({
        data: { creatorProfileId: profiles[owner], visibility, status },
      })
    ).id;
  const addImage = async (postId: string, status: 'READY' | 'PENDING_UPLOAD' = 'READY') => {
    const objectKey = `post-media/${randomUUID()}`;
    const body = await png(256);
    memory.objects.set(objectKey, { body, contentType: 'image/png' });
    const row = await prisma.mediaAsset.create({
      data: {
        postId,
        kind: 'IMAGE',
        status,
        objectKey,
        contentType: 'image/png',
        byteSize: body.length,
        uploadExpiresAt: new Date(),
      },
    });
    return { id: row.id, objectKey, body };
  };
  const addVideo = async (postId: string) => {
    const videoUid = randomUUID().replaceAll('-', '');
    const row = await prisma.mediaAsset.create({
      data: {
        postId,
        kind: 'VIDEO',
        status: 'READY',
        videoUid,
        contentType: 'video/mp4',
        byteSize: 1000,
        uploadExpiresAt: new Date(),
      },
    });
    return { id: row.id, videoUid };
  };

  const base = (postId: string) => `/api/v1/creators/me/posts/${postId}/cover`;
  const cookies = (name: UserName) => ({ influency_session: token(name) });
  const setMedia = (postId: string, payload: object, name: UserName = 'creatorA', on = app) =>
    on.inject({
      method: 'PUT',
      url: base(postId),
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
      payload,
    });
  const upload = (
    postId: string,
    body: Buffer | string,
    contentType = 'image/png',
    on = app,
    name: UserName = 'creatorA',
  ) =>
    on.inject({
      method: 'PUT',
      url: `${base(postId)}/image`,
      headers: { origin: WEB_ORIGIN, 'content-type': contentType },
      cookies: cookies(name),
      payload: body,
    });
  const remove = (postId: string, name: UserName = 'creatorA') =>
    app.inject({
      method: 'DELETE',
      url: base(postId),
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
    });
  const ownerPreview = (postId: string, name: UserName = 'creatorA') =>
    app.inject({ method: 'GET', url: `${base(postId)}/preview`, cookies: cookies(name) });
  const previewKey = async (postId: string) =>
    (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).previewKey;
  const errorCode = (res: { json: () => unknown }) =>
    errorResponseSchema.parse(res.json()).error.code;
  const widthOf = async (key: string) =>
    (await sharp(memory.objects.get(key)!.body).metadata()).width;

  it('uses a post image: stores a separate, blurred WebP preview', async () => {
    const postId = await newPost();
    const image = await addImage(postId);
    const res = await setMedia(postId, { mediaId: image.id });
    expect(res.statusCode).toBe(200);
    const post = studioPostSchema.parse(res.json());
    const key = (await previewKey(postId))!;
    expect(key).toMatch(/^post-previews\/[0-9a-f-]{36}$/);
    expect(key).not.toBe(image.objectKey);
    expect(post.cover).toEqual({
      mediaId: image.id,
      previewUrl: `/api/v1/creators/me/posts/${postId}/cover/preview?v=${key.slice('post-previews/'.length)}`,
    });
    const stored = memory.objects.get(key)!;
    expect(stored.contentType).toBe('image/webp');
    expect(Buffer.from(stored.body).equals(image.body)).toBe(false);
    expect(await widthOf(key)).toBeLessThanOrEqual(320);
    // The original is untouched.
    expect(memory.objects.get(image.objectKey)!.body).toBe(image.body);
  });

  it("uses a video's provider thumbnail", async () => {
    const postId = await newPost();
    const video = await addVideo(postId);
    fake.thumbnails.set(video.videoUid, await png(640, 360));
    const res = await setMedia(postId, { mediaId: video.id });
    expect(res.statusCode).toBe(200);
    expect(studioPostSchema.parse(res.json()).cover?.mediaId).toBe(video.id);
    expect(JSON.stringify(res.json())).not.toContain(video.videoUid);
  });

  it('is COVER_SOURCE_UNAVAILABLE when the provider has no thumbnail or fails', async () => {
    const postId = await newPost();
    const video = await addVideo(postId);
    const missing = await setMedia(postId, { mediaId: video.id });
    expect(missing.statusCode).toBe(409);
    expect(errorCode(missing)).toBe('COVER_SOURCE_UNAVAILABLE');
    fake.thumbnails.set(video.videoUid, await png(64));
    fake.failNext.getThumbnail = true;
    const failed = await setMedia(postId, { mediaId: video.id });
    expect(errorCode(failed)).toBe('COVER_SOURCE_UNAVAILABLE');
    expect(await previewKey(postId)).toBeNull();
  });

  it('rejects FREE posts with COVER_REQUIRES_PREMIUM', async () => {
    const postId = await newPost('FREE');
    const image = await addImage(postId);
    for (const res of [
      await setMedia(postId, { mediaId: image.id }),
      await upload(postId, await png(64)),
    ]) {
      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe('COVER_REQUIRES_PREMIUM');
    }
  });

  it('treats foreign posts and media that are not this post’s READY media as NOT_FOUND', async () => {
    const foreign = await newPost('PREMIUM', 'DRAFT', 'creatorB');
    const foreignImage = await addImage(foreign);
    const own = await newPost();
    const otherOwn = await newPost();
    const otherImage = await addImage(otherOwn);
    const pending = await addImage(own, 'PENDING_UPLOAD');
    for (const res of [
      await setMedia(foreign, { mediaId: foreignImage.id }),
      await setMedia(own, { mediaId: foreignImage.id }),
      await setMedia(own, { mediaId: otherImage.id }),
      await setMedia(own, { mediaId: pending.id }),
      await setMedia(own, { mediaId: UNKNOWN_ID }),
      await upload(foreign, await png(64)),
      await remove(foreign),
      await ownerPreview(foreign),
    ]) {
      expect(res.statusCode).toBe(404);
    }
    expect(await previewKey(foreign)).toBeNull();
  });

  it.each([{ mediaId: 'nope' }, {}, { mediaId: UNKNOWN_ID, atSeconds: 1 }])(
    'validates the body %j',
    async (payload) => {
      const res = await setMedia(await newPost(), payload);
      expect(res.statusCode).toBe(400);
    },
  );

  it('accepts a dedicated upload (blurred by default, mediaId null)', async () => {
    const postId = await newPost();
    const res = await upload(postId, await png(1024));
    expect(res.statusCode).toBe(200);
    expect(studioPostSchema.parse(res.json()).cover?.mediaId).toBeNull();
    expect(await widthOf((await previewKey(postId))!)).toBeLessThanOrEqual(320);
  });

  it.each([
    ['a JSON body', JSON.stringify({ a: 1 }), 'application/json', 415],
    ['non-image bytes', '%PDF-1.7 not an image', 'image/png', 415],
    [
      'undecodable bytes with PNG magic',
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(64),
      ]),
      'image/png',
      415,
    ],
    [
      'an image over 5 MiB',
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        Buffer.alloc(5 * 1024 * 1024),
      ]),
      'image/png',
      413,
    ],
  ])('rejects %s', async (_name, body, contentType, status) => {
    const postId = await newPost();
    const res = await upload(postId, body, contentType);
    expect(res.statusCode).toBe(status);
    expect(await previewKey(postId)).toBeNull();
  });

  it('PREMIUM_COVER_CLEAR_ALLOWED keeps a dedicated upload clear, but post media stays blurred', async () => {
    const uploaded = await newPost();
    expect((await upload(uploaded, await png(1024), 'image/png', clearApp)).statusCode).toBe(200);
    expect(await widthOf((await previewKey(uploaded))!)).toBe(640);
    const fromMedia = await newPost();
    const image = await addImage(fromMedia);
    expect(
      (await setMedia(fromMedia, { mediaId: image.id }, 'creatorA', clearApp)).statusCode,
    ).toBe(200);
    expect(await widthOf((await previewKey(fromMedia))!)).toBeLessThanOrEqual(320);
  });

  it('changing the cover regenerates the preview and deletes the old one', async () => {
    const postId = await newPost();
    const first = await addImage(postId);
    const second = await addImage(postId);
    await setMedia(postId, { mediaId: first.id });
    const oldKey = (await previewKey(postId))!;
    const res = await setMedia(postId, { mediaId: second.id });
    expect(res.statusCode).toBe(200);
    const newKey = (await previewKey(postId))!;
    expect(newKey).not.toBe(oldKey);
    expect(memory.objects.has(newKey)).toBe(true);
    await vi.waitFor(() => expect(memory.objects.has(oldKey)).toBe(false));
  });

  it('serializes concurrent changes without orphaning a preview', async () => {
    const postId = await newPost();
    const image = await addImage(postId);
    const before = new Set(
      [...memory.objects.keys()].filter((k) => k.startsWith('post-previews/')),
    );
    const results = await Promise.all([
      setMedia(postId, { mediaId: image.id }),
      setMedia(postId, { mediaId: image.id }),
      upload(postId, await png(64)),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const finalKey = (await previewKey(postId))!;
    await vi.waitFor(() => {
      const created = [...memory.objects.keys()].filter(
        (k) => k.startsWith('post-previews/') && !before.has(k),
      );
      expect(created).toEqual([finalKey]);
    });
  });

  it.each(['PUBLISHED', 'ARCHIVED'] as const)('works on a %s post', async (status) => {
    const postId = await newPost('PREMIUM', status);
    const image = await addImage(postId);
    expect((await setMedia(postId, { mediaId: image.id })).statusCode).toBe(200);
  });

  it('DELETE clears the cover and its preview, idempotently', async () => {
    const postId = await newPost();
    await upload(postId, await png(64));
    const key = (await previewKey(postId))!;
    const res = await remove(postId);
    expect(res.statusCode).toBe(200);
    expect(studioPostSchema.parse(res.json()).cover).toBeNull();
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));
    expect((await remove(postId)).statusCode).toBe(200);
  });

  it('deleting the cover media clears the cover; deleting other media keeps it', async () => {
    const postId = await newPost();
    const cover = await addImage(postId);
    const other = await addImage(postId);
    await setMedia(postId, { mediaId: cover.id });
    const key = (await previewKey(postId))!;
    const deleteMedia = (mediaId: string) =>
      app.inject({
        method: 'DELETE',
        url: `/api/v1/creators/me/posts/${postId}/media/${mediaId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: cookies('creatorA'),
      });
    expect((await deleteMedia(other.id)).statusCode).toBe(204);
    expect(await previewKey(postId)).toBe(key);
    expect((await deleteMedia(cover.id)).statusCode).toBe(204);
    const row = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
    expect(row).toMatchObject({ coverMediaId: null, previewKey: null });
    await vi.waitFor(() => expect(memory.objects.has(key)).toBe(false));
  });

  it('shows the owner the stored preview, privately', async () => {
    const postId = await newPost();
    expect((await ownerPreview(postId)).statusCode).toBe(404);
    await upload(postId, await png(64));
    const res = await ownerPreview(postId);
    expect(res.statusCode).toBe(200);
    expect(res.headers).toMatchObject({
      'content-type': 'image/webp',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(
      res.rawPayload.equals(Buffer.from(memory.objects.get((await previewKey(postId))!)!.body)),
    ).toBe(true);
  });

  it('the DB refuses a media cover without a preview', async () => {
    const postId = await newPost();
    const image = await addImage(postId);
    await expect(
      prisma.$executeRaw`UPDATE posts SET cover_media_id = ${image.id}::uuid WHERE id = ${postId}::uuid`,
    ).rejects.toThrow(/posts_cover_has_preview/);
  });
});
