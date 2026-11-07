import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  PUBLIC_FEED_LIMIT,
  publicPostListSchema,
  studioPostListSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000210001',
  empty: '0190a000-0000-7000-8000-000000210002',
  pending: '0190a000-0000-7000-8000-000000210003',
  rejected: '0190a000-0000-7000-8000-000000210004',
  suspended: '0190a000-0000-7000-8000-000000210005',
  many: '0190a000-0000-7000-8000-000000210006',
  fan: '0190a000-0000-7000-8000-000000210007',
  admin: '0190a000-0000-7000-8000-000000210008',
} as const;
const TOKEN = 'public-posts-spec-creator';
const TOKENS = { fan: 'public-posts-spec-fan', admin: 'public-posts-spec-admin' };

describe('GET /creators/:slug/posts', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const secrets: string[] = [];
  let app: NestFastifyApplication;
  let free: string;
  let premium: string;

  const profile = async (
    name: keyof typeof USERS,
    status: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED' = 'APPROVED',
  ) =>
    (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS[name],
          slug: `feed-spec-${name}`,
          status,
          ...profileFields(name),
        },
      })
    ).id;
  const media = async (
    postId: string,
    kind: 'IMAGE' | 'VIDEO',
    status: 'READY' | 'REJECTED' | 'PROCESSING',
    extra: { durationSeconds?: number; createdAt?: Date } = {},
  ) => {
    const value = kind === 'IMAGE' ? `post-media/${randomUUID()}` : `uid-${randomUUID()}`;
    const ref = kind === 'IMAGE' ? { objectKey: value } : { videoUid: value };
    const row = await prisma.mediaAsset.create({
      data: {
        postId,
        kind,
        status,
        ...ref,
        contentType: kind === 'IMAGE' ? 'image/png' : 'video/mp4',
        byteSize: 10,
        uploadExpiresAt: new Date(),
        ...extra,
      },
    });
    secrets.push(row.id, value);
  };

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Feed ${name}`,
        status: name === 'suspended' ? 'SUSPENDED' : 'ACTIVE',
      })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: [
        { userId: USERS.creator, tokenHash: sha256hex(TOKEN), expiresAt },
        { userId: USERS.fan, tokenHash: sha256hex(TOKENS.fan), expiresAt },
        { userId: USERS.admin, tokenHash: sha256hex(TOKENS.admin), expiresAt },
      ],
    });
    await prisma.userRole.create({ data: { userId: USERS.admin, role: 'ADMIN' } });
    const creatorId = await profile('creator');
    await profile('empty');
    await profile('pending', 'PENDING_REVIEW');
    await profile('rejected', 'REJECTED');
    const suspendedId = await profile('suspended');
    const manyId = await profile('many');

    const post = async (
      creatorProfileId: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'PENDING_REVIEW' | 'REMOVED',
      publishedAt: Date | null,
    ) =>
      (
        await prisma.post.create({
          data: { creatorProfileId, visibility, status, publishedAt, caption: `${status} post` },
        })
      ).id;
    free = await post(creatorId, 'FREE', 'PUBLISHED', new Date('2026-11-01T00:00:00Z'));
    premium = await post(creatorId, 'PREMIUM', 'PUBLISHED', new Date('2026-11-02T00:00:00Z'));
    await media(free, 'VIDEO', 'READY', {
      durationSeconds: 42,
      createdAt: new Date('2026-10-01T00:00:01Z'),
    });
    await media(free, 'IMAGE', 'READY', { createdAt: new Date('2026-10-01T00:00:00Z') });
    await media(free, 'IMAGE', 'REJECTED');
    await media(free, 'VIDEO', 'PROCESSING');
    await media(premium, 'VIDEO', 'READY', { durationSeconds: 9 });
    // The fan likes the free post; the admin likes the premium one (must not leak to the fan).
    await prisma.postLike.createMany({
      data: [
        { postId: free, userId: USERS.fan },
        { postId: premium, userId: USERS.admin },
      ],
    });
    await prisma.postComment.createMany({
      data: [
        { postId: free, userId: USERS.fan, body: 'Keren' },
        {
          postId: free,
          userId: USERS.fan,
          body: 'Dihapus',
          deletedAt: new Date(),
          deletedByUserId: USERS.fan,
        },
      ],
    });
    await prisma.postOffer.createMany({
      data: [
        { postId: premium, version: 1, priceCoins: 5n },
        { postId: premium, version: 2, priceCoins: 8n },
      ],
    });
    await post(creatorId, 'FREE', 'DRAFT', null);
    await post(creatorId, 'FREE', 'ARCHIVED', new Date());
    await post(creatorId, 'FREE', 'PENDING_REVIEW', new Date());
    await post(creatorId, 'FREE', 'REMOVED', new Date());
    await post(suspendedId, 'FREE', 'PUBLISHED', new Date());
    await prisma.post.createMany({
      data: Array.from({ length: PUBLIC_FEED_LIMIT + 2 }, (_, i) => ({
        creatorProfileId: manyId,
        visibility: 'FREE' as const,
        status: 'PUBLISHED' as const,
        publishedAt: new Date(Date.UTC(2026, 9, 1 + i)),
      })),
    });

    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    const owned = { post: { creatorProfile: { userId: { in: userIds } } } };
    await prisma.postComment.deleteMany({ where: owned });
    await prisma.postLike.deleteMany({ where: owned });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.mediaAsset.deleteMany({ where: owned });
    await prisma.postOffer.deleteMany({ where: owned });
    await prisma.post.deleteMany({ where: owned.post });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const feed = (slug: string, token?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/creators/${slug}/posts`,
      cookies: token ? { influency_session: token } : {},
    });
  const postsFor = async (token?: string) =>
    publicPostListSchema.parse((await feed('feed-spec-creator', token)).json()).posts;

  it('returns only PUBLISHED posts, newest first, as safe previews', async () => {
    const res = await feed('feed-spec-creator');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { posts } = publicPostListSchema.parse(res.json());
    expect(posts.map((p) => p.id)).toEqual([premium, free]);
    expect(res.json<{ posts: unknown[] }>().posts[0]).toEqual({
      id: premium,
      visibility: 'PREMIUM',
      caption: 'PUBLISHED post',
      publishedAt: '2026-11-02T00:00:00.000Z',
      imageCount: 0,
      videoCount: 1,
      offer: { priceCoins: 8 },
      previewUrl: null,
      likeCount: 1,
      access: 'locked',
      viewer: null,
      commentCount: 0,
      media: [{ kind: 'VIDEO', durationSeconds: 9 }],
    });
    expect(posts[1]).toMatchObject({
      imageCount: 1,
      videoCount: 1,
      offer: null,
      access: 'full',
      viewer: null,
      likeCount: 1,
      commentCount: 1,
    });
  });

  it('lists READY media only, oldest first, with video durations', async () => {
    const [, freePost] = await postsFor();
    expect(freePost!.media).toEqual([
      { kind: 'IMAGE', durationSeconds: null },
      { kind: 'VIDEO', durationSeconds: 42 },
    ]);
  });

  it('gives another signed-in user locked premium, their own likes only, and report rights', async () => {
    const [premiumPost, freePost] = await postsFor(TOKENS.fan);
    expect(premiumPost).toMatchObject({
      access: 'locked',
      viewer: { liked: false, canLike: false, canReport: true },
    });
    expect(freePost).toMatchObject({
      access: 'full',
      viewer: { liked: true, canLike: true, canReport: true },
    });
  });

  it('gives the owner full access and no report action', async () => {
    const posts = await postsFor(TOKEN);
    expect(posts.map((p) => p.access)).toEqual(['full', 'full']);
    expect(posts.every((p) => p.viewer?.canReport === false)).toBe(true);
  });

  it('gives an admin full access to premium', async () => {
    const [premiumPost] = await postsFor(TOKENS.admin);
    expect(premiumPost).toMatchObject({ access: 'full', viewer: { liked: true, canLike: true } });
  });

  it('lets a locked premium post be liked when PREMIUM_LIKES_WITHOUT_ACCESS is on', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ENV)
      .useValue({ ...parseEnv(process.env), PREMIUM_LIKES_WITHOUT_ACCESS: true })
      .compile();
    const flagged = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await flagged.init();
    await flagged.getHttpAdapter().getInstance().ready();
    try {
      const res = await flagged.inject({
        method: 'GET',
        url: '/api/v1/creators/feed-spec-creator/posts',
        cookies: { influency_session: TOKENS.fan },
      });
      const [premiumPost] = publicPostListSchema.parse(res.json()).posts;
      expect(premiumPost).toMatchObject({ access: 'locked', viewer: { canLike: true } });
    } finally {
      await flagged.close();
    }
  });

  it('never exposes media ids, keys or provider uids', async () => {
    const body = (await feed('feed-spec-creator')).body;
    expect(secrets.length).toBeGreaterThan(0);
    for (const secret of secrets) expect(body).not.toContain(secret);
    expect(body).not.toMatch(/post-media\/|post-video\//);
  });

  it('matches the slug case-insensitively', async () => {
    const { posts } = publicPostListSchema.parse((await feed('FEED-SPEC-CREATOR')).json());
    expect(posts).toHaveLength(2);
  });

  it.each(['feed-spec-unknown', 'feed-spec-pending', 'feed-spec-rejected', 'feed-spec-suspended'])(
    'returns 404 for %s',
    async (slug) => {
      const res = await feed(slug);
      expect(res.statusCode).toBe(404);
      expect(errorResponseSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
    },
  );

  it('returns an empty list for an approved creator with nothing published', async () => {
    expect((await feed('feed-spec-empty')).json()).toEqual({ posts: [] });
  });

  it('caps the feed at PUBLIC_FEED_LIMIT', async () => {
    const { posts } = publicPostListSchema.parse((await feed('feed-spec-many')).json());
    expect(posts).toHaveLength(PUBLIC_FEED_LIMIT);
  });

  it('keeps GET /creators/me/posts on the studio list', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/creators/me/posts',
      cookies: { influency_session: TOKEN },
    });
    expect(res.statusCode).toBe(200);
    expect(studioPostListSchema.parse(res.json()).posts).toHaveLength(6);
  });
});
