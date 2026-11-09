import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  mediaUploadResponseSchema,
  POST_MEDIA_MAX_PER_POST,
  POST_VIDEO_MAX_BYTES,
  POST_VIDEO_MAX_DURATION_SECONDS,
  studioMediaListSchema,
} from '@influency/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createFakeVideoProvider } from '../../../test/fake-video-provider.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, type Env } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { VIDEO_PROVIDER } from '../../common/video-provider.js';
import type { MediaStatus } from '../../generated/prisma/client.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { PostMediaService } from './post-media.service.js';

const WEB_ORIGIN = 'http://localhost:3000';
const MP4 = { contentType: 'video/mp4', byteSize: 4556 };
// Stale rows live in 1965 and sweeps run "then": the sweep takes every row expiring before `now`, so this must predate
// anything other specs store (e.g. new Date(0)) to never touch their rows on the shared test DB. Not earlier: pre-1964
// local-mean-time zone offsets (e.g. Asia/Jakarta) skew timestamps on the pg round trip.
const EPOCH = new Date('1965-01-01T00:00:00.000Z');
const at = (seconds: number) => new Date(EPOCH.getTime() + seconds * 1000);

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-000000260001',
  creatorB: '0190a000-0000-7000-8000-000000260002',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `media-cleanup-spec-${name}`;
const POSTS = {
  draft: '0190a000-0000-7000-8000-000000260101',
  live: '0190a000-0000-7000-8000-000000260102',
  b: '0190a000-0000-7000-8000-000000260201',
} as const;

describe('stale media cleanup', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const postIds = Object.values(POSTS);
  const fake = createFakeVideoProvider();
  const memory = createMemoryStorage();
  let app: NestFastifyApplication;
  let media: PostMediaService;
  let env: Env;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Cleanup ${name}` })),
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
            slug: `cleanup-spec-${i}`,
            status: 'APPROVED',
            ...profileFields(name),
          },
        }),
      ),
    );
    await prisma.post.createMany({
      data: [
        { id: POSTS.draft, creatorProfileId: profileA!.id, visibility: 'FREE' },
        {
          id: POSTS.live,
          creatorProfileId: profileA!.id,
          visibility: 'FREE',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
        { id: POSTS.b, creatorProfileId: profileB!.id, visibility: 'FREE' },
      ],
    });

    const telegram = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(telegram.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(memory.storage)
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
    media = app.get(PostMediaService);
    env = app.get(ENV);
  });

  afterEach(async () => {
    await prisma.mediaAsset.deleteMany({ where: { postId: { in: postIds } } });
    fake.deleted.length = 0;
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
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const rowOf = (id: string) => prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
  const list = (name: UserName, postId: string) =>
    app.inject({ method: 'GET', url: base(postId), cookies: cookies(name) });
  const remove = (name: UserName, postId: string, mediaId: string) =>
    app.inject({
      method: 'DELETE',
      url: `${base(postId)}/${mediaId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
    });
  const complete = (postId: string, mediaId: string) =>
    app.inject({
      method: 'POST',
      url: `${base(postId)}/${mediaId}/complete`,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies('creatorA'),
    });
  const videoSlot = async () => {
    const res = await app.inject({
      method: 'POST',
      url: base(POSTS.draft),
      headers: { origin: WEB_ORIGIN },
      cookies: cookies('creatorA'),
      payload: MP4,
    });
    expect(res.statusCode).toBe(201);
    const { media: item } = mediaUploadResponseSchema.parse(res.json());
    return { id: item.id, uid: (await rowOf(item.id)).videoUid! };
  };

  let seq = 0;
  /** Inserts a row directly; videos get a provider entry in `state`. */
  const insert = async (
    kind: 'IMAGE' | 'VIDEO',
    status: MediaStatus,
    uploadExpiresAt: Date,
    options: { postId?: string; state?: 'pending_upload' | 'processing' | 'ready' } = {},
  ) => {
    seq += 1;
    const uid = `cleanup${String(seq).padStart(8, '0')}`;
    const key = `post-media/cleanup-${seq}`;
    if (kind === 'VIDEO') fake.set(uid, options.state ?? 'processing');
    else memory.objects.set(key, { body: Buffer.from('x'), contentType: 'image/png' });
    const row = await prisma.mediaAsset.create({
      data: {
        postId: options.postId ?? POSTS.draft,
        kind,
        status,
        ...(kind === 'VIDEO' ? { videoUid: uid } : { objectKey: key }),
        contentType: kind === 'VIDEO' ? 'video/mp4' : 'image/png',
        byteSize: 1,
        uploadExpiresAt,
      },
    });
    return { id: row.id, uid, key };
  };

  describe('sweep', () => {
    it('rejects an expired image slot and deletes its object', async () => {
      const stale = await insert('IMAGE', 'PENDING_UPLOAD', at(0));
      expect(await media.sweep(at(1))).toBe(1);
      expect(await rowOf(stale.id)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'UPLOAD_EXPIRED',
      });
      await vi.waitFor(() => expect(memory.objects.has(stale.key)).toBe(false));
    });

    it('rejects an expired video slot and deletes the provider video without asking for its status', async () => {
      const stale = await insert('VIDEO', 'PENDING_UPLOAD', at(0), { state: 'ready' });
      const getStatus = vi.spyOn(fake.provider, 'getStatus');
      await media.sweep(at(1));
      expect(getStatus).not.toHaveBeenCalled();
      getStatus.mockRestore();
      expect(await rowOf(stale.id)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'UPLOAD_EXPIRED',
      });
      await vi.waitFor(() => expect(fake.deleted).toContain(stale.uid));
    });

    it('rejects a video still processing past the timeout; keeps one that turned ready and one within it', async () => {
      const timeout = env.VIDEO_PROCESSING_TIMEOUT_SECONDS;
      const stuck = await insert('VIDEO', 'PROCESSING', at(0));
      const finished = await insert('VIDEO', 'PROCESSING', at(0), { state: 'ready' });
      const recent = await insert('VIDEO', 'PROCESSING', at(10));
      expect(await media.sweep(at(timeout))).toBe(2);
      expect(await rowOf(stuck.id)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'PROCESSING_TIMEOUT',
      });
      await vi.waitFor(() => expect(fake.deleted).toContain(stuck.uid));
      expect((await rowOf(finished.id)).status).toBe('READY');
      expect((await rowOf(recent.id)).status).toBe('PROCESSING');
      expect(fake.deleted).not.toContain(finished.uid);
    });

    it('skips a row whose provider check fails and continues with the next', async () => {
      const failing = await insert('VIDEO', 'PROCESSING', at(0));
      const next = await insert('VIDEO', 'PROCESSING', at(1));
      fake.failNext.getStatus = true;
      const timeout = env.VIDEO_PROCESSING_TIMEOUT_SECONDS;
      expect(await media.sweep(at(timeout + 1))).toBe(2);
      expect((await rowOf(failing.id)).status).toBe('PROCESSING');
      expect((await rowOf(next.id)).rejectionReason).toBe('PROCESSING_TIMEOUT');
      expect(fake.deleted).not.toContain(failing.uid);
    });

    it('never deletes a video that became READY while it was being rejected', async () => {
      const raced = await insert('VIDEO', 'PROCESSING', at(0));
      // A concurrent poll wins between the sweep's read and its reject.
      const getStatus = vi.spyOn(fake.provider, 'getStatus').mockImplementation(async (uid) => {
        await prisma.mediaAsset.update({ where: { id: raced.id }, data: { status: 'READY' } });
        return fake.videos.get(uid) ?? null;
      });
      await media.sweep(at(env.VIDEO_PROCESSING_TIMEOUT_SECONDS));
      getStatus.mockRestore();
      expect(await rowOf(raced.id)).toMatchObject({ status: 'READY', rejectionReason: null });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(fake.deleted).not.toContain(raced.uid);
    });

    it('is idempotent and leaves READY and REJECTED rows alone', async () => {
      const stale = await insert('VIDEO', 'PENDING_UPLOAD', at(0));
      const ready = await insert('VIDEO', 'READY', at(0), { state: 'ready' });
      const rejected = await insert('IMAGE', 'REJECTED', at(0));
      expect(await media.sweep(at(1))).toBe(1);
      expect(await media.sweep(at(1))).toBe(0);
      await vi.waitFor(() => expect(fake.deleted).toEqual([stale.uid]));
      expect((await rowOf(ready.id)).status).toBe('READY');
      expect(await rowOf(rejected.id)).toMatchObject({ status: 'REJECTED', rejectionReason: null });
    });

    it('handles at most 100 rows per run', async () => {
      await prisma.mediaAsset.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          postId: POSTS.draft,
          kind: 'IMAGE' as const,
          objectKey: `post-media/cleanup-batch-${i}`,
          contentType: 'image/png',
          byteSize: 1,
          uploadExpiresAt: at(i),
        })),
      });
      expect(await media.sweep(at(1000))).toBe(100);
      expect(await media.sweep(at(1000))).toBe(1);
    });
  });

  describe('limits re-checked when a video is ready', () => {
    it('rejects a video longer than the max duration and deletes it', async () => {
      const { id, uid } = await videoSlot();
      fake.set(uid, 'ready', { durationSeconds: POST_VIDEO_MAX_DURATION_SECONDS + 1 });
      const res = await complete(POSTS.draft, id);
      expect(res.statusCode).toBe(422);
      expect(errorOf(res)).toMatchObject({
        code: 'VIDEO_TOO_LONG',
        details: { maxSeconds: POST_VIDEO_MAX_DURATION_SECONDS },
      });
      expect(await rowOf(id)).toMatchObject({ status: 'REJECTED', rejectionReason: 'TOO_LONG' });
      await vi.waitFor(() => expect(fake.deleted).toContain(uid));
    });

    it('rejects a video larger than the max size', async () => {
      const { id, uid } = await videoSlot();
      fake.set(uid, 'ready', { durationSeconds: 5, byteSize: POST_VIDEO_MAX_BYTES + 1 });
      const res = await complete(POSTS.draft, id);
      expect(res.statusCode).toBe(413);
      expect(errorOf(res).code).toBe('FILE_TOO_LARGE');
      expect((await rowOf(id)).rejectionReason).toBe('TOO_LARGE');
    });

    it('accepts a video at exactly the limits', async () => {
      const { id, uid } = await videoSlot();
      fake.set(uid, 'ready', {
        durationSeconds: POST_VIDEO_MAX_DURATION_SECONDS,
        byteSize: POST_VIDEO_MAX_BYTES,
      });
      expect((await complete(POSTS.draft, id)).statusCode).toBe(200);
      expect((await rowOf(id)).status).toBe('READY');
    });

    it('marks a video failed when processing outlasts the timeout, on poll', async () => {
      const { id, uid } = await videoSlot();
      fake.set(uid, 'processing');
      expect((await complete(POSTS.draft, id)).statusCode).toBe(200);
      const deadline = Date.now() - env.VIDEO_PROCESSING_TIMEOUT_SECONDS * 1000 - 1000;
      await prisma.mediaAsset.update({
        where: { id },
        data: { uploadExpiresAt: new Date(deadline) },
      });
      const item = studioMediaListSchema
        .parse((await list('creatorA', POSTS.draft)).json())
        .media.find((m) => m.id === id);
      expect(item).toMatchObject({ status: 'REJECTED', rejectionReason: 'PROCESSING_TIMEOUT' });
    });
  });

  describe('studio list and remove', () => {
    it('lists failed items with their reason, rejects expired slots and hides in-flight ones', async () => {
      const expired = await insert('IMAGE', 'PENDING_UPLOAD', new Date(Date.now() - 1000));
      const inFlight = await insert('IMAGE', 'PENDING_UPLOAD', new Date(Date.now() + 60_000));
      const items = studioMediaListSchema.parse((await list('creatorA', POSTS.draft)).json()).media;
      expect(items.find((m) => m.id === expired.id)).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'UPLOAD_EXPIRED',
      });
      expect(items.map((m) => m.id)).not.toContain(inFlight.id);
    });

    it('failed items do not count toward the per-post limit', async () => {
      for (let i = 0; i < POST_MEDIA_MAX_PER_POST; i++) {
        await insert('IMAGE', 'REJECTED', new Date());
      }
      const res = await app.inject({
        method: 'POST',
        url: base(POSTS.draft),
        headers: { origin: WEB_ORIGIN },
        cookies: cookies('creatorA'),
        payload: { contentType: 'image/png', byteSize: 10 },
      });
      expect(res.statusCode).toBe(201);
    });

    it('removes a failed item from a published post, but not a READY one', async () => {
      const failed = await insert('IMAGE', 'REJECTED', new Date(), { postId: POSTS.live });
      const ready = await insert('IMAGE', 'READY', new Date(), { postId: POSTS.live });
      expect((await remove('creatorA', POSTS.live, failed.id)).statusCode).toBe(204);
      expect(await prisma.mediaAsset.findUnique({ where: { id: failed.id } })).toBeNull();
      const locked = await remove('creatorA', POSTS.live, ready.id);
      expect(locked.statusCode).toBe(409);
      expect(errorOf(locked).code).toBe('POST_LOCKED');
    });

    it("can't remove another creator's failed item", async () => {
      const failed = await insert('IMAGE', 'REJECTED', new Date(), { postId: POSTS.b });
      expect((await remove('creatorA', POSTS.b, failed.id)).statusCode).toBe(404);
      expect(await prisma.mediaAsset.findUnique({ where: { id: failed.id } })).not.toBeNull();
    });
  });

  it('the database refuses a rejection reason on a non-REJECTED row', async () => {
    const row = await insert('IMAGE', 'READY', new Date());
    await expect(
      prisma.mediaAsset.update({
        where: { id: row.id },
        data: { rejectionReason: 'TOO_LARGE' },
      }),
    ).rejects.toThrow(/media_assets_rejection_reason_status/);
  });
});
