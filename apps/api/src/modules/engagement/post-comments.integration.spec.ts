import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  POST_COMMENT_MAX_LENGTH,
  POST_COMMENTS_PAGE_SIZE,
  postCommentListSchema,
  postCommentSchema,
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
// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000290001',
  fanA: '0190a000-0000-7000-8000-000000290002',
  fanB: '0190a000-0000-7000-8000-000000290003',
  fanC: '0190a000-0000-7000-8000-000000290004',
  fanD: '0190a000-0000-7000-8000-000000290005',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-comments-spec-${name}`;
const SLUG = 'post-comments-spec';
// Seeded comments get fixed ids so their order is known; they sort before every uuidv7 the DB generates now.
const seededId = (n: number) => `0190a000-0000-7000-8000-000000298${String(n).padStart(3, '0')}`;

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

describe('/posts/:id/comments', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;
  let readOpenApp: NestFastifyApplication;
  let writeOpenApp: NestFastifyApplication;
  let limitedApp: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Comments ${name}` })),
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
          slug: SLUG,
          status: 'APPROVED',
          ...profileFields('Comments'),
        },
      })
    ).id;
    const post = async (
      key: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED',
    ) => {
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
    };
    for (const key of ['free', 'other', 'paged', 'deletes', 'limits']) {
      await post(key, 'FREE', 'PUBLISHED');
    }
    await post('premium', 'PREMIUM', 'PUBLISHED');
    await post('draft', 'FREE', 'DRAFT');
    await post('archived', 'FREE', 'ARCHIVED');
    await post('removed', 'FREE', 'REMOVED');
    await prisma.postOffer.create({
      data: { postId: posts.premium!, version: 1, priceCoins: 10n },
    });
    // Old enough not to count toward anyone's rate limit.
    const createdAt = new Date(Date.now() - 3_600_000);
    await prisma.postComment.createMany({
      data: Array.from({ length: POST_COMMENTS_PAGE_SIZE + 1 }, (_, i) => ({
        id: seededId(i + 1),
        postId: posts.paged!,
        userId: USERS.fanB,
        body: `komentar ${i + 1}`,
        createdAt,
      })),
    });
    await prisma.postComment.create({
      data: {
        id: seededId(900),
        postId: posts.archived!,
        userId: USERS.fanA,
        body: 'sebelum diarsipkan',
        createdAt,
      },
    });

    [app, readOpenApp, writeOpenApp, limitedApp] = await Promise.all([
      boot({}),
      boot({ PREMIUM_COMMENTS_READ_WITHOUT_ACCESS: true }),
      boot({ PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: true }),
      boot({ COMMENT_RATE_LIMIT_PER_MINUTE: 3 }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([app, readOpenApp, writeOpenApp, limitedApp].map((a) => a.close()));
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.commentModerationAction.deleteMany({ where: { post: where } });
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
  const list = (postId: string, user?: UserName, { target = app, query = '' } = {}) =>
    target.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/comments${query}`,
      cookies: cookies(user),
    });
  const create = (
    postId: string,
    user: UserName | undefined,
    body: unknown,
    { target = app, origin = WEB_ORIGIN } = {},
  ) =>
    target.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      cookies: cookies(user),
      headers: { origin },
      payload: body as object,
    });
  const remove = (postId: string, commentId: string, user: UserName, target = app) =>
    target.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${postId}/comments/${commentId}`,
      cookies: cookies(user),
      headers: { origin: WEB_ORIGIN },
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const parseList = (res: { statusCode: number; json: () => unknown }) => {
    expect(res.statusCode).toBe(200);
    return postCommentListSchema.parse(res.json());
  };
  const createId = async (postId: string, user: UserName, text: string) => {
    const res = await create(postId, user, { body: text });
    expect(res.statusCode).toBe(201);
    return postCommentSchema.parse(res.json()).id;
  };

  describe('create', () => {
    it('creates a trimmed plain-text comment on a published free post', async () => {
      const res = await create(posts.free!, 'fanA', { body: '  halo kak  ' });
      expect(res.statusCode).toBe(201);
      expect(res.headers['cache-control']).toBe('no-store');
      const comment = postCommentSchema.parse(res.json());
      expect(comment).toMatchObject({
        body: 'halo kak',
        author: { displayName: 'Comments fanA' },
        canDelete: true,
        canEdit: true,
        canPin: false,
      });
    });

    it('stores markup verbatim (escaping is the renderer’s job)', async () => {
      const text = '<script>alert(1)</script>';
      const res = await create(posts.free!, 'fanB', { body: text });
      expect(postCommentSchema.parse(res.json()).body).toBe(text);
    });

    it('rejects empty and over-long bodies', async () => {
      for (const body of [' \n ', 'a'.repeat(POST_COMMENT_MAX_LENGTH + 1)]) {
        const res = await create(posts.free!, 'fanA', { body });
        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe('VALIDATION_FAILED');
      }
    });

    it('requires a session and a same-origin request', async () => {
      const anonymous = await create(posts.free!, undefined, { body: 'hai' });
      expect(anonymous.statusCode).toBe(401);
      expect(errorCode(anonymous)).toBe('AUTH_REQUIRED');
      const csrf = await create(
        posts.free!,
        'fanA',
        { body: 'hai' },
        { origin: 'https://evil.example' },
      );
      expect(csrf.statusCode).toBe(403);
    });
  });

  describe('list', () => {
    it('anonymous visitors read free comments, in Top order (newest first at 0 likes), without user ids', async () => {
      const res = await list(posts.free!);
      expect(res.headers['cache-control']).toBe('no-store');
      const page = parseList(res);
      expect(page.canComment).toBe(false);
      expect(page.items.map((c) => c.body)).toEqual(['<script>alert(1)</script>', 'halo kak']);
      expect(page.items.every((c) => !c.canDelete && !c.canEdit && !c.canPin)).toBe(true);
      for (const id of userIds) expect(res.body).not.toContain(id);
    });

    it('canDelete is the author or the post owner; canComment for logged-in viewers', async () => {
      const asFanA = parseList(await list(posts.free!, 'fanA'));
      expect(asFanA.canComment).toBe(true);
      expect(asFanA.items.map((c) => c.canDelete)).toEqual([false, true]);
      expect(parseList(await list(posts.free!, 'creator')).items.map((c) => c.canDelete)).toEqual([
        true,
        true,
      ]);
    });

    it('canEdit is the author only; canPin is the post owner only', async () => {
      const asFanA = parseList(await list(posts.free!, 'fanA'));
      expect(asFanA.items.map((c) => c.canEdit)).toEqual([false, true]);
      expect(asFanA.items.some((c) => c.canPin)).toBe(false);
      const asOwner = parseList(await list(posts.free!, 'creator'));
      expect(asOwner.items.map((c) => c.canPin)).toEqual([true, true]);
      expect(asOwner.items.some((c) => c.canEdit)).toBe(false);
    });

    it(`pages by ${POST_COMMENTS_PAGE_SIZE} with a cursor`, async () => {
      const first = parseList(await list(posts.paged!));
      expect(first.items).toHaveLength(POST_COMMENTS_PAGE_SIZE);
      expect(first.items[0]!.body).toBe(`komentar ${POST_COMMENTS_PAGE_SIZE + 1}`);
      expect(first.nextCursor).toBe(`0_${seededId(2)}`);
      const second = parseList(
        await list(posts.paged!, undefined, { query: `?cursor=${first.nextCursor}` }),
      );
      expect(second.items.map((c) => c.body)).toEqual(['komentar 1']);
      expect(second.nextCursor).toBeNull();
    });

    it('rejects malformed ids and cursors, 404s unknown posts', async () => {
      expect((await list('not-a-uuid')).statusCode).toBe(400);
      expect((await list(posts.free!, undefined, { query: '?cursor=nope' })).statusCode).toBe(400);
      const unknown = await list('0190a000-0000-7000-8000-000000299999');
      expect(unknown.statusCode).toBe(404);
      expect(errorCode(unknown)).toBe('NOT_FOUND');
    });
  });

  describe('post status', () => {
    it.each(['draft', 'archived', 'removed'])(
      'a %s post is hidden from other users (404) for read and write',
      async (key) => {
        for (const res of [
          await list(posts[key]!, 'fanB'),
          await create(posts[key]!, 'fanB', { body: 'x' }),
        ]) {
          expect(res.statusCode).toBe(404);
          expect(errorCode(res)).toBe('NOT_FOUND');
        }
      },
    );

    it('the owner of an archived post sees no comments and cannot add one, but can delete', async () => {
      for (const res of [
        await list(posts.archived!, 'creator'),
        await create(posts.archived!, 'creator', { body: 'x' }),
      ]) {
        expect(res.statusCode).toBe(404);
        expect(errorCode(res)).toBe('POST_NOT_AVAILABLE');
      }
      expect((await remove(posts.archived!, seededId(900), 'creator')).statusCode).toBe(204);
    });
  });

  describe('premium policy', () => {
    it('default: viewers without access can neither read nor write', async () => {
      for (const res of [
        await list(posts.premium!, 'fanA'),
        await create(posts.premium!, 'fanA', { body: 'x' }),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('FORBIDDEN');
      }
      expect(await prisma.postComment.count({ where: { postId: posts.premium! } })).toBe(0);
    });

    it('the owner reads and writes on their own premium post', async () => {
      expect((await create(posts.premium!, 'creator', { body: 'terima kasih' })).statusCode).toBe(
        201,
      );
      expect(parseList(await list(posts.premium!, 'creator')).canComment).toBe(true);
    });

    it('READ flag: read allowed, write still refused', async () => {
      const page = parseList(await list(posts.premium!, 'fanA', { target: readOpenApp }));
      expect(page.canComment).toBe(false);
      expect(page.items.map((c) => c.body)).toEqual(['terima kasih']);
      const write = await create(posts.premium!, 'fanA', { body: 'x' }, { target: readOpenApp });
      expect(write.statusCode).toBe(403);
    });

    it('WRITE flag: write allowed', async () => {
      const res = await create(posts.premium!, 'fanA', { body: 'boleh' }, { target: writeOpenApp });
      expect(res.statusCode).toBe(201);
    });
  });

  describe('delete', () => {
    it('the author deletes; the comment disappears for everyone, the row is soft-deleted', async () => {
      const id = await createId(posts.deletes!, 'fanA', 'hapus saya');
      expect((await remove(posts.deletes!, id, 'fanA')).statusCode).toBe(204);
      for (const user of [undefined, 'fanA', 'creator'] as const) {
        expect(parseList(await list(posts.deletes!, user)).items.map((c) => c.id)).not.toContain(
          id,
        );
      }
      const row = await prisma.postComment.findUniqueOrThrow({ where: { id } });
      expect(row.deletedAt).toBeInstanceOf(Date);
      expect(row.deletedByUserId).toBe(USERS.fanA);
      const again = await remove(posts.deletes!, id, 'fanA');
      expect(again.statusCode).toBe(404);
      expect(errorCode(again)).toBe('NOT_FOUND');
    });

    it('the post owner deletes anyone’s comment; other users cannot', async () => {
      const id = await createId(posts.deletes!, 'fanB', 'komentar fanB');
      const denied = await remove(posts.deletes!, id, 'fanA');
      expect(denied.statusCode).toBe(403);
      expect(errorCode(denied)).toBe('FORBIDDEN');
      expect((await remove(posts.deletes!, id, 'creator')).statusCode).toBe(204);
      expect((await prisma.postComment.findUniqueOrThrow({ where: { id } })).deletedByUserId).toBe(
        USERS.creator,
      );
    });

    it('a comment id from another post is not found', async () => {
      const id = await createId(posts.other!, 'fanA', 'di post lain');
      expect((await remove(posts.deletes!, id, 'fanA')).statusCode).toBe(404);
      expect((await prisma.postComment.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    });

    it('simultaneous deletes soft-delete once without errors', async () => {
      const id = await createId(posts.deletes!, 'fanA', 'dua kali');
      const results = await Promise.all([
        remove(posts.deletes!, id, 'fanA'),
        remove(posts.deletes!, id, 'fanA'),
      ]);
      expect(results.every((r) => r.statusCode === 204 || r.statusCode === 404)).toBe(true);
      expect(results.some((r) => r.statusCode === 204)).toBe(true);
      expect(
        (await prisma.postComment.findUniqueOrThrow({ where: { id } })).deletedAt,
      ).toBeInstanceOf(Date);
    });
  });

  it('rate-limits per user per minute; deleting does not free a slot', async () => {
    const opts = { target: limitedApp };
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) {
      const res = await create(posts.limits!, 'fanC', { body: `spam ${i}` }, opts);
      expect(res.statusCode).toBe(201);
      ids.push(postCommentSchema.parse(res.json()).id);
    }
    const limited = await create(posts.limits!, 'fanC', { body: 'spam 3' }, opts);
    expect(limited.statusCode).toBe(429);
    expect(errorCode(limited)).toBe('RATE_LIMITED');
    expect((await remove(posts.limits!, ids[0]!, 'fanC', limitedApp)).statusCode).toBe(204);
    expect((await create(posts.limits!, 'fanC', { body: 'spam 4' }, opts)).statusCode).toBe(429);
    expect((await create(posts.limits!, 'fanD', { body: 'bukan spam' }, opts)).statusCode).toBe(
      201,
    );
  });

  it('the DB CHECK rejects empty and over-long bodies', async () => {
    for (const body of ['', 'a'.repeat(POST_COMMENT_MAX_LENGTH + 1)]) {
      await expect(
        prisma.$executeRaw`INSERT INTO post_comments (post_id, user_id, body) VALUES (${posts.free!}::uuid, ${USERS.fanA}::uuid, ${body})`,
      ).rejects.toThrow(/post_comments_body_length/);
    }
  });
});
