import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { errorResponseSchema, studioPostListSchema, studioPostSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';

const WEB_ORIGIN = 'http://localhost:3000';
const URL = '/api/v1/creators/me/posts';
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';
const WEEK = 7 * 86_400;

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-0000001f0001',
  creatorB: '0190a000-0000-7000-8000-0000001f0002',
  plain: '0190a000-0000-7000-8000-0000001f0003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-offers-spec-${name}`;

describe('post offers', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Offers ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    await prisma.creatorProfile.createMany({
      data: [
        {
          userId: USERS.creatorA,
          slug: 'offers-spec-a',
          status: 'APPROVED',
          ...profileFields('A'),
        },
        {
          userId: USERS.creatorB,
          slug: 'offers-spec-b',
          status: 'APPROVED',
          ...profileFields('B'),
        },
      ],
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
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
    const owned = { post: { creatorProfile: { userId: { in: userIds } } } };
    await prisma.postOffer.deleteMany({ where: owned });
    await prisma.post.deleteMany({ where: owned.post });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const put = (name: UserName | undefined, id: string, payload: object, origin = WEB_ORIGIN) =>
    app.inject({
      method: 'PUT',
      url: `${URL}/${id}/offer`,
      headers: { origin },
      cookies: cookies(name),
      payload,
    });
  const get = (name: UserName, id: string) =>
    app.inject({ method: 'GET', url: `${URL}/${id}`, cookies: cookies(name) });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const createPost = async (name: UserName, visibility: 'FREE' | 'PREMIUM') => {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
      payload: { visibility },
    });
    expect(res.statusCode).toBe(201);
    return studioPostSchema.parse(res.json());
  };
  const offerRows = (postId: string) =>
    prisma.postOffer.findMany({ where: { postId }, orderBy: { version: 'asc' } });

  it('sets the first offer and returns it from get and list', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    expect(post.offer).toBeNull();

    const res = await put('creatorA', post.id, { priceCoins: 5, durationDays: 7 });
    expect(res.statusCode).toBe(200);
    const body = studioPostSchema.parse(res.json());
    expect(body.offer).toMatchObject({ version: 1, priceCoins: 5, durationSeconds: WEEK });

    expect(studioPostSchema.parse((await get('creatorA', post.id)).json()).offer).toEqual(
      body.offer,
    );
    const list = await app.inject({ method: 'GET', url: URL, cookies: cookies('creatorA') });
    const listed = studioPostListSchema.parse(list.json()).posts.find((p) => p.id === post.id);
    expect(listed?.offer).toEqual(body.offer);
  });

  it('keeps the current version for identical terms', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    await put('creatorA', post.id, { priceCoins: 5, durationDays: 7 });
    const again = await put('creatorA', post.id, { priceCoins: 5, durationDays: 7 });
    expect(again.statusCode).toBe(200);
    expect(studioPostSchema.parse(again.json()).offer?.version).toBe(1);
    expect(await offerRows(post.id)).toHaveLength(1);
  });

  it('appends a new version on change and leaves earlier terms untouched', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    await put('creatorA', post.id, { priceCoins: 5, durationDays: 7 });
    const [v1] = await offerRows(post.id);

    const price = await put('creatorA', post.id, { priceCoins: 8, durationDays: 7 });
    expect(studioPostSchema.parse(price.json()).offer).toMatchObject({ version: 2, priceCoins: 8 });
    const duration = await put('creatorA', post.id, { priceCoins: 8, durationDays: 30 });
    expect(studioPostSchema.parse(duration.json()).offer).toMatchObject({
      version: 3,
      priceCoins: 8,
      durationSeconds: 30 * 86_400,
    });

    const rows = await offerRows(post.id);
    expect(rows.map((r) => [r.version, r.priceCoins, r.durationSeconds])).toEqual([
      [1, 5n, WEEK],
      [2, 8n, WEEK],
      [3, 8n, 30 * 86_400],
    ]);
    expect(rows[0]).toEqual(v1);
  });

  it('allows a new version on a published post', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    await put('creatorA', post.id, { priceCoins: 5, durationDays: 7 });
    await prisma.post.update({
      where: { id: post.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
    });
    const res = await put('creatorA', post.id, { priceCoins: 10, durationDays: 7 });
    expect(studioPostSchema.parse(res.json()).offer).toMatchObject({ version: 2, priceCoins: 10 });
  });

  it('gives concurrent changes distinct versions', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    const results = await Promise.all(
      [3, 4, 6].map((priceCoins) => put('creatorA', post.id, { priceCoins, durationDays: 7 })),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    const rows = await offerRows(post.id);
    expect(rows.map((r) => r.version)).toEqual([1, 2, 3]);
    expect(rows.map((r) => Number(r.priceCoins)).sort()).toEqual([3, 4, 6]);
  });

  it('rejects offers on FREE posts', async () => {
    const post = await createPost('creatorA', 'FREE');
    const res = await put('creatorA', post.id, { priceCoins: 5, durationDays: 7 });
    expect(res.statusCode).toBe(409);
    expect(errorOf(res).code).toBe('OFFER_REQUIRES_PREMIUM');
    expect(await offerRows(post.id)).toHaveLength(0);
  });

  it.each([
    [{ priceCoins: 0, durationDays: 7 }, 'priceCoins'],
    [{ priceCoins: 10_001, durationDays: 7 }, 'priceCoins'],
    [{ priceCoins: 1.5, durationDays: 7 }, 'priceCoins'],
    [{ priceCoins: 5, durationDays: 0 }, 'durationDays'],
    [{ priceCoins: 5, durationDays: 366 }, 'durationDays'],
    [{ priceCoins: 5 }, 'durationDays'],
  ])('rejects invalid input %j', async (payload, path) => {
    const post = await createPost('creatorA', 'PREMIUM');
    const res = await put('creatorA', post.id, payload);
    expect(res.statusCode).toBe(400);
    expect(errorOf(res).code).toBe('VALIDATION_FAILED');
    expect(errorOf(res).details).toMatchObject({ issues: [{ path }] });
    expect(await offerRows(post.id)).toHaveLength(0);
  });

  it('isolates creators and requires an approved creator session', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    const valid = { priceCoins: 5, durationDays: 7 };

    const foreign = await put('creatorB', post.id, valid);
    const unknown = await put('creatorB', UNKNOWN_ID, valid);
    expect([foreign.statusCode, unknown.statusCode]).toEqual([404, 404]);
    expect(errorOf(foreign).code).toBe('NOT_FOUND');
    expect((await put('creatorA', 'not-a-uuid', valid)).statusCode).toBe(400);
    expect((await put('plain', post.id, valid)).statusCode).toBe(403);
    expect((await put(undefined, post.id, valid)).statusCode).toBe(401);
    expect((await put('creatorA', post.id, valid, 'https://evil.example')).statusCode).toBe(403);
    expect(await offerRows(post.id)).toHaveLength(0);
  });

  it('enforces positive price, duration and version in the database', async () => {
    const post = await createPost('creatorA', 'PREMIUM');
    const insert = (version: number, price: number, duration: number) =>
      prisma.$executeRaw`
        INSERT INTO post_offers (post_id, version, price_coins, duration_seconds)
        VALUES (${post.id}::uuid, ${version}, ${price}, ${duration})`;
    await expect(insert(1, 0, WEEK)).rejects.toThrow(/post_offers_price_coins_positive/);
    await expect(insert(1, 5, 0)).rejects.toThrow(/post_offers_duration_positive/);
    await expect(insert(0, 5, WEEK)).rejects.toThrow(/post_offers_version_positive/);
    await insert(1, 5, WEEK);
    await expect(insert(1, 6, WEEK)).rejects.toThrow();
  });
});
