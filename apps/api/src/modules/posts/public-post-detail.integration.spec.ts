import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { errorResponseSchema, publicPostDetailSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { createApp } from '../../app.factory.js';
import { sha256hex } from '../../common/crypto.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000140001',
  other: '0190a000-0000-7000-8000-000000140002',
  stranger: '0190a000-0000-7000-8000-000000140003',
  admin: '0190a000-0000-7000-8000-000000140004',
  suspended: '0190a000-0000-7000-8000-000000140005',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-detail-spec-${name}`;
const EXPIRED_TOKEN = 'post-detail-spec-expired';
const SLUG = 'detail-spec-creator';

describe('GET /creators/:slug/posts/:postId', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const secrets: string[] = [];
  const posts: Record<string, string> = {};
  const previewId = randomUUID();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Detail ${name}`,
        status: name === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
      })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: [
        ...(['creator', 'stranger', 'admin'] as const).map((name) => ({
          userId: USERS[name],
          tokenHash: sha256hex(token(name)),
          expiresAt,
        })),
        { userId: USERS.stranger, tokenHash: sha256hex(EXPIRED_TOKEN), expiresAt: new Date(0) },
      ],
    });
    await prisma.userRole.create({ data: { userId: USERS.admin, role: 'ADMIN' } });
    const profile = async (name: 'creator' | 'other' | 'suspended') =>
      (
        await prisma.creatorProfile.create({
          data: {
            userId: USERS[name],
            slug: name === 'creator' ? SLUG : `detail-spec-${name}`,
            status: 'APPROVED',
            ...profileFields(name),
          },
        })
      ).id;
    const creatorId = await profile('creator');
    await profile('other');
    const suspendedId = await profile('suspended');

    const post = async (
      name: string,
      creatorProfileId: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'PENDING_REVIEW' | 'REMOVED',
      extra: { previewKey?: string } = {},
    ) => {
      const row = await prisma.post.create({
        data: {
          creatorProfileId,
          visibility,
          status,
          caption: `${name} caption`,
          publishedAt: status === 'DRAFT' ? null : new Date('2026-11-01T00:00:00Z'),
          ...extra,
        },
      });
      posts[name] = row.id;
      return row.id;
    };
    const free = await post('free', creatorId, 'FREE', 'PUBLISHED');
    const premium = await post('premium', creatorId, 'PREMIUM', 'PUBLISHED', {
      previewKey: `post-previews/${previewId}`,
    });
    await post('draft', creatorId, 'FREE', 'DRAFT');
    await post('archived', creatorId, 'PREMIUM', 'ARCHIVED');
    await post('pending', creatorId, 'FREE', 'PENDING_REVIEW');
    await post('removed', creatorId, 'FREE', 'REMOVED');
    await post('suspended', suspendedId, 'FREE', 'PUBLISHED');

    for (const [postId, kind, status] of [
      [free, 'IMAGE', 'READY'],
      [free, 'IMAGE', 'REJECTED'],
      [premium, 'VIDEO', 'READY'],
      [premium, 'IMAGE', 'READY'],
    ] as const) {
      const value = kind === 'IMAGE' ? `post-media/${randomUUID()}` : `uid-${randomUUID()}`;
      const row = await prisma.mediaAsset.create({
        data: {
          postId,
          kind,
          status,
          ...(kind === 'IMAGE' ? { objectKey: value } : { videoUid: value }),
          contentType: kind === 'IMAGE' ? 'image/png' : 'video/mp4',
          byteSize: 10,
          uploadExpiresAt: new Date(),
        },
      });
      secrets.push(row.id, value);
    }
    await prisma.postOffer.createMany({
      data: [
        { postId: premium, version: 1, priceCoins: 5n },
        { postId: premium, version: 2, priceCoins: 8n },
      ],
    });

    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    const owned = { post: { creatorProfile: { userId: { in: userIds } } } };
    await prisma.mediaAsset.deleteMany({ where: owned });
    await prisma.postOffer.deleteMany({ where: owned });
    await prisma.post.deleteMany({ where: owned.post });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (postId: string, as?: UserName | 'expired', slug = SLUG) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/creators/${slug}/posts/${postId}`,
      headers: as
        ? { cookie: `${SESSION_COOKIE}=${as === 'expired' ? EXPIRED_TOKEN : token(as)}` }
        : {},
    });
  const detail = async (...args: Parameters<typeof get>) => {
    const res = await get(...args);
    expect(res.statusCode).toBe(200);
    return publicPostDetailSchema.parse(res.json());
  };
  const expectNotFound = async (...args: Parameters<typeof get>) => {
    const res = await get(...args);
    expect(res.statusCode).toBe(404);
    expect(errorResponseSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
  };

  it('shows a free post in full to anyone, counting READY media only', async () => {
    const res = await get(posts.free!);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(publicPostDetailSchema.parse(res.json())).toEqual({
      id: posts.free,
      visibility: 'FREE',
      status: 'PUBLISHED',
      caption: 'free caption',
      publishedAt: '2026-11-01T00:00:00.000Z',
      imageCount: 1,
      videoCount: 0,
      offer: null,
      previewUrl: null,
      access: 'full',
      likeCount: 0,
      viewer: null,
    });
  });

  it('locks a premium post for visitors with its latest price and blurred preview', async () => {
    for (const as of [undefined, 'stranger'] as const) {
      expect(await detail(posts.premium!, as)).toMatchObject({
        access: 'locked',
        offer: { priceCoins: 8 },
        imageCount: 1,
        videoCount: 1,
        previewUrl: `/api/v1/creators/${SLUG}/posts/${posts.premium}/preview/${previewId}`,
      });
    }
  });

  it('never exposes media ids, keys or provider uids', async () => {
    for (const as of [undefined, 'creator'] as const) {
      const body = (await get(posts.premium!, as)).body + (await get(posts.free!, as)).body;
      for (const secret of secrets) expect(body).not.toContain(secret);
    }
  });

  it('gives the owner full access, including their own draft and archived posts', async () => {
    expect((await detail(posts.premium!, 'creator')).access).toBe('full');
    expect(await detail(posts.draft!, 'creator')).toMatchObject({
      access: 'full',
      status: 'DRAFT',
      publishedAt: null,
    });
    expect(await detail(posts.archived!, 'creator')).toMatchObject({
      access: 'full',
      status: 'ARCHIVED',
    });
  });

  it('shows a removed post to admins only', async () => {
    expect(await detail(posts.removed!, 'admin')).toMatchObject({
      access: 'full',
      status: 'REMOVED',
    });
    await expectNotFound(posts.removed!, 'creator');
  });

  it.each(['draft', 'archived', 'pending', 'removed'])(
    'hides a %s post from the public',
    async (name) => {
      await expectNotFound(posts[name]!);
      await expectNotFound(posts[name]!, 'stranger');
    },
  );

  it('hides posts of a suspended creator', async () => {
    await expectNotFound(posts.suspended!, undefined, 'detail-spec-suspended');
  });

  it('answers NOT_FOUND for a post under another slug, unknown or malformed ids', async () => {
    await expectNotFound(posts.free!, undefined, 'detail-spec-other');
    await expectNotFound(randomUUID());
    await expectNotFound('not-a-uuid');
  });

  it('matches the slug case-insensitively', async () => {
    expect((await detail(posts.free!, undefined, 'Detail-Spec-Creator')).id).toBe(posts.free);
  });

  it('treats an expired session as anonymous', async () => {
    expect((await detail(posts.free!, 'expired')).access).toBe('full');
    expect((await detail(posts.premium!, 'expired')).access).toBe('locked');
  });
});
