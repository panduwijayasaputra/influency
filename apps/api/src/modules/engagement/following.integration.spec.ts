import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  FOLLOWING_PAGE_SIZE,
  type FollowingPage,
  followingPageSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const RUN = randomUUID().slice(0, 8);
const MINUTE = 60_000;
const T0 = Date.now() - 600 * MINUTE;

describe('GET /me/following', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;

  const userIds: string[] = [];
  const profileIds: string[] = [];
  const fans: Record<string, { id: string; token: string }> = {};
  const creators: Record<string, { id: string; slug: string }> = {};

  async function newFan(name: string) {
    const user = await prisma.user.create({ data: { displayName: `Fol ${name}` } });
    userIds.push(user.id);
    const token = `following-spec-${RUN}-${name}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    fans[name] = { id: user.id, token };
  }
  async function newCreator(
    key: string,
    displayName: string,
    over: {
      status?: 'APPROVED' | 'PENDING_REVIEW';
      userStatus?: 'ACTIVE' | 'SUSPENDED';
      bio?: string;
    } = {},
  ) {
    const user = await prisma.user.create({
      data: { displayName, status: over.userStatus ?? 'ACTIVE' },
    });
    userIds.push(user.id);
    const slug = `fol-${key}-${RUN}`;
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug,
        status: over.status ?? 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields(displayName),
        bio: over.bio ?? null,
      },
    });
    profileIds.push(profile.id);
    creators[key] = { id: profile.id, slug };
  }
  const follow = (fan: string, creator: string, minutes: number) =>
    prisma.creatorFollow.create({
      data: {
        userId: fans[fan]!.id,
        creatorProfileId: creators[creator]!.id,
        createdAt: new Date(T0 + minutes * MINUTE),
      },
    });

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

    for (const name of ['me', 'other', 'pager']) await newFan(name);
    // Mixed case on purpose: "alma" must sort before "Budi", "citra" before "Dewi".
    await newCreator('d', 'Dewi', { bio: 'Bio Dewi' });
    await newCreator('b', 'Budi');
    await newCreator('a', 'alma');
    await newCreator('c', 'citra');
    await newCreator('pending', 'Pending', { status: 'PENDING_REVIEW' });
    await newCreator('suspended', 'Suspended', { userStatus: 'SUSPENDED' });
    await newCreator('hidden', 'Hidden by other');

    await follow('me', 'd', 1); // oldest follow
    await follow('me', 'b', 2);
    await follow('me', 'a', 3);
    await follow('me', 'c', 4); //  newest follow
    await follow('me', 'pending', 5);
    await follow('me', 'suspended', 6);
    await follow('other', 'hidden', 7);

    // pager follows FOLLOWING_PAGE_SIZE + 3 creators, "p00".."p22", followed in reverse name order
    const n = FOLLOWING_PAGE_SIZE + 3;
    for (let i = 0; i < n; i++)
      await newCreator(`p${String(i).padStart(2, '0')}`, `P${String(i).padStart(2, '0')}`);
    for (let i = 0; i < n; i++)
      await follow('pager', `p${String(i).padStart(2, '0')}`, 100 + (n - i));
  });

  afterAll(async () => {
    await app.close();
    await prisma.creatorFollow.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.creatorProfile.deleteMany({ where: { id: { in: profileIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (fan: string | null, query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/v1/me/following${query}`,
      cookies: fan ? { [SESSION_COOKIE]: fans[fan]!.token } : {},
    });
  const page = async (fan: string, query = ''): Promise<FollowingPage> => {
    const res = await get(fan, query);
    expect(res.statusCode).toBe(200);
    return followingPageSchema.parse(res.json());
  };
  const names = (p: FollowingPage) => p.creators.map((c) => c.displayName);

  it('requires a session and is never cached', async () => {
    expect((await get(null)).statusCode).toBe(401);
    expect((await get('me')).headers['cache-control']).toBe('no-store');
  });

  it('lists the creators the caller follows, latest follow first, with the public fields only', async () => {
    const p = await page('me');
    expect(names(p)).toEqual(['citra', 'alma', 'Budi', 'Dewi']);
    expect(p.total).toBe(4);
    expect(p.nextCursor).toBeNull();
    const dewi = p.creators.find((c) => c.displayName === 'Dewi')!;
    expect(dewi).toEqual({
      slug: creators.d!.slug,
      displayName: 'Dewi',
      avatarUrl: null,
      bannerUrl: null,
      bio: 'Bio Dewi',
    });
    expect(Object.keys(dewi).sort()).toEqual([
      'avatarUrl',
      'bannerUrl',
      'bio',
      'displayName',
      'slug',
    ]);
  });

  it('sorts by name case-insensitively', async () => {
    expect(names(await page('me', '?sort=name'))).toEqual(['alma', 'Budi', 'citra', 'Dewi']);
  });

  it("never shows another user's follows", async () => {
    expect(names(await page('other'))).toEqual(['Hidden by other']);
    expect(names(await page('me'))).not.toContain('Hidden by other');
  });

  it('leaves out and does not count unapproved creators and suspended owners', async () => {
    const p = await page('me');
    expect(names(p)).not.toContain('Pending');
    expect(names(p)).not.toContain('Suspended');
    expect(p.total).toBe(4);
  });

  it('reflects a follow and an unfollow on the next request', async () => {
    const extra = await follow('me', 'hidden', 50);
    expect(names(await page('me'))[0]).toBe('Hidden by other');
    await prisma.creatorFollow.delete({ where: { id: extra.id } });
    expect(names(await page('me'))).not.toContain('Hidden by other');
  });

  it.each(['?sort=random', '?cursor=garbage', '?cursor=r_1_not-a-uuid'])(
    'rejects invalid query %s with 400',
    async (query) => {
      const res = await get('me', query);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
    },
  );

  describe('paging', () => {
    const total = FOLLOWING_PAGE_SIZE + 3;

    it('pages "recent" without repeats or gaps, even when a follow is added in between', async () => {
      const first = await page('pager');
      expect(first.creators).toHaveLength(FOLLOWING_PAGE_SIZE);
      expect(first.total).toBe(total);
      expect(first.nextCursor).not.toBeNull();
      await follow('pager', 'hidden', 900); // newer than page 1
      const second = await page('pager', `?cursor=${first.nextCursor}`);
      expect(second.creators).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      const all = [...names(first), ...names(second)];
      expect(new Set(all).size).toBe(total);
      expect(all).not.toContain('Hidden by other');
      // followed in reverse name order, so the newest follow is p00 and the oldest p22
      expect(all[0]).toBe('P00');
      expect(all.at(-1)).toBe('P22');
      await prisma.creatorFollow.deleteMany({
        where: { userId: fans.pager!.id, creatorProfileId: creators.hidden!.id },
      });
    });

    it('pages "name" in order without repeats or gaps', async () => {
      const first = await page('pager', '?sort=name');
      expect(first.creators).toHaveLength(FOLLOWING_PAGE_SIZE);
      expect(first.nextCursor).not.toBeNull();
      const second = await page('pager', `?sort=name&cursor=${first.nextCursor}`);
      const all = [...names(first), ...names(second)];
      expect(all).toHaveLength(total);
      expect(all).toEqual([...all].sort());
      expect(second.nextCursor).toBeNull();
    });

    it('ignores a cursor that belongs to the other sort (starts from the first page)', async () => {
      const recent = await page('pager');
      const crossed = await page('pager', `?sort=name&cursor=${recent.nextCursor}`);
      expect(names(crossed)[0]).toBe('P00');
    });
  });
});
