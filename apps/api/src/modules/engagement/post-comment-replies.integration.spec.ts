import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  POST_COMMENT_REPLIES_PAGE_SIZE,
  POST_COMMENT_REPLIES_PREVIEW,
  POST_COMMENTS_PAGE_SIZE,
  postCommentListSchema,
  postCommentSchema,
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

const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS and the other comment specs, so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-0000002a0001',
  fanA: '0190a000-0000-7000-8000-0000002a0002',
  fanB: '0190a000-0000-7000-8000-0000002a0003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `comment-replies-spec-${name}`;
// Seeded comments sort before every uuidv7 the DB generates now, so "newer" ids are explicit here.
const cid = (n: number) => `0190a000-0000-7000-8000-0000002a8${String(n).padStart(3, '0')}`;

async function boot(overrides: Partial<Env>) {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue({ ...parseEnv(process.env), COMMENT_RATE_LIMIT_PER_MINUTE: 1000, ...overrides })
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

describe('comment replies and Top order', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;
  let limitedApp: NestFastifyApplication;
  const old = new Date(Date.now() - 3_600_000);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Replies ${name}` })),
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
        data: {
          userId: USERS.creator,
          slug: 'comment-replies-spec',
          status: 'APPROVED',
          ...profileFields('Replies'),
        },
      })
    ).id;
    for (const [key, visibility] of [
      ['order', 'FREE'],
      ['paged', 'FREE'],
      ['threads', 'FREE'],
      ['other', 'FREE'],
      ['limits', 'FREE'],
      ['premium', 'PREMIUM'],
    ] as const) {
      posts[key] = (
        await prisma.post.create({
          data: { creatorProfileId, visibility, status: 'PUBLISHED', publishedAt: new Date() },
        })
      ).id;
    }
    await prisma.postOffer.create({
      data: { postId: posts.premium!, version: 1, priceCoins: 10n },
    });
    [app, limitedApp] = await Promise.all([boot({}), boot({ COMMENT_RATE_LIMIT_PER_MINUTE: 3 })]);
  });

  afterAll(async () => {
    await Promise.all([app, limitedApp].map((a) => a.close()));
    const where = { creatorProfile: { userId: { in: userIds } } };
    // Replies first: parent_id is ON DELETE RESTRICT.
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

  const cookies = (user?: UserName): Record<string, string> =>
    user ? { [SESSION_COOKIE]: token(user) } : {};
  const list = (postId: string, user?: UserName, query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/comments${query}`,
      cookies: cookies(user),
    });
  const replies = (postId: string, commentId: string, user?: UserName, query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/comments/${commentId}/replies${query}`,
      cookies: cookies(user),
    });
  const post = (postId: string, user: UserName | undefined, body: unknown, target = app) =>
    target.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      cookies: cookies(user),
      headers: { origin: WEB_ORIGIN },
      payload: body as object,
    });
  const remove = (postId: string, commentId: string, user: UserName) =>
    app.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${postId}/comments/${commentId}`,
      cookies: cookies(user),
      headers: { origin: WEB_ORIGIN },
    });
  const parseList = (res: { statusCode: number; json: () => unknown }) => {
    expect(res.statusCode).toBe(200);
    return postCommentListSchema.parse(res.json());
  };
  const parseReplies = (res: { statusCode: number; json: () => unknown }) => {
    expect(res.statusCode).toBe(200);
    return postReplyListSchema.parse(res.json());
  };
  const seed = (
    id: number,
    postKey: string,
    extra: {
      userId?: string;
      body?: string;
      likeCount?: number;
      parentId?: string;
      deletedAt?: Date;
    } = {},
  ) =>
    prisma.postComment.create({
      data: {
        id: cid(id),
        postId: posts[postKey]!,
        userId: extra.userId ?? USERS.fanB,
        body: extra.body ?? `komentar ${id}`,
        createdAt: old,
        likeCount: extra.likeCount ?? 0,
        parentId: extra.parentId,
        deletedAt: extra.deletedAt,
        deletedByUserId: extra.deletedAt ? USERS.fanB : undefined,
      },
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;

  describe('Top order', () => {
    it('orders by likes descending, then newest first', async () => {
      await seed(1, 'order', { likeCount: 2 });
      await seed(2, 'order', { likeCount: 5 });
      await seed(3, 'order', { likeCount: 2 });
      await seed(4, 'order', { likeCount: 0 });
      const ids = parseList(await list(posts.order!)).items.map((c) => c.id);
      expect(ids).toEqual([cid(2), cid(3), cid(1), cid(4)]);
    });

    it('is stable across cursor pages: no duplicate, no gap', async () => {
      const total = POST_COMMENTS_PAGE_SIZE * 2 + 7;
      await prisma.postComment.createMany({
        data: Array.from({ length: total }, (_, i) => ({
          id: cid(100 + i),
          postId: posts.paged!,
          userId: USERS.fanB,
          body: `p ${i}`,
          createdAt: old,
          likeCount: i % 4, // lots of ties
        })),
      });
      const seen: { id: string; likes: number }[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const page = parseList(
          await list(
            posts.paged!,
            undefined,
            cursor ? `?cursor=${encodeURIComponent(cursor)}` : '',
          ),
        );
        seen.push(...page.items.map((c) => ({ id: c.id, likes: c.likeCount ?? 0 })));
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      expect(seen).toHaveLength(total);
      expect(new Set(seen.map((s) => s.id)).size).toBe(total);
      const expected = [...seen].sort((a, b) => b.likes - a.likes || (a.id < b.id ? 1 : -1));
      expect(seen).toEqual(expected);
    });

    it('rejects a malformed cursor', async () => {
      expect((await list(posts.order!, undefined, '?cursor=nope')).statusCode).toBe(400);
    });

    it('like_count can never be negative (DB CHECK)', async () => {
      await expect(
        prisma.$executeRaw`UPDATE post_comments SET like_count = -1 WHERE id = ${cid(4)}::uuid`,
      ).rejects.toThrow();
    });
  });

  describe('creating replies', () => {
    it('attaches a reply to a top-level parent and a reply-to-reply to the same parent', async () => {
      const parent = postCommentSchema.parse(
        (await post(posts.threads!, 'fanA', { body: 'induk' })).json(),
      );
      const r1res = await post(posts.threads!, 'fanB', { body: 'balasan 1', parentId: parent.id });
      expect(r1res.statusCode).toBe(201);
      const r1 = postCommentSchema.parse(r1res.json());
      expect(r1.canPin).toBe(false);
      const r2res = await post(posts.threads!, 'fanA', { body: 'balas balasan', parentId: r1.id });
      expect(r2res.statusCode).toBe(201);
      const r2 = postCommentSchema.parse(r2res.json());
      const rows = await prisma.postComment.findMany({
        where: { id: { in: [r1.id, r2.id] } },
        select: { id: true, parentId: true },
      });
      expect(rows.map((r) => r.parentId)).toEqual([parent.id, parent.id]);
      const top = parseList(await list(posts.threads!)).items.find((c) => c.id === parent.id)!;
      expect(top.replyCount).toBe(2);
      expect(top.replies!.map((r) => r.body)).toEqual(['balasan 1', 'balas balasan']);
    });

    it('rejects replies to missing, deleted or other-post comments (404 NOT_FOUND)', async () => {
      await seed(300, 'other');
      await seed(301, 'threads', { deletedAt: new Date() });
      for (const parentId of [cid(300), cid(301), '0190a000-0000-7000-8000-0000002a9999']) {
        const res = await post(posts.threads!, 'fanA', { body: 'x', parentId });
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe('NOT_FOUND');
      }
      expect((await post(posts.threads!, 'fanA', { body: 'x', parentId: 'nope' })).statusCode).toBe(
        400,
      );
    });

    it('replies count toward the per-minute rate limit', async () => {
      // The creator posts nothing else before this point, so the limit of 3 is not already used up.
      const parent = postCommentSchema.parse(
        (await post(posts.limits!, 'creator', { body: 'induk' }, limitedApp)).json(),
      );
      expect(
        (await post(posts.limits!, 'creator', { body: 'a', parentId: parent.id }, limitedApp))
          .statusCode,
      ).toBe(201);
      expect(
        (await post(posts.limits!, 'creator', { body: 'b', parentId: parent.id }, limitedApp))
          .statusCode,
      ).toBe(201);
      const third = await post(
        posts.limits!,
        'creator',
        { body: 'c', parentId: parent.id },
        limitedApp,
      );
      expect(third.statusCode).toBe(429);
    });
  });

  describe('thread listing', () => {
    it('embeds the first replies oldest first, counts only live ones, and pages the rest', async () => {
      const total = POST_COMMENT_REPLIES_PREVIEW + POST_COMMENT_REPLIES_PAGE_SIZE + 2;
      await seed(400, 'other', { body: 'thread' });
      await prisma.postComment.createMany({
        data: Array.from({ length: total }, (_, i) => ({
          id: cid(401 + i),
          postId: posts.other!,
          userId: USERS.fanB,
          body: `r${i}`,
          createdAt: old,
          parentId: cid(400),
        })),
      });
      await seed(499, 'other', {
        parentId: cid(400),
        deletedAt: new Date(),
        body: 'rahasia-balasan',
      });
      const res = await list(posts.other!);
      expect(res.body).not.toContain('rahasia-balasan');
      const top = parseList(res).items.find((c) => c.id === cid(400))!;
      expect(top.replyCount).toBe(total);
      expect(top.replies!.map((r) => r.body)).toEqual(
        Array.from({ length: POST_COMMENT_REPLIES_PREVIEW }, (_, i) => `r${i}`),
      );
      const first = parseReplies(
        await replies(posts.other!, cid(400), undefined, `?cursor=${top.replies!.at(-1)!.id}`),
      );
      expect(first.items).toHaveLength(POST_COMMENT_REPLIES_PAGE_SIZE);
      expect(first.items[0]!.body).toBe(`r${POST_COMMENT_REPLIES_PREVIEW}`);
      expect(first.canComment).toBe(false);
      const second = parseReplies(
        await replies(posts.other!, cid(400), undefined, `?cursor=${first.nextCursor}`),
      );
      expect(second.items.map((r) => r.body)).toEqual([`r${total - 2}`, `r${total - 1}`]);
      expect(second.nextCursor).toBeNull();
    });

    it('replies endpoint: 404 for a reply id, an unknown id and another post', async () => {
      expect((await replies(posts.other!, cid(401))).statusCode).toBe(404);
      expect((await replies(posts.other!, '0190a000-0000-7000-8000-0000002a9999')).statusCode).toBe(
        404,
      );
      expect((await replies(posts.order!, cid(400))).statusCode).toBe(404);
    });
  });

  describe('deleted parents', () => {
    it('keeps a deleted parent with a live reply as a placeholder, omits one without', async () => {
      const gone = (id: number, withReply: boolean, replyDeleted = false) =>
        seed(id, 'order', { body: `HAPUS-${id}`, deletedAt: new Date() }).then(() =>
          withReply
            ? seed(id + 1, 'order', {
                parentId: cid(id),
                body: `balasan-${id}`,
                deletedAt: replyDeleted ? new Date() : undefined,
              })
            : null,
        );
      await gone(500, true);
      await gone(510, false);
      await gone(520, true, true);
      const res = await list(posts.order!, 'fanA');
      expect(res.body).not.toMatch(/HAPUS-/);
      const items = parseList(res).items;
      expect(items.find((c) => c.id === cid(510))).toBeUndefined();
      expect(items.find((c) => c.id === cid(520))).toBeUndefined();
      const placeholder = items.find((c) => c.id === cid(500))!;
      expect(placeholder).toMatchObject({
        deleted: true,
        body: '',
        author: { displayName: '' },
        canDelete: false,
        canEdit: false,
        canPin: false,
        replyCount: 1,
      });
      expect(placeholder.replies!.map((r) => r.body)).toEqual(['balasan-500']);
      // Replies of a placeholder stay reachable.
      expect(parseReplies(await replies(posts.order!, cid(500), 'fanA')).items).toHaveLength(1);
    });

    it('deleting a parent through the API leaves its replies visible', async () => {
      const parent = postCommentSchema.parse(
        (await post(posts.threads!, 'fanA', { body: 'akan dihapus' })).json(),
      );
      await post(posts.threads!, 'fanB', { body: 'tetap ada', parentId: parent.id });
      expect((await remove(posts.threads!, parent.id, 'fanA')).statusCode).toBe(204);
      const res = await list(posts.threads!);
      expect(res.body).not.toContain('akan dihapus');
      const item = parseList(res).items.find((c) => c.id === parent.id)!;
      expect(item.deleted).toBe(true);
      expect(item.replies![0]!.body).toBe('tetap ada');
    });
  });

  describe('flags and access', () => {
    it('canPin only for the post owner on live top-level comments; canEdit/canDelete follow the author', async () => {
      const parent = postCommentSchema.parse(
        (await post(posts.limits!, 'fanB', { body: 'flag' })).json(),
      );
      await post(posts.limits!, 'fanA', { body: 'balasan flag', parentId: parent.id });
      const find = async (user?: UserName) =>
        parseList(await list(posts.limits!, user)).items.find((c) => c.id === parent.id)!;
      const asOwner = await find('creator');
      expect(asOwner).toMatchObject({ canPin: true, canEdit: false, canDelete: true });
      expect(asOwner.replies![0]).toMatchObject({ canPin: false, canEdit: false, canDelete: true });
      const asReplyAuthor = await find('fanA');
      expect(asReplyAuthor.replies![0]).toMatchObject({
        canEdit: true,
        canDelete: true,
        canPin: false,
      });
      expect(asReplyAuthor).toMatchObject({ canEdit: false, canDelete: false, canPin: false });
      const anon = await find();
      expect([anon.canPin, anon.canEdit, anon.canDelete]).toEqual([false, false, false]);
    });

    it('a guest reads free comments but cannot reply (401)', async () => {
      expect((await list(posts.threads!)).statusCode).toBe(200);
      const res = await post(posts.threads!, undefined, { body: 'x', parentId: cid(400) });
      expect(res.statusCode).toBe(401);
    });

    it('a locked premium post hides comments and replies from non-owners, not from the owner', async () => {
      await seed(600, 'premium', { userId: USERS.creator, body: 'rahasia-premium' });
      await seed(601, 'premium', {
        userId: USERS.creator,
        parentId: cid(600),
        body: 'rahasia-balasan',
      });
      for (const user of [undefined, 'fanA'] as const) {
        const read = await list(posts.premium!, user);
        expect(read.statusCode).toBe(403);
        expect(read.body).not.toContain('rahasia');
        expect((await replies(posts.premium!, cid(600), user)).statusCode).toBe(403);
      }
      expect(
        (await post(posts.premium!, 'fanA', { body: 'x', parentId: cid(600) })).statusCode,
      ).toBe(403);
      expect(parseList(await list(posts.premium!, 'creator')).items[0]!.replies).toHaveLength(1);
      expect(parseReplies(await replies(posts.premium!, cid(600), 'creator')).items).toHaveLength(
        1,
      );
      const ownerReply = await post(posts.premium!, 'creator', {
        body: 'dari owner',
        parentId: cid(600),
      });
      expect(ownerReply.statusCode).toBe(201);
    });
  });
});
