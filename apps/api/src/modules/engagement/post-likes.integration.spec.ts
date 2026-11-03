import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  postLikeResponseSchema,
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
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000280001',
  fanA: '0190a000-0000-7000-8000-000000280002',
  fanB: '0190a000-0000-7000-8000-000000280003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-likes-spec-${name}`;
const SLUG = 'post-likes-spec';

async function boot(premiumLikesWithoutAccess: boolean) {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue({
      ...parseEnv(process.env),
      PREMIUM_LIKES_WITHOUT_ACCESS: premiumLikesWithoutAccess,
    })
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('PUT / DELETE /posts/:id/like', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;
  let openApp: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Likes ${name}` })),
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
        data: { userId: USERS.creator, slug: SLUG, status: 'APPROVED', ...profileFields('Likes') },
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
    // A like left over from before the archive: it must stay, and unlike must be refused.
    await prisma.postLike.create({ data: { postId: posts.archived!, userId: USERS.fanA } });

    [app, openApp] = await Promise.all([boot(false), boot(true)]);
  });

  afterAll(async () => {
    await Promise.all([app.close(), openApp.close()]);
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.postLike.deleteMany({ where: { post: where } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const send = (
    method: 'PUT' | 'DELETE',
    postId: string,
    user?: UserName,
    { origin = WEB_ORIGIN, target = app } = {},
  ) =>
    target.inject({
      method,
      url: `/api/v1/posts/${postId}/like`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      headers: { origin },
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const rows = (postId: string) => prisma.postLike.count({ where: { postId } });

  it('likes and unlikes idempotently, one row per user', async () => {
    const first = await send('PUT', posts.free!, 'fanA');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(postLikeResponseSchema.parse(first.json())).toEqual({ liked: true, likeCount: 1 });
    expect((await send('PUT', posts.free!, 'fanA')).json()).toEqual({ liked: true, likeCount: 1 });
    expect((await send('PUT', posts.free!, 'fanB')).json()).toEqual({ liked: true, likeCount: 2 });

    expect((await send('DELETE', posts.free!, 'fanA')).json()).toEqual({
      liked: false,
      likeCount: 1,
    });
    expect((await send('DELETE', posts.free!, 'fanA')).json()).toEqual({
      liked: false,
      likeCount: 1,
    });
    expect(await rows(posts.free!)).toBe(1);
  });

  it('keeps one like under simultaneous requests', async () => {
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
    const csrf = await send('PUT', posts.free!, 'fanB', { origin: 'https://evil.example' });
    expect(csrf.statusCode).toBe(403);
  });

  it('rejects malformed and unknown ids', async () => {
    expect((await send('PUT', 'not-a-uuid', 'fanA')).statusCode).toBe(400);
    const unknown = await send('PUT', '0190a000-0000-7000-8000-000000289999', 'fanA');
    expect(unknown.statusCode).toBe(404);
    expect(errorCode(unknown)).toBe('NOT_FOUND');
  });

  it.each(['draft', 'archived', 'removed'])(
    'a %s post is hidden from other users (404)',
    async (key) => {
      const res = await send('PUT', posts[key]!, 'fanB');
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
    },
  );

  it.each(['draft', 'archived'])('the owner cannot like their own %s post', async (key) => {
    const res = await send('PUT', posts[key]!, 'creator');
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('POST_NOT_AVAILABLE');
  });

  it('an archived post keeps its likes and refuses unlike', async () => {
    const res = await send('DELETE', posts.archived!, 'creator');
    expect(errorCode(res)).toBe('POST_NOT_AVAILABLE');
    expect(await rows(posts.archived!)).toBe(1);
  });

  it('premium without access: forbidden by default, allowed by the policy flag', async () => {
    const locked = await send('PUT', posts.premium!, 'fanA');
    expect(locked.statusCode).toBe(403);
    expect(errorCode(locked)).toBe('FORBIDDEN');
    expect(await rows(posts.premium!)).toBe(0);

    const open = await send('PUT', posts.premium!, 'fanA', { target: openApp });
    expect(open.json()).toEqual({ liked: true, likeCount: 1 });
    expect((await send('PUT', posts.premium!, 'creator')).json()).toEqual({
      liked: true,
      likeCount: 2,
    });
  });

  describe('public responses', () => {
    const detail = async (postId: string, user?: UserName, target = app) => {
      const res = await target.inject({
        method: 'GET',
        url: `/api/v1/creators/${SLUG}/posts/${postId}`,
        cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      });
      expect(res.statusCode).toBe(200);
      return publicPostDetailSchema.parse(res.json());
    };

    it('feed shows like counts', async () => {
      const res = await app.inject({ method: 'GET', url: `/api/v1/creators/${SLUG}/posts` });
      const feed = publicPostListSchema.parse(res.json()).posts;
      expect(feed.find((p) => p.id === posts.concurrent)?.likeCount).toBe(1);
    });

    it('anonymous detail: count, no viewer', async () => {
      const post = await detail(posts.concurrent!);
      expect(post.likeCount).toBe(1);
      expect(post.viewer).toBeNull();
    });

    it('logged-in detail: liked and canLike', async () => {
      expect((await detail(posts.concurrent!, 'fanA')).viewer).toEqual({
        liked: true,
        canLike: true,
        canReport: true,
      });
      expect((await detail(posts.concurrent!, 'fanB')).viewer).toEqual({
        liked: false,
        canLike: true,
        canReport: true,
      });
    });

    it('canLike follows the like rule', async () => {
      expect((await detail(posts.premium!, 'fanB')).viewer?.canLike).toBe(false);
      expect((await detail(posts.premium!, 'fanB', openApp)).viewer?.canLike).toBe(true);
      expect((await detail(posts.draft!, 'creator')).viewer?.canLike).toBe(false);
    });

    it('canReport: published posts of others only (US-042)', async () => {
      expect((await detail(posts.premium!, 'fanB')).viewer?.canReport).toBe(true);
      expect((await detail(posts.free!, 'creator')).viewer?.canReport).toBe(false);
      expect((await detail(posts.draft!, 'creator')).viewer?.canReport).toBe(false);
    });
  });
});
