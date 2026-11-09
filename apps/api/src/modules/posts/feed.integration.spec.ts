import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  HOME_FEED_PAGE_SIZE,
  type HomeFeedItem,
  homeFeedPageSchema,
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

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  fan: '0190a000-0000-7000-8000-000000300001',
  admin: '0190a000-0000-7000-8000-000000300002',
  creatorA: '0190a000-0000-7000-8000-000000300003',
  creatorB: '0190a000-0000-7000-8000-000000300004',
  pending: '0190a000-0000-7000-8000-000000300005',
  suspended: '0190a000-0000-7000-8000-000000300006',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `home-feed-spec-${name}`;
const SLUG = {
  a: 'home-feed-spec-a',
  b: 'home-feed-spec-b',
  pending: 'home-feed-spec-pending',
  susp: 'home-feed-spec-susp',
};
// Far in the future so these posts lead the global feed, whatever other specs have published.
const at = (second: number) => new Date(Date.UTC(2099, 0, 1, 0, 0, second));
const IMAGE_KEY = 'post-media/home-feed-spec-secret-original';
const PREVIEW_ID = '0190a000-0000-7000-8000-0000003000ff';

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

describe('GET /feed', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  /** Post ids by key; `visible` lists the 12 posts the fan should see, newest first. */
  const ids: Record<string, string> = {};
  const visible: string[] = [];
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Feed ${name}`,
        status: name === 'suspended' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    await prisma.userRole.create({ data: { userId: USERS.admin, role: 'ADMIN' } });
    const profile = async (user: UserName, slug: string, status: 'APPROVED' | 'PENDING_REVIEW') =>
      (
        await prisma.creatorProfile.create({
          data: { userId: USERS[user], slug, status, ...profileFields(slug) },
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
      extra: {
        visibility?: 'FREE' | 'PREMIUM';
        status?: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED' | 'PENDING_REVIEW';
      } = {},
    ) => {
      const status = extra.status ?? 'PUBLISHED';
      const visibility = extra.visibility ?? 'FREE';
      ids[key] = (
        await prisma.post.create({
          data: {
            creatorProfileId,
            visibility,
            status,
            caption: key,
            publishedAt: status === 'DRAFT' ? null : at(second),
            previewKey: visibility === 'PREMIUM' ? `post-previews/${PREVIEW_ID}` : null,
          },
        })
      ).id;
      return ids[key];
    };
    // 12 visible posts: A has seconds 1..7, B has 8..12; the newest (12) is B's premium post. Insert out of order.
    for (const second of [3, 1, 7, 5, 2, 6, 4]) await post(`a${second}`, a, second);
    for (const second of [8, 10, 9, 11]) await post(`b${second}`, b, second);
    await post('b12', b, 12, { visibility: 'PREMIUM' });
    visible.push('b12', 'b11', 'b10', 'b9', 'b8', 'a7', 'a6', 'a5', 'a4', 'a3', 'a2', 'a1');
    // Never in the feed.
    await post('draft', a, 20, { status: 'DRAFT' });
    await post('archived', a, 21, { status: 'ARCHIVED' });
    await post('removed', a, 22, { status: 'REMOVED' });
    await post('held', a, 23, { status: 'PENDING_REVIEW' });
    await post('pendingCreator', pending, 24);
    await post('suspendedCreator', susp, 25);

    await prisma.postOffer.create({ data: { postId: ids.b12!, version: 1, priceCoins: 10n } });
    await prisma.mediaAsset.create({
      data: {
        postId: ids.b12!,
        kind: 'IMAGE',
        status: 'READY',
        objectKey: IMAGE_KEY,
        contentType: 'image/jpeg',
        byteSize: 10,
        uploadExpiresAt: at(0),
      },
    });
    await prisma.postLike.create({ data: { postId: ids.b11!, userId: USERS.fan } });

    app = await boot();
  });

  afterAll(async () => {
    await app.close();
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.postLike.deleteMany({ where: { post: where } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (user?: UserName, cursor?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
    });
  const page = async (user: UserName, cursor?: string) => {
    const res = await get(user, cursor);
    expect(res.statusCode).toBe(200);
    return homeFeedPageSchema.parse(res.json());
  };
  const mine = (items: HomeFeedItem[]) =>
    items.filter((i) => i.creator.slug.startsWith('home-feed-spec-'));
  const captions = (items: HomeFeedItem[]) => mine(items).map((i) => i.id);
  const idsOf = (keys: string[]) => keys.map((k) => ids[k]!);

  it('is for signed-in users only and is never cached', async () => {
    expect((await get()).statusCode).toBe(401);
    const res = await get('fan');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('lists newest first, ten per page, with a cursor', async () => {
    const first = await page('fan');
    expect(first.items).toHaveLength(HOME_FEED_PAGE_SIZE);
    expect(first.nextCursor).not.toBeNull();
    expect(captions(first.items)).toEqual(idsOf(visible.slice(0, 10)));
    const times = first.items.map((i) => Date.parse(i.publishedAt));
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });

  it('pages without duplicates or gaps, and shows each creator on its posts', async () => {
    const first = await page('fan');
    const second = await page('fan', first.nextCursor!);
    expect(captions(second.items)).toEqual(idsOf(visible.slice(10)));
    const all = [...first.items, ...second.items];
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    const top = first.items[0]!;
    expect(top.creator).toEqual({ slug: SLUG.b, displayName: SLUG.b, avatarUrl: null });
  });

  it('does not repeat or shift posts when something is published after page 1', async () => {
    const first = await page('fan');
    const extra = await prisma.post.create({
      data: {
        creatorProfileId: (
          await prisma.creatorProfile.findUniqueOrThrow({ where: { slug: SLUG.a } })
        ).id,
        visibility: 'FREE',
        status: 'PUBLISHED',
        publishedAt: at(40),
      },
    });
    try {
      const second = await page('fan', first.nextCursor!);
      expect(second.items.map((i) => i.id)).not.toContain(extra.id);
      expect(captions(second.items)).toEqual(idsOf(visible.slice(10)));
      expect((await page('fan')).items[0]!.id).toBe(extra.id);
    } finally {
      await prisma.post.delete({ where: { id: extra.id } });
    }
  });

  it('leaves out the viewer’s own posts', async () => {
    const res = await page('creatorA');
    expect(mine(res.items).every((i) => i.creator.slug === SLUG.b)).toBe(true);
    expect(captions(res.items)).toEqual(idsOf(['b12', 'b11', 'b10', 'b9', 'b8']));
  });

  it('never lists drafts, archived, removed or held posts, or unapproved and suspended creators', async () => {
    const first = await page('fan');
    const second = await page('fan', first.nextCursor!);
    const seen = new Set([...first.items, ...second.items].map((i) => i.id));
    for (const key of [
      'draft',
      'archived',
      'removed',
      'held',
      'pendingCreator',
      'suspendedCreator',
    ]) {
      expect(seen.has(ids[key]!), key).toBe(false);
    }
    expect(
      [...first.items, ...second.items].some((i) =>
        [SLUG.pending, SLUG.susp].includes(i.creator.slug),
      ),
    ).toBe(false);
  });

  it('shows a locked premium post as a preview and price only', async () => {
    const res = await get('fan');
    const item = homeFeedPageSchema.parse(res.json()).items[0]!;
    expect(item.id).toBe(ids.b12);
    expect(item).toMatchObject({
      visibility: 'PREMIUM',
      access: 'locked',
      offer: { priceCoins: 10 },
      imageCount: 1,
      media: [{ kind: 'IMAGE', durationSeconds: null }],
    });
    expect(item.previewUrl).toBe(
      `/api/v1/creators/${SLUG.b}/posts/${ids.b12}/preview/${PREVIEW_ID}`,
    );
    // No storage key, media id or signed URL anywhere in the body.
    expect(res.body).not.toContain(IMAGE_KEY);
    expect(res.body).not.toContain('post-media/');
    expect(res.body).not.toMatch(/objectKey|videoUid|signature|X-Amz/i);
  });

  it('gives an admin full access to the premium post', async () => {
    const item = (await page('admin')).items[0]!;
    expect(item.id).toBe(ids.b12);
    expect(item.access).toBe('full');
  });

  it('reflects the viewer’s likes', async () => {
    const items = (await page('fan')).items;
    expect(items.find((i) => i.id === ids.b11)!.viewer).toMatchObject({ liked: true });
    expect(items.find((i) => i.id === ids.b10)!.viewer).toMatchObject({ liked: false });
  });

  it.each(['abc', '12_nope', '-1_0190a000-0000-7000-8000-000000300001'])(
    'rejects the malformed cursor %j',
    async (cursor) => {
      const res = await get('fan', cursor);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
    },
  );
});
