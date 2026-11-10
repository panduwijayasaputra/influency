import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type DiscoverVideo, discoverVideosPageSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  fan: '0190a000-0000-7000-8000-000000690001',
  creatorA: '0190a000-0000-7000-8000-000000690002',
  creatorB: '0190a000-0000-7000-8000-000000690003',
  pending: '0190a000-0000-7000-8000-000000690004',
  suspended: '0190a000-0000-7000-8000-000000690005',
  quitter: '0190a000-0000-7000-8000-000000690006',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `discover-spec-${name}`;
const SLUG = {
  a: 'discover-spec-a',
  b: 'discover-spec-b',
  pending: 'discover-spec-pending',
  susp: 'discover-spec-susp',
};
// Far in the future so these lead the video list, but before the Home feed spec's 2099 posts (which it expects first;
// they have no free videos, so they never show up here).
const at = (second: number) => new Date(Date.UTC(2098, 0, 1, 0, 0, second));

async function boot() {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(parseEnv(process.env))
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

describe('GET /discover/videos', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const ids: Record<string, string> = {};
  const videoUids: string[] = [];
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Discover ${name}`,
        status:
          name === 'suspended' || name === 'quitter' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (['fan', 'creatorA'] as const).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    const profile = async (user: UserName, slug: string, status: 'APPROVED' | 'PENDING_REVIEW') =>
      (
        await prisma.creatorProfile.create({
          // Old createdAt: ranked last in GET /creators/recommended while it exists (parallel specs rank creators).
          data: {
            userId: USERS[user],
            slug,
            status,
            createdAt: LEFTOVER_CREATED_AT,
            ...profileFields(slug),
          },
        })
      ).id;
    const a = await profile('creatorA', SLUG.a, 'APPROVED');
    const b = await profile('creatorB', SLUG.b, 'APPROVED');
    const pending = await profile('pending', SLUG.pending, 'PENDING_REVIEW');
    const susp = await profile('suspended', SLUG.susp, 'APPROVED');

    const post = async (
      key: string,
      creatorProfileId: string,
      second: number,
      opts: {
        visibility?: 'FREE' | 'PREMIUM';
        status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED' | 'PENDING_REVIEW';
        media?: { kind: 'VIDEO' | 'IMAGE'; status: 'READY' | 'PROCESSING' | 'REJECTED' }[];
      } = {},
    ) => {
      const status = opts.status ?? 'PUBLISHED';
      const visibility = opts.visibility ?? 'FREE';
      const id = (
        await prisma.post.create({
          data: {
            creatorProfileId,
            visibility,
            status,
            caption: key,
            publishedAt: status === 'DRAFT' ? null : at(second),
          },
        })
      ).id;
      ids[key] = id;
      for (const m of opts.media ?? [{ kind: 'VIDEO', status: 'READY' }]) {
        const videoUid = randomUUID().replaceAll('-', '');
        if (m.kind === 'VIDEO') videoUids.push(videoUid);
        await prisma.mediaAsset.create({
          data: {
            postId: id,
            kind: m.kind,
            status: m.status,
            ...(m.kind === 'VIDEO'
              ? { videoUid, contentType: 'video/mp4' }
              : {
                  objectKey: `post-media/discover-spec-${randomUUID()}`,
                  contentType: 'image/jpeg',
                }),
            byteSize: 1000,
            uploadExpiresAt: at(0),
            ...(m.kind === 'VIDEO' && m.status === 'READY' ? { durationSeconds: 42 } : {}),
          },
        });
      }
      if (visibility === 'PREMIUM') {
        await prisma.postOffer.create({ data: { postId: id, version: 1, priceCoins: 10n } });
      }
    };
    // Shown: three free READY videos (A: 1, 3; B: 2), newest first → a3, b2, a1.
    await post('a1', a, 1);
    await post('b2', b, 2);
    await post('a3', a, 3);
    // Never shown.
    await post('premium', b, 10, { visibility: 'PREMIUM' });
    await post('imageOnly', b, 11, { media: [{ kind: 'IMAGE', status: 'READY' }] });
    await post('processing', b, 12, { media: [{ kind: 'VIDEO', status: 'PROCESSING' }] });
    await post('rejected', b, 13, { media: [{ kind: 'VIDEO', status: 'REJECTED' }] });
    await post('draft', b, 14, { status: 'DRAFT' });
    await post('archived', b, 15, { status: 'ARCHIVED' });
    await post('hidden', b, 16, { status: 'PENDING_REVIEW' });
    await post('removed', b, 17, { status: 'REMOVED' });
    await post('pendingCreator', pending, 18);
    await post('suspendedCreator', susp, 19);

    // Followers of B: the fan (ACTIVE) and a suspended user (not counted).
    await prisma.creatorFollow.createMany({
      data: [
        { userId: USERS.fan, creatorProfileId: b },
        { userId: USERS.quitter, creatorProfileId: b },
      ],
    });

    app = await boot();
  });

  afterAll(async () => {
    await app.close();
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.creatorFollow.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (user?: UserName, cursor?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/discover/videos${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
    });
  const mine = (items: DiscoverVideo[]) =>
    items.filter((i) => i.creator.slug.startsWith('discover-spec-'));
  /** All of this spec's items across pages. */
  const all = async (user?: UserName) => {
    const items: DiscoverVideo[] = [];
    let cursor: string | undefined;
    do {
      const res = await get(user, cursor);
      expect(res.statusCode).toBe(200);
      const page = discoverVideosPageSchema.parse(res.json());
      items.push(...mine(page.items));
      cursor = page.nextCursor ?? undefined;
    } while (cursor && items.length < 50);
    return items;
  };

  it('is public and never cached', async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('lists only published free READY videos of visible creators, newest first', async () => {
    const items = await all();
    expect(items.map((i) => i.id)).toEqual([ids.a3, ids.b2, ids.a1]);
    for (const item of items) {
      expect(item.visibility).toBe('FREE');
      expect(item.access).toBe('full');
      expect(item.media).toEqual([{ kind: 'VIDEO', durationSeconds: 42 }]);
    }
  });

  it("leaves out the signed-in viewer's own posts", async () => {
    const items = await all('creatorA');
    expect(items.map((i) => i.id)).toEqual([ids.b2]);
  });

  it('carries the follow state: guests never follow, only ACTIVE followers count', async () => {
    const guest = (await all()).find((i) => i.id === ids.b2)!;
    expect(guest.follow).toEqual({ following: false, followerCount: 1 });
    const fan = await all('fan');
    expect(fan.find((i) => i.id === ids.b2)!.follow).toEqual({ following: true, followerCount: 1 });
    expect(fan.find((i) => i.id === ids.a3)!.follow).toEqual({
      following: false,
      followerCount: 0,
    });
  });

  it('pages with a cursor without repeats', async () => {
    const res = await get('fan');
    const first = discoverVideosPageSchema.parse(res.json());
    if (first.nextCursor) {
      const second = discoverVideosPageSchema.parse((await get('fan', first.nextCursor)).json());
      const seen = new Set(first.items.map((i) => i.id));
      expect(second.items.some((i) => seen.has(i.id))).toBe(false);
    }
    // Our three posts are the newest in the DB, so they lead page 1 in order.
    expect(first.items.slice(0, 3).map((i) => i.id)).toEqual([ids.a3, ids.b2, ids.a1]);
  });

  it('rejects a malformed cursor', async () => {
    const res = await get('fan', 'not-a-cursor');
    expect(res.statusCode).toBe(400);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
  });

  it('never returns provider video ids or premium/hidden posts', async () => {
    const response = (await get()).json<{ items: DiscoverVideo[] }>();
    const body = JSON.stringify(response);
    for (const uid of videoUids) expect(body).not.toContain(uid);
    for (const key of ['premium', 'hidden', 'draft', 'archived', 'removed']) {
      expect(body).not.toContain(ids[key]!);
    }
    const media = response.items.flatMap((item) => item.media);
    for (const item of media) {
      expect(Object.keys(item).sort()).toEqual(['durationSeconds', 'kind']);
    }
    expect(JSON.stringify(media)).not.toMatch(/videoUid|objectKey|media-access|https?:\/\//);
  });
});
