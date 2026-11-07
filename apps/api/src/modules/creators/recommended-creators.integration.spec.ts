import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  RECOMMENDED_CREATORS_LIMIT,
  recommendedCreatorListSchema,
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

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const id = (n: number) => `0190a000-0000-7000-8000-${String(310000 + n).padStart(12, '0')}`;
const VIEWER = id(1);
const FAN_B = id(2);
const FAN_C = id(3);
const TOKEN = 'recommended-spec-viewer';
const PFX = 'recspec-';

describe('GET /creators/recommended', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  const userIds: string[] = [VIEWER, FAN_B, FAN_C];

  /** Creator users get ids 100+; createdAt is set so ties are deterministic. */
  async function creator(
    n: number,
    slug: string,
    opts: { status?: 'APPROVED' | 'PENDING_REVIEW'; suspended?: boolean; createdAt?: Date } = {},
  ) {
    const userId = id(100 + n);
    userIds.push(userId);
    await prisma.user.create({
      data: { id: userId, displayName: slug, status: opts.suspended ? 'SUSPENDED' : 'ACTIVE' },
    });
    return prisma.creatorProfile.create({
      data: {
        userId,
        slug: PFX + slug,
        status: opts.status ?? 'APPROVED',
        createdAt: opts.createdAt ?? new Date(2026, 0, n),
        ...profileFields(slug),
      },
    });
  }
  const follow = (userId: string, creatorProfileId: string) =>
    prisma.creatorFollow.create({ data: { userId, creatorProfileId } });
  const get = (cookie = true) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/creators/recommended',
      ...(cookie && { cookies: { [SESSION_COOKIE]: TOKEN } }),
    });
  const slugs = async () =>
    recommendedCreatorListSchema
      .parse((await get()).json())
      .creators.filter((c) => c.slug.startsWith(PFX)) // other specs/seeds may leave rows
      .map((c) => c.slug.replace(PFX, ''));

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
      data: [VIEWER, FAN_B, FAN_C].map((i) => ({ id: i, displayName: 'Rec fan' })),
    });
    await prisma.session.create({
      data: {
        userId: VIEWER,
        tokenHash: sha256hex(TOKEN),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.creatorFollow.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('rejects guests with 401', async () => {
    expect((await get(false)).statusCode).toBe(401);
  });

  it('excludes self, followed, unapproved and suspended creators; ranks by followers then newest', async () => {
    const own = await prisma.creatorProfile.create({
      data: { userId: VIEWER, slug: `${PFX}own`, status: 'APPROVED', ...profileFields('own') },
    });
    expect(own.id).toBeTruthy();
    const followed = await creator(1, 'followed');
    await follow(VIEWER, followed.id);
    await creator(2, 'pending', { status: 'PENDING_REVIEW' });
    const suspended = await creator(3, 'suspended', { suspended: true });
    await follow(FAN_B, suspended.id);
    const popular = await creator(4, 'popular');
    await follow(FAN_B, popular.id);
    await follow(FAN_C, popular.id);
    const one = await creator(5, 'one-old');
    await follow(FAN_B, one.id);
    await creator(6, 'zero-old');
    await creator(7, 'zero-new');

    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await slugs()).toEqual(['popular', 'one-old', 'zero-new', 'zero-old']);
    const first = recommendedCreatorListSchema
      .parse(res.json())
      .creators.find((c) => c.slug === `${PFX}popular`)!;
    expect(first.followerCount).toBe(2);
    expect(Object.keys(first).sort()).toEqual([
      'avatarUrl',
      'bannerUrl',
      'displayName',
      'followerCount',
      'slug',
    ]);
  });

  it('returns at most 15', async () => {
    for (let n = 20; n < 38; n++) await creator(n, `bulk${n}`);
    const { creators } = recommendedCreatorListSchema.parse((await get()).json());
    expect(creators).toHaveLength(RECOMMENDED_CREATORS_LIMIT);
  });

  it('keeps GET /creators/:slug working', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/creators/${PFX}popular` });
    expect(res.statusCode).toBe(200);
  });
});
