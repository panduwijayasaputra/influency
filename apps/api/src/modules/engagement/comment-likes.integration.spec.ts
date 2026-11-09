import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  commentLikeResponseSchema,
  postCommentListSchema,
  postReplyListSchema,
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
import { ENV, type Env, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

type ErrorBody = { error: { code: string; message: string } };
const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS and the other comment specs (29, 2a), so this spec owns its rows.
const FANS = Array.from(
  { length: 10 },
  (_, i) => `0190a000-0000-7000-8000-0000002b1${String(i).padStart(3, '0')}`,
);
const USERS = {
  creator: '0190a000-0000-7000-8000-0000002b0001',
  fanA: '0190a000-0000-7000-8000-0000002b0002',
  fanB: '0190a000-0000-7000-8000-0000002b0003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: string) => `comment-likes-spec-${name}`;
const cid = (n: number) => `0190a000-0000-7000-8000-0000002b8${String(n).padStart(3, '0')}`;
const UNKNOWN = '0190a000-0000-7000-8000-0000002b9999';
const C = { top: cid(1), reply: cid(2), deletedParent: cid(3), replyUnderDeleted: cid(4) };
const DELETED = cid(5);

async function boot(overrides: Partial<Env>) {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue({ ...parseEnv(process.env), ...overrides })
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

describe('comment likes', () => {
  const prisma = createTestPrisma();
  const userIds = [...Object.values(USERS), ...FANS];
  const posts = {} as Record<'free' | 'other' | 'premium' | 'archived' | 'draft', string>;
  let app: NestFastifyApplication;
  let openApp: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        ...Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Likes ${name}` })),
        ...FANS.map((id, i) => ({ id, displayName: `Likes fan ${i}` })),
      ],
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: [
        ...(Object.keys(USERS) as UserName[]).map((name) => ({
          userId: USERS[name],
          tokenHash: sha256hex(token(name)),
          expiresAt,
        })),
        ...FANS.map((userId, i) => ({
          userId,
          tokenHash: sha256hex(token(`f${i}`)),
          expiresAt,
        })),
      ],
    });
    const creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: 'comment-likes-spec',
          status: 'APPROVED',
          ...profileFields('Likes'),
        },
      })
    ).id;
    for (const [key, visibility, status] of [
      ['free', 'FREE', 'PUBLISHED'],
      ['other', 'FREE', 'PUBLISHED'],
      ['premium', 'PREMIUM', 'PUBLISHED'],
      ['archived', 'FREE', 'ARCHIVED'],
      ['draft', 'FREE', 'DRAFT'],
    ] as const) {
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
    }
    await prisma.postOffer.create({
      data: { postId: posts.premium, version: 1, priceCoins: 10n },
    });
    const c = (id: string, postId: string, extra: object = {}) => ({
      id,
      postId,
      userId: USERS.creator,
      body: 'komentar',
      ...extra,
    });
    await prisma.postComment.createMany({
      data: [
        c(C.top, posts.free),
        c(C.deletedParent, posts.free, { deletedAt: new Date(), deletedByUserId: USERS.creator }),
        c(DELETED, posts.free, { deletedAt: new Date(), deletedByUserId: USERS.creator }),
        c(cid(6), posts.other),
        c(cid(7), posts.premium),
        c(cid(8), posts.archived),
        c(cid(9), posts.draft),
      ],
    });
    await prisma.postComment.createMany({
      data: [
        c(C.reply, posts.free, { parentId: C.top }),
        c(C.replyUnderDeleted, posts.free, { parentId: C.deletedParent }),
      ],
    });
    [app, openApp] = await Promise.all([
      boot({}),
      boot({ PREMIUM_COMMENTS_READ_WITHOUT_ACCESS: true }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([app, openApp].map((a) => a.close()));
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.commentLike.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.commentModerationAction.deleteMany({ where: { post: where } });
    await prisma.postComment.deleteMany({ where: { post: where, parentId: { not: null } } });
    await prisma.postComment.deleteMany({ where: { post: where } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const call = (
    method: 'POST' | 'DELETE',
    postId: string,
    commentId: string,
    who?: string,
    target = app,
    origin: string | null = WEB_ORIGIN,
  ) =>
    target.inject({
      method,
      url: `/api/v1/posts/${postId}/comments/${commentId}/likes`,
      cookies: who ? { [SESSION_COOKIE]: token(who) } : {},
      headers: origin === null ? {} : { origin },
    });
  const like = (commentId: string, who: string, postId = posts.free) =>
    call('POST', postId, commentId, who);
  const unlike = (commentId: string, who: string, postId = posts.free) =>
    call('DELETE', postId, commentId, who);
  const body = (res: { json: () => unknown }) => commentLikeResponseSchema.parse(res.json());
  const rows = (commentId: string) => prisma.commentLike.count({ where: { commentId } });
  const stored = async (commentId: string) =>
    (await prisma.postComment.findUniqueOrThrow({ where: { id: commentId } })).likeCount;

  it('likes and unlikes idempotently, never below zero', async () => {
    const first = await like(C.top, 'fanA');
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(body(first)).toEqual({ liked: true, likeCount: 1 });
    expect(body(await like(C.top, 'fanA'))).toEqual({ liked: true, likeCount: 1 });
    expect(body(await like(C.top, 'fanB'))).toEqual({ liked: true, likeCount: 2 });
    expect(body(await unlike(C.top, 'fanA'))).toEqual({ liked: false, likeCount: 1 });
    expect(body(await unlike(C.top, 'fanA'))).toEqual({ liked: false, likeCount: 1 });
    expect(body(await unlike(C.top, 'fanB'))).toEqual({ liked: false, likeCount: 0 });
    expect(await rows(C.top)).toBe(0);
    expect(await stored(C.top)).toBe(0);
  });

  it('likes a reply, and a reply under a deleted parent', async () => {
    expect(body(await like(C.reply, 'fanA')).likeCount).toBe(1);
    expect(body(await like(C.replyUnderDeleted, 'fanA')).likeCount).toBe(1);
    expect(await stored(C.replyUnderDeleted)).toBe(1);
  });

  it('answers 404 for a deleted comment, keeping its old likes', async () => {
    await prisma.commentLike.create({ data: { commentId: DELETED, userId: USERS.fanB } });
    expect((await like(DELETED, 'fanA')).statusCode).toBe(404);
    expect((await unlike(DELETED, 'fanB')).statusCode).toBe(404);
    expect((await like(C.deletedParent, 'fanA')).statusCode).toBe(404);
    expect(await rows(DELETED)).toBe(1);
    expect(await rows(C.deletedParent)).toBe(0);
  });

  it('answers 404 for unknown ids and comments of another post, 400 for malformed ids', async () => {
    expect((await like(UNKNOWN, 'fanA')).statusCode).toBe(404);
    expect((await like(cid(6), 'fanA')).statusCode).toBe(404); // belongs to posts.other
    expect((await like(C.top, 'fanA', UNKNOWN)).statusCode).toBe(404);
    expect((await like('not-a-uuid', 'fanA')).statusCode).toBe(400);
    expect(await rows(cid(6))).toBe(0);
  });

  it('needs a session and a same-origin request', async () => {
    expect((await call('POST', posts.free, C.top)).statusCode).toBe(401);
    expect((await call('DELETE', posts.free, C.top)).statusCode).toBe(401);
    const noOrigin = await call('POST', posts.free, C.top, 'fanA', app, null);
    expect(noOrigin.statusCode).toBe(403);
    expect(await rows(C.top)).toBe(0);
  });

  it('locked premium post: 403 whether or not the comment exists, unless the policy flag is on', async () => {
    const real = await like(cid(7), 'fanA', posts.premium);
    const unknown = await like(UNKNOWN, 'fanA', posts.premium);
    expect(real.statusCode).toBe(403);
    expect(unknown.statusCode).toBe(403);
    expect(real.json<ErrorBody>().error.code).toBe(unknown.json<ErrorBody>().error.code);
    expect(real.json<ErrorBody>().error.message).toBe(unknown.json<ErrorBody>().error.message);
    expect((await unlike(cid(7), 'fanA', posts.premium)).statusCode).toBe(403);
    expect(await rows(cid(7))).toBe(0);
    const open = await call('POST', posts.premium, cid(7), 'fanA', openApp);
    expect(body(open)).toEqual({ liked: true, likeCount: 1 });
    // The owner always has access.
    expect(body(await like(cid(7), 'creator', posts.premium)).likeCount).toBe(2);
  });

  it('rejects archived and hidden posts', async () => {
    const archived = await like(cid(8), 'fanA', posts.archived);
    expect(archived.statusCode).toBe(404);
    const draft = await like(cid(9), 'fanA', posts.draft);
    expect(draft.statusCode).toBe(404);
    expect(await rows(cid(8))).toBe(0);
  });

  it('twenty parallel likes by one user leave one row and a count of 1', async () => {
    const res = await Promise.all(Array.from({ length: 20 }, () => like(C.top, 'fanA')));
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    expect(res.every((r) => body(r).likeCount === 1)).toBe(true);
    expect(await rows(C.top)).toBe(1);
    expect(await stored(C.top)).toBe(1);
    await unlike(C.top, 'fanA');
  });

  it('ten users liking in parallel count 10', async () => {
    const res = await Promise.all(FANS.map((_, i) => like(C.top, `f${i}`)));
    expect(res.every((r) => r.statusCode === 200)).toBe(true);
    expect(await rows(C.top)).toBe(10);
    expect(await stored(C.top)).toBe(10);
  });

  it('a mixed parallel like/unlike run keeps like_count equal to the rows', async () => {
    const calls = FANS.flatMap((_, i) => [like(C.top, `f${i}`), unlike(C.top, `f${i}`)]);
    await Promise.all(calls);
    expect(await stored(C.top)).toBe(await rows(C.top));
    await Promise.all(FANS.map((_, i) => unlike(C.top, `f${i}`)));
    expect(await stored(C.top)).toBe(0);
    expect(await rows(C.top)).toBe(0);
  });

  it('a like racing the comment delete never leaves a like on a deleted comment', async () => {
    const id = cid(10);
    await prisma.postComment.create({
      data: { id, postId: posts.free, userId: USERS.creator, body: 'racing' },
    });
    const [res] = await Promise.all([
      like(id, 'fanA'),
      prisma.postComment.updateMany({
        where: { id },
        data: { deletedAt: new Date(), deletedByUserId: USERS.creator },
      }),
    ]);
    const after = await prisma.postComment.findUniqueOrThrow({ where: { id } });
    if (res.statusCode === 404) expect(await rows(id)).toBe(0);
    else expect(after.likeCount).toBe(await rows(id));
  });

  describe('liked in responses', () => {
    const listComments = (who?: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/posts/${posts.free}/comments`,
        cookies: who ? { [SESSION_COOKIE]: token(who) } : {},
      });
    const flat = (res: { json: () => unknown }) =>
      Object.fromEntries(
        postCommentListSchema
          .parse(res.json())
          .items.flatMap((c) => [c, ...(c.replies ?? [])])
          .map((c) => [c.id, c]),
      );

    it("marks the viewer's own likes on comments and replies, counts for everyone", async () => {
      await like(C.top, 'fanA');
      await like(C.reply, 'fanA');
      await like(C.top, 'fanB');
      const asA = flat(await listComments('fanA'));
      expect(asA[C.top]).toMatchObject({ liked: true, likeCount: 2 });
      expect(asA[C.reply]).toMatchObject({ liked: true });
      const asB = flat(await listComments('fanB'));
      expect(asB[C.top]).toMatchObject({ liked: true, likeCount: 2 });
      expect(asB[C.reply]).toMatchObject({ liked: false, likeCount: 1 });
      const other = flat(await listComments('f0'));
      expect(other[C.top]).toMatchObject({ liked: false, likeCount: 2 });
      const guest = flat(await listComments());
      expect(guest[C.top]).toMatchObject({ liked: false, likeCount: 2 });
      await Promise.all([unlike(C.top, 'fanA'), unlike(C.top, 'fanB'), unlike(C.reply, 'fanA')]);
    });

    it('the replies endpoint marks liked replies too', async () => {
      await like(C.reply, 'fanA');
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/posts/${posts.free}/comments/${C.top}/replies`,
        cookies: { [SESSION_COOKIE]: token('fanA') },
      });
      const items = postReplyListSchema.parse(res.json()).items;
      expect(items.find((r) => r.id === C.reply)).toMatchObject({ liked: true, likeCount: 1 });
      await unlike(C.reply, 'fanA');
    });

    it('a deleted placeholder is never liked and has no likes', async () => {
      await prisma.commentLike.upsert({
        where: { commentId_userId: { commentId: C.deletedParent, userId: USERS.fanA } },
        create: { commentId: C.deletedParent, userId: USERS.fanA },
        update: {},
      });
      const placeholder = flat(await listComments('fanA'))[C.deletedParent];
      expect(placeholder).toMatchObject({ deleted: true, liked: false, likeCount: 0 });
    });

    it('a new comment starts unliked with a count of 0', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/posts/${posts.other}/comments`,
        cookies: { [SESSION_COOKIE]: token('fanB') },
        headers: { origin: WEB_ORIGIN },
        payload: { body: 'baru' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toMatchObject({ liked: false, likeCount: 0 });
    });
  });

  it('the database refuses a duplicate (comment, user) like', async () => {
    await prisma.commentLike.create({ data: { commentId: C.reply, userId: USERS.fanB } });
    await expect(
      prisma.commentLike.create({ data: { commentId: C.reply, userId: USERS.fanB } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
