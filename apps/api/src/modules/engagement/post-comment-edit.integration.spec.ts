import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  POST_COMMENT_MAX_LENGTH,
  postCommentListSchema,
  postReplyListSchema,
  postReplySchema,
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
  creator: '0190a000-0000-7000-8000-0000002c0001',
  author: '0190a000-0000-7000-8000-0000002c0002',
  other: '0190a000-0000-7000-8000-0000002c0003',
  admin: '0190a000-0000-7000-8000-0000002c0004',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `comment-edit-spec-${name}`;
const cid = (n: number) => `0190a000-0000-7000-8000-0000002c8${String(n).padStart(3, '0')}`;
const UNKNOWN = '0190a000-0000-7000-8000-0000002c9999';

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

describe('PATCH /posts/:id/comments/:commentId', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;
  let writeOpenApp: NestFastifyApplication;
  const old = new Date(Date.now() - 365 * 86_400_000);

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Edit ${name}` })),
    });
    await prisma.userRole.create({ data: { userId: USERS.admin, role: 'ADMIN' } });
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
          slug: 'comment-edit-spec',
          status: 'APPROVED',
          ...profileFields('Edit'),
        },
      })
    ).id;
    for (const [key, visibility, status] of [
      ['free', 'FREE', 'PUBLISHED'],
      ['other', 'FREE', 'PUBLISHED'],
      ['race', 'FREE', 'PUBLISHED'],
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
      data: { postId: posts.premium!, version: 1, priceCoins: 10n },
    });
    [app, writeOpenApp] = await Promise.all([
      boot({}),
      boot({ PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: true }),
    ]);
  });

  afterAll(async () => {
    await Promise.all([app, writeOpenApp].map((a) => a.close()));
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.commentModerationAction.deleteMany({ where: { post: where } });
    await prisma.postComment.deleteMany({ where: { post: where, parentId: { not: null } } });
    await prisma.postComment.deleteMany({ where: { post: where } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (user?: UserName): Record<string, string> =>
    user ? { [SESSION_COOKIE]: token(user) } : {};
  const edit = (
    postId: string,
    commentId: string,
    user: UserName | undefined,
    body: unknown,
    { target = app, origin = WEB_ORIGIN } = {},
  ) =>
    target.inject({
      method: 'PATCH',
      url: `/api/v1/posts/${postId}/comments/${commentId}`,
      cookies: cookies(user),
      headers: { origin },
      payload: body as object,
    });
  const remove = (postId: string, commentId: string, user: UserName) =>
    app.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${postId}/comments/${commentId}`,
      cookies: cookies(user),
      headers: { origin: WEB_ORIGIN },
    });
  const list = (postId: string, user?: UserName) =>
    app.inject({ method: 'GET', url: `/api/v1/posts/${postId}/comments`, cookies: cookies(user) });
  const repliesOf = (postId: string, commentId: string) =>
    app.inject({ method: 'GET', url: `/api/v1/posts/${postId}/comments/${commentId}/replies` });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const seed = (
    id: number,
    postKey: string,
    extra: {
      userId?: string;
      body?: string;
      parentId?: string;
      deletedAt?: Date;
      createdAt?: Date;
    } = {},
  ) =>
    prisma.postComment.create({
      data: {
        id: cid(id),
        postId: posts[postKey]!,
        userId: extra.userId ?? USERS.author,
        body: extra.body ?? `asli ${id}`,
        createdAt: extra.createdAt ?? new Date(Date.now() - 3_600_000),
        parentId: extra.parentId,
        deletedAt: extra.deletedAt,
        deletedByUserId: extra.deletedAt ? USERS.author : undefined,
      },
    });
  const bodyInDb = async (id: number) =>
    (await prisma.postComment.findUniqueOrThrow({ where: { id: cid(id) } })).body;

  describe('the author edits', () => {
    it('edits a top-level comment, with no time limit, and the list returns body + editedAt', async () => {
      await seed(1, 'free', { createdAt: old });
      const before = Date.now();
      const res = await edit(posts.free!, cid(1), 'author', { body: '  baru  ' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const saved = postReplySchema.parse(res.json());
      expect(saved).toMatchObject({ id: cid(1), body: 'baru', canEdit: true, canDelete: true });
      expect(new Date(saved.editedAt!).getTime()).toBeGreaterThanOrEqual(before - 1000);
      const item = postCommentListSchema
        .parse((await list(posts.free!)).json())
        .items.find((c) => c.id === cid(1))!;
      expect(item).toMatchObject({ body: 'baru', editedAt: saved.editedAt });
      expect(item.createdAt).toBe(old.toISOString());
    });

    it('edits a reply; the replies endpoint and the thread preview return editedAt', async () => {
      await seed(10, 'free', { userId: USERS.other });
      await seed(11, 'free', { parentId: cid(10) });
      expect(
        (await edit(posts.free!, cid(11), 'author', { body: 'balasan baru' })).statusCode,
      ).toBe(200);
      const page = postReplyListSchema.parse((await repliesOf(posts.free!, cid(10))).json());
      expect(page.items[0]).toMatchObject({ body: 'balasan baru' });
      expect(page.items[0]!.editedAt).not.toBeNull();
      const top = postCommentListSchema
        .parse((await list(posts.free!)).json())
        .items.find((c) => c.id === cid(10))!;
      expect(top.editedAt).toBeNull();
      expect(top.replies![0]!.editedAt).toBe(page.items[0]!.editedAt);
    });

    it('the same text (trimmed) is a no-op: 200, still never edited', async () => {
      await seed(20, 'free', { body: 'sama' });
      const res = await edit(posts.free!, cid(20), 'author', { body: ' sama ' });
      expect(res.statusCode).toBe(200);
      expect(postReplySchema.parse(res.json()).editedAt).toBeNull();
      expect(
        (await prisma.postComment.findUniqueOrThrow({ where: { id: cid(20) } })).editedAt,
      ).toBeNull();
    });

    it('a never-edited comment has editedAt null in the list', async () => {
      const item = postCommentListSchema
        .parse((await list(posts.free!)).json())
        .items.find((c) => c.id === cid(20))!;
      expect(item.editedAt).toBeNull();
    });
  });

  describe('who may not edit', () => {
    it('another user, the post creator and an admin get 403 and the text stays', async () => {
      await seed(30, 'free', { body: 'milik author' });
      for (const user of ['other', 'creator', 'admin'] as const) {
        const res = await edit(posts.free!, cid(30), user, { body: 'diubah' });
        expect(res.statusCode).toBe(403);
        expect(errorCode(res)).toBe('FORBIDDEN');
      }
      expect(await bodyInDb(30)).toBe('milik author');
    });

    it('a guest gets 401 and a cross-origin request 403', async () => {
      const guest = await edit(posts.free!, cid(30), undefined, { body: 'x' });
      expect(guest.statusCode).toBe(401);
      expect(errorCode(guest)).toBe('AUTH_REQUIRED');
      const csrf = await edit(
        posts.free!,
        cid(30),
        'author',
        { body: 'x' },
        { origin: 'https://evil.example' },
      );
      expect(csrf.statusCode).toBe(403);
      expect(await bodyInDb(30)).toBe('milik author');
    });
  });

  describe('missing, deleted and foreign comments', () => {
    it('a deleted comment is 404 and its text is never changed or returned', async () => {
      await seed(40, 'free', { body: 'RAHASIA-LAMA', deletedAt: new Date() });
      const res = await edit(posts.free!, cid(40), 'author', { body: 'hidup lagi' });
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('NOT_FOUND');
      expect(res.body).not.toContain('RAHASIA');
      expect(await bodyInDb(40)).toBe('RAHASIA-LAMA');
      expect((await list(posts.free!)).body).not.toContain('hidup lagi');
    });

    it('unknown id and a comment of another post are 404; malformed ids are 400', async () => {
      await seed(41, 'other');
      expect((await edit(posts.free!, UNKNOWN, 'author', { body: 'x' })).statusCode).toBe(404);
      expect((await edit(posts.free!, cid(41), 'author', { body: 'x' })).statusCode).toBe(404);
      expect(await bodyInDb(41)).toBe('asli 41');
      expect((await edit(posts.free!, 'nope', 'author', { body: 'x' })).statusCode).toBe(400);
      expect((await edit('nope', cid(41), 'author', { body: 'x' })).statusCode).toBe(400);
    });
  });

  describe('validation', () => {
    it('rejects empty, whitespace and over-long bodies; ignores parentId', async () => {
      await seed(50, 'free', { body: 'validasi' });
      for (const body of ['', '   ', 'a'.repeat(POST_COMMENT_MAX_LENGTH + 1)]) {
        const res = await edit(posts.free!, cid(50), 'author', { body });
        expect(res.statusCode).toBe(400);
        expect(errorCode(res)).toBe('VALIDATION_FAILED');
      }
      expect(
        (await edit(posts.free!, cid(50), 'author', { body: 'a'.repeat(POST_COMMENT_MAX_LENGTH) }))
          .statusCode,
      ).toBe(200);
      const res = await edit(posts.free!, cid(50), 'author', { body: 'ok', parentId: cid(10) });
      expect(res.statusCode).toBe(200);
      expect(
        (await prisma.postComment.findUniqueOrThrow({ where: { id: cid(50) } })).parentId,
      ).toBeNull();
    });
  });

  describe('post access and status', () => {
    it('on a locked premium post the author without access cannot edit; the owner can; the policy flag opens it', async () => {
      await seed(60, 'premium', { body: 'dulu punya akses' });
      await seed(61, 'premium', { userId: USERS.creator, body: 'dari owner' });
      const denied = await edit(posts.premium!, cid(60), 'author', { body: 'baru' });
      expect(denied.statusCode).toBe(403);
      expect(errorCode(denied)).toBe('FORBIDDEN');
      expect(await bodyInDb(60)).toBe('dulu punya akses');
      expect(
        (await edit(posts.premium!, cid(61), 'creator', { body: 'owner edit' })).statusCode,
      ).toBe(200);
      expect(
        (await edit(posts.premium!, cid(60), 'author', { body: 'baru' }, { target: writeOpenApp }))
          .statusCode,
      ).toBe(200);
    });

    it('archived and draft posts reject the edit: hidden (404) for the author, POST_NOT_AVAILABLE for the owner', async () => {
      await seed(70, 'archived');
      await seed(71, 'draft');
      await seed(72, 'archived', { userId: USERS.creator });
      expect((await edit(posts.archived!, cid(70), 'author', { body: 'x' })).statusCode).toBe(404);
      expect((await edit(posts.draft!, cid(71), 'author', { body: 'x' })).statusCode).toBe(404);
      const owner = await edit(posts.archived!, cid(72), 'creator', { body: 'x' });
      expect(owner.statusCode).toBe(404);
      expect(errorCode(owner)).toBe('POST_NOT_AVAILABLE');
      expect(await bodyInDb(70)).toBe('asli 70');
      expect(await bodyInDb(72)).toBe('asli 72');
    });
  });

  describe('racing a delete', () => {
    it('never changes or exposes the text of a deleted comment', async () => {
      for (let i = 0; i < 5; i++) {
        const id = 80 + i;
        await seed(id, 'race', { body: `PRIVAT-${id}` });
        const [patch, del] = await Promise.all([
          edit(posts.race!, cid(id), 'author', { body: `TERBARU-${id}` }),
          remove(posts.race!, cid(id), 'author'),
        ]);
        expect(del.statusCode).toBe(204);
        expect([200, 404]).toContain(patch.statusCode);
        const row = await prisma.postComment.findUniqueOrThrow({ where: { id: cid(id) } });
        expect(row.deletedAt).not.toBeNull();
        const listed = await list(posts.race!, 'author');
        expect(listed.body).not.toContain(`PRIVAT-${id}`);
        expect(listed.body).not.toContain(`TERBARU-${id}`);
      }
    });
  });
});
