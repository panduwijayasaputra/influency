import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { followStateSchema, publicPostListSchema, SESSION_COOKIE } from '@influency/shared';
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

const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000290001',
  fanA: '0190a000-0000-7000-8000-000000290002',
  fanB: '0190a000-0000-7000-8000-000000290003',
  pending: '0190a000-0000-7000-8000-000000290004',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `creator-follows-spec-${name}`;
const SLUG = 'follows-spec';

describe('GET / PUT / DELETE /creators/:slug/follow', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;
  let creatorProfileId: string;
  let premiumPostId: string;

  beforeAll(async () => {
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

    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Follows ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: SLUG,
          status: 'APPROVED',
          ...profileFields('Follows'),
        },
      })
    ).id;
    await prisma.creatorProfile.create({
      data: {
        userId: USERS.pending,
        slug: 'follows-spec-pending',
        status: 'PENDING_REVIEW',
        ...profileFields('Pending'),
      },
    });
    premiumPostId = (
      await prisma.post.create({
        data: {
          creatorProfileId,
          visibility: 'PREMIUM',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
    ).id;
    await prisma.postOffer.create({ data: { postId: premiumPostId, version: 1, priceCoins: 10n } });
  });

  afterAll(async () => {
    await app.close();
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.creatorFollow.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const send = (
    method: 'GET' | 'PUT' | 'DELETE',
    user?: UserName,
    { slug = SLUG, origin = WEB_ORIGIN } = {},
  ) =>
    app.inject({
      method,
      url: `/api/v1/creators/${slug}/follow`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      headers: { origin },
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const rows = () => prisma.creatorFollow.count({ where: { creatorProfileId } });

  it('lets a guest read the count but not follow', async () => {
    const get = await send('GET');
    expect(get.statusCode).toBe(200);
    expect(get.headers['cache-control']).toBe('no-store');
    expect(followStateSchema.parse(get.json())).toEqual({ following: false, followerCount: 0 });
    const put = await send('PUT');
    expect(put.statusCode).toBe(401);
    expect(errorCode(put)).toBe('AUTH_REQUIRED');
    expect((await send('DELETE')).statusCode).toBe(401);
  });

  it('follows idempotently and counts one row per user', async () => {
    const first = await send('PUT', 'fanA');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(first.json()).toEqual({ following: true, followerCount: 1 });
    expect((await send('PUT', 'fanA')).json()).toEqual({ following: true, followerCount: 1 });
    expect((await send('PUT', 'fanB')).json()).toEqual({ following: true, followerCount: 2 });
    expect(await rows()).toBe(2);
    // The viewer's own flag is per user; a guest still sees the count.
    expect((await send('GET', 'fanA')).json()).toEqual({ following: true, followerCount: 2 });
    expect((await send('GET')).json()).toEqual({ following: false, followerCount: 2 });
  });

  it('keeps one row under simultaneous requests', async () => {
    await prisma.creatorFollow.deleteMany({ where: { userId: USERS.fanA } });
    const results = await Promise.all(Array.from({ length: 5 }, () => send('PUT', 'fanA')));
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(await prisma.creatorFollow.count({ where: { userId: USERS.fanA } })).toBe(1);
  });

  it('unfollows idempotently, also when never following', async () => {
    await send('PUT', 'fanA');
    expect((await send('DELETE', 'fanA')).json()).toEqual({ following: false, followerCount: 1 });
    const again = await send('DELETE', 'fanA');
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual({ following: false, followerCount: 1 });
    expect((await send('DELETE', 'fanB')).json()).toEqual({ following: false, followerCount: 0 });
    expect(await rows()).toBe(0);
  });

  it('rejects following your own profile', async () => {
    const res = await send('PUT', 'creator');
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('CANNOT_FOLLOW_SELF');
    expect(await rows()).toBe(0);
  });

  it('treats unknown and unapproved creators as not found', async () => {
    for (const slug of ['no-such-creator', 'follows-spec-pending']) {
      for (const method of ['GET', 'PUT', 'DELETE'] as const) {
        const res = await send(method, 'fanA', { slug });
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe('NOT_FOUND');
      }
    }
  });

  it('accepts a mixed-case slug', async () => {
    const res = await send('PUT', 'fanA', { slug: 'Follows-Spec' });
    expect(res.json()).toEqual({ following: true, followerCount: 1 });
    await send('DELETE', 'fanA');
  });

  it('does not count followers whose account is suspended', async () => {
    await send('PUT', 'fanA');
    await send('PUT', 'fanB');
    await prisma.user.update({ where: { id: USERS.fanB }, data: { status: 'SUSPENDED' } });
    try {
      expect((await send('GET')).json()).toEqual({ following: false, followerCount: 1 });
    } finally {
      await prisma.user.update({ where: { id: USERS.fanB }, data: { status: 'ACTIVE' } });
      await prisma.creatorFollow.deleteMany({ where: { creatorProfileId } });
    }
  });

  it('requires a same-origin request when the cookie is sent', async () => {
    const res = await send('PUT', 'fanA', { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    expect(await rows()).toBe(0);
  });

  it('does not unlock premium posts', async () => {
    await send('PUT', 'fanA');
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/creators/${SLUG}/posts`,
      cookies: { [SESSION_COOKIE]: token('fanA') },
    });
    expect(res.statusCode).toBe(200);
    const post = publicPostListSchema.parse(res.json()).posts.find((p) => p.id === premiumPostId);
    expect(post?.access).toBe('locked');
    await send('DELETE', 'fanA');
  });
});
