import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { mediaAccessResponseSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
import { MEDIA_ACCESS_RATE_LIMIT } from './media-access.controller.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000250001',
  stranger: '0190a000-0000-7000-8000-000000250002',
  limited: '0190a000-0000-7000-8000-000000250003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `media-access-spec-${name}`;
const SESSION_IDS = {
  creator: '0190a000-0000-7000-8000-000000250101',
  stranger: '0190a000-0000-7000-8000-000000250102',
  limited: '0190a000-0000-7000-8000-000000250103',
} as const;
const EXPIRED_TOKEN = 'media-access-spec-expired';

async function boot() {
  const memory = createMemoryStorage();
  const video = createFakeVideoProvider();
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(memory.storage)
    .overrideProvider(VIDEO_PROVIDER)
    .useValue(video.provider)
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return { app, video };
}

describe('GET /posts/:id/media-access', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;
  let video: ReturnType<typeof createFakeVideoProvider>;

  const media = async (
    postId: string,
    kind: 'IMAGE' | 'VIDEO',
    status: 'READY' | 'PENDING_UPLOAD' = 'READY',
  ) => {
    const row = await prisma.mediaAsset.create({
      data: {
        postId,
        kind,
        status,
        ...(kind === 'IMAGE'
          ? { objectKey: `post-media/${randomUUID()}`, contentType: 'image/png' }
          : {
              videoUid: randomUUID().replaceAll('-', ''),
              contentType: 'video/mp4',
              durationSeconds: 65,
            }),
        byteSize: 10,
        uploadExpiresAt: new Date(),
      },
    });
    if (row.videoUid) video.set(row.videoUid, 'ready');
    return row;
  };

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Media ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: [
        ...(Object.keys(USERS) as UserName[]).map((name) => ({
          id: SESSION_IDS[name],
          userId: USERS[name],
          tokenHash: sha256hex(token(name)),
          expiresAt,
        })),
        {
          userId: USERS.stranger,
          tokenHash: sha256hex(EXPIRED_TOKEN),
          expiresAt: new Date(Date.now() - 1000),
        },
      ],
    });
    const creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: 'media-access-spec',
          status: 'APPROVED',
          ...profileFields('Media'),
        },
      })
    ).id;
    const post = async (
      key: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    ) => {
      posts[key] = (
        await prisma.post.create({
          data: {
            creatorProfileId,
            visibility,
            status,
            publishedAt: status === 'DRAFT' ? null : new Date(),
          },
        })
      ).id;
    };
    await post('free', 'FREE', 'PUBLISHED');
    await post('premium', 'PREMIUM', 'PUBLISHED');
    await post('draft', 'PREMIUM', 'DRAFT');
    await post('archived', 'FREE', 'ARCHIVED');
    await post('removable', 'FREE', 'PUBLISHED');
    await post('limited', 'FREE', 'PUBLISHED');

    ({ app, video } = await boot());
    await media(posts.free!, 'IMAGE');
    await media(posts.free!, 'VIDEO');
    await media(posts.free!, 'IMAGE', 'PENDING_UPLOAD');
    await media(posts.premium!, 'IMAGE');
    await media(posts.draft!, 'IMAGE');
    await media(posts.removable!, 'IMAGE');
  });

  afterEach(() => vi.restoreAllMocks());

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

  const get = (postId: string, cookie?: string, target = app) =>
    target.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/media-access`,
      cookies: cookie ? { [SESSION_COOKIE]: cookie } : {},
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;

  it('free published post: anonymous gets short-lived URLs for READY media only, in order', async () => {
    const res = await get(posts.free!);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = mediaAccessResponseSchema.parse(res.json());
    expect(body.media.map((m) => m.kind)).toEqual(['IMAGE', 'VIDEO']);
    expect(body.media[0]!.url).toMatch(/^memory:\/\/download\/post-media\//);
    const clip = body.media[1]!;
    expect(clip).toMatchObject({ kind: 'VIDEO', player: 'hls', durationSeconds: 65 });
    expect(clip.url).toMatch(/^fake:\/\/play\//);
    expect(clip.kind === 'VIDEO' && clip.posterUrl).toMatch(/^fake:\/\/poster\//);
    expect(body.watermark).toBeNull();
    const ttlMs = Date.parse(body.expiresAt) - Date.now();
    expect(ttlMs).toBeGreaterThan(1790_000);
    expect(ttlMs).toBeLessThanOrEqual(1800_000);
  });

  it('premium post without access: 403 FORBIDDEN and no URLs, anonymous or logged in', async () => {
    for (const res of [await get(posts.premium!), await get(posts.premium!, token('stranger'))]) {
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
      expect(res.body).not.toContain('memory://');
      expect(res.body).not.toContain('fake://');
      expect(res.json()).not.toHaveProperty('media');
    }
  });

  it('owner sees their draft premium post, with a pseudonymous session watermark', async () => {
    const res = await get(posts.draft!, token('creator'));
    expect(res.statusCode).toBe(200);
    const body = mediaAccessResponseSchema.parse(res.json());
    expect(body.media).toHaveLength(1);
    expect(body.watermark).toBe(sha256hex(SESSION_IDS.creator).slice(0, 8));
    expect(body.watermark).not.toContain(USERS.creator);
  });

  it('hidden posts and unknown ids → 404; malformed id → 400', async () => {
    for (const id of [posts.draft!, posts.archived!, randomUUID()]) {
      const res = await get(id);
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
    }
    expect((await get('not-a-uuid')).statusCode).toBe(400);
  });

  it('an expired or unknown session counts as anonymous', async () => {
    for (const cookie of [EXPIRED_TOKEN, 'no-such-session']) {
      const free = await get(posts.free!, cookie);
      expect(free.statusCode).toBe(200);
      expect(free.json<{ watermark: unknown }>().watermark).toBeNull();
      expect((await get(posts.premium!, cookie)).statusCode).toBe(403);
    }
  });

  it('every refresh re-runs the access check', async () => {
    expect((await get(posts.removable!)).statusCode).toBe(200);
    await prisma.post.update({ where: { id: posts.removable! }, data: { status: 'REMOVED' } });
    expect((await get(posts.removable!)).statusCode).toBe(404);
  });

  it('skips a READY video the provider can no longer play', async () => {
    const row = await media(posts.free!, 'VIDEO');
    video.set(row.videoUid!, 'error');
    const body = mediaAccessResponseSchema.parse((await get(posts.free!)).json());
    expect(body.media.map((m) => m.id)).not.toContain(row.id);
    await prisma.mediaAsset.delete({ where: { id: row.id } });
  });

  it('logs the authorization event without URLs or tokens', async () => {
    const log = vi.spyOn(Logger.prototype, 'log');
    const res = await get(posts.free!, token('stranger'));
    const urls = mediaAccessResponseSchema.parse(res.json()).media.map((m) => m.url);
    const lines = log.mock.calls
      .map((call) => String(call[0]))
      .filter((l) => l.startsWith('media_access'));
    expect(lines).toEqual([
      `media_access post=${posts.free} user=${USERS.stranger} decision=full count=2`,
    ]);
    for (const url of urls) expect(lines[0]).not.toContain(url);
    expect(lines[0]).not.toContain(token('stranger'));

    log.mockClear();
    await get(posts.premium!);
    expect(log.mock.calls.map((call) => String(call[0]))).toContain(
      `media_access post=${posts.premium} user=anon decision=locked count=0`,
    );
  });

  it(`rate-limits a user after ${MEDIA_ACCESS_RATE_LIMIT.max} requests per window`, async () => {
    // Own app instance: the limiter's memory store is per app.
    const limited = await boot();
    try {
      for (let i = 0; i < MEDIA_ACCESS_RATE_LIMIT.max; i++) {
        expect((await get(posts.limited!, token('limited'), limited.app)).statusCode).toBe(200);
      }
      const res = await get(posts.limited!, token('limited'), limited.app);
      expect(res.statusCode).toBe(429);
      const { error } = res.json<{ error: { code: string; requestId: string } }>();
      expect(error.code).toBe('RATE_LIMITED');
      expect(error.requestId).toBe(res.headers['x-request-id']);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect(res.body).not.toContain('memory://');
      // Another user (and anonymous callers) keep their own budget.
      expect((await get(posts.limited!, token('stranger'), limited.app)).statusCode).toBe(200);
      expect((await get(posts.limited!, undefined, limited.app)).statusCode).toBe(200);
    } finally {
      await limited.app.close();
    }
  });
});
