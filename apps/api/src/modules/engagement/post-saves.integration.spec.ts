import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  homeFeedPageSchema,
  postSaveResponseSchema,
  publicPostDetailSchema,
  publicPostListSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { POST_SAVE_RATE_LIMIT } from './post-saves.controller.js';

const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000440001',
  fanA: '0190a000-0000-7000-8000-000000440002',
  fanB: '0190a000-0000-7000-8000-000000440003',
  spammer: '0190a000-0000-7000-8000-000000440004',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-saves-spec-${name}`;

describe('PUT / DELETE /posts/:id/save', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Saves ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    const creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: 'post-saves-spec',
          status: 'APPROVED',
          ...profileFields('Saves'),
        },
      })
    ).id;
    const post = async (
      key: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED',
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
    await post('concurrent', 'FREE', 'PUBLISHED');
    await post('premium', 'PREMIUM', 'PUBLISHED');
    await post('draft', 'FREE', 'DRAFT');
    await post('archived', 'FREE', 'ARCHIVED');
    await post('removed', 'FREE', 'REMOVED');
    await prisma.postOffer.create({
      data: { postId: posts.premium!, version: 1, priceCoins: 10n },
    });
    // A save left over from before the archive: unsave must still remove it.
    await prisma.postSave.create({ data: { postId: posts.archived!, userId: USERS.fanA } });

    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
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
    await prisma.postSave.deleteMany({ where: { post: where } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const send = (method: 'PUT' | 'DELETE', postId: string, user?: UserName, origin = WEB_ORIGIN) =>
    app.inject({
      method,
      url: `/api/v1/posts/${postId}/save`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      headers: { origin },
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const rows = (postId: string) => prisma.postSave.count({ where: { postId } });

  it('saves and unsaves idempotently, one row per user, uncached', async () => {
    const first = await send('PUT', posts.free!, 'fanA');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(postSaveResponseSchema.parse(first.json())).toEqual({ saved: true });
    expect((await send('PUT', posts.free!, 'fanA')).json()).toEqual({ saved: true });
    expect((await send('PUT', posts.free!, 'fanB')).json()).toEqual({ saved: true });
    expect(await rows(posts.free!)).toBe(2);

    expect((await send('DELETE', posts.free!, 'fanA')).json()).toEqual({ saved: false });
    expect((await send('DELETE', posts.free!, 'fanA')).json()).toEqual({ saved: false });
    expect(await rows(posts.free!)).toBe(1);
  });

  it('keeps one row under simultaneous requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => send('PUT', posts.concurrent!, 'fanA')),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(await rows(posts.concurrent!)).toBe(1);
  });

  it('requires a session and a same-origin request', async () => {
    const anonymous = await send('PUT', posts.free!);
    expect(anonymous.statusCode).toBe(401);
    expect(errorCode(anonymous)).toBe('AUTH_REQUIRED');
    expect((await send('PUT', posts.free!, 'fanB', 'https://evil.example')).statusCode).toBe(403);
    expect((await send('DELETE', posts.free!, 'fanB', 'https://evil.example')).statusCode).toBe(
      403,
    );
  });

  it('rejects malformed and unknown ids', async () => {
    expect((await send('PUT', 'not-a-uuid', 'fanA')).statusCode).toBe(400);
    const unknown = await send('PUT', '0190a000-0000-7000-8000-000000449999', 'fanA');
    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('NOT_FOUND');
  });

  it.each(['draft', 'archived', 'removed'])(
    'a %s post cannot be saved by others (404)',
    async (key) => {
      const res = await send('PUT', posts[key]!, 'fanB');
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
      expect(
        await prisma.postSave.count({ where: { postId: posts[key]!, userId: USERS.fanB } }),
      ).toBe(0);
    },
  );

  it.each(['draft', 'archived'])('the owner cannot save their own %s post', async (key) => {
    const res = await send('PUT', posts[key]!, 'creator');
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('POST_NOT_AVAILABLE');
  });

  it('lets the owner save their own published post', async () => {
    expect((await send('PUT', posts.free!, 'creator')).json()).toEqual({ saved: true });
  });

  it('unsave still works after the post was archived', async () => {
    expect((await send('DELETE', posts.archived!, 'fanA')).statusCode).toBe(200);
    expect(await rows(posts.archived!)).toBe(0);
  });

  it('saves a locked premium post without unlocking it', async () => {
    expect((await send('PUT', posts.premium!, 'fanB')).json()).toEqual({ saved: true });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/v1/creators/post-saves-spec/posts/${posts.premium!}`,
      cookies: { [SESSION_COOKIE]: token('fanB') },
    });
    expect(detail.json()).toMatchObject({ access: 'locked' });
    const media = await app.inject({
      method: 'GET',
      url: `/api/v1/posts/${posts.premium!}/media-access`,
      cookies: { [SESSION_COOKIE]: token('fanB') },
    });
    expect(media.statusCode).toBe(403);
    expect(await prisma.postPurchase.count({ where: { userId: USERS.fanB } })).toBe(0);
    // Un-saving does not touch access either.
    expect((await send('DELETE', posts.premium!, 'fanB')).json()).toEqual({ saved: false });
  });

  describe('viewer.saved in public responses', () => {
    const get = (url: string, user?: UserName) =>
      app.inject({ method: 'GET', url, cookies: user ? { [SESSION_COOKIE]: token(user) } : {} });
    const base = '/api/v1/creators/post-saves-spec';

    it('is true for the saver only, in the list and the detail, and null for anonymous viewers', async () => {
      await send('PUT', posts.concurrent!, 'fanA');
      const list = (user?: UserName) =>
        get(`${base}/posts`, user).then((r) =>
          publicPostListSchema.parse(r.json()).posts.find((p) => p.id === posts.concurrent),
        );
      expect((await list('fanA'))?.viewer?.saved).toBe(true);
      expect((await list('fanB'))?.viewer?.saved).toBe(false);
      expect((await list('creator'))?.viewer?.saved).toBe(false);
      expect((await list())?.viewer).toBeNull();

      const detail = (user?: UserName) =>
        get(`${base}/posts/${posts.concurrent!}`, user).then((r) =>
          publicPostDetailSchema.parse(r.json()),
        );
      expect((await detail('fanA')).viewer?.saved).toBe(true);
      expect((await detail('fanB')).viewer?.saved).toBe(false);
      expect((await detail()).viewer).toBeNull();
    });

    it('is true in the Home feed for the saver', async () => {
      const feed = await get('/api/v1/feed', 'fanA').then((r) =>
        homeFeedPageSchema.parse(r.json()),
      );
      const item = feed.items.find((p) => p.id === posts.concurrent);
      if (item) expect(item.viewer?.saved).toBe(true);
    });

    it('never exposes a save count or another user save', async () => {
      const res = await get(`${base}/posts/${posts.concurrent!}`, 'fanB');
      const body = res.json<Record<string, unknown>>();
      expect(Object.keys(body).filter((k) => /save/i.test(k))).toEqual([]);
      expect(body.viewer).toMatchObject({ saved: false });
      expect(
        await prisma.postSave.count({ where: { userId: USERS.fanB, postId: posts.concurrent! } }),
      ).toBe(0);
    });
  });

  it(`rate-limits a user after ${POST_SAVE_RATE_LIMIT.max} requests per window`, async () => {
    for (let i = 0; i < POST_SAVE_RATE_LIMIT.max; i++) {
      expect((await send('PUT', posts.free!, 'spammer')).statusCode).toBe(200);
    }
    const res = await send('PUT', posts.free!, 'spammer');
    expect(res.statusCode).toBe(429);
    expect(errorCode(res)).toBe('RATE_LIMITED');
  });
});
