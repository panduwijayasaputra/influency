import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
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
  creator: '0190a000-0000-7000-8000-0000002e0001',
  author: '0190a000-0000-7000-8000-0000002e0002',
  other: '0190a000-0000-7000-8000-0000002e0003',
  admin: '0190a000-0000-7000-8000-0000002e0004',
  creatorAdmin: '0190a000-0000-7000-8000-0000002e0005',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `comment-moderation-spec-${name}`;
const cid = (n: number) => `0190a000-0000-7000-8000-0000002e8${String(n).padStart(3, '0')}`;
const UNKNOWN = '0190a000-0000-7000-8000-0000002e9999';

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

describe('moderation deletes (US-021)', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Mod ${name}` })),
    });
    await prisma.userRole.createMany({
      data: [USERS.admin, USERS.creatorAdmin].map((userId) => ({ userId, role: 'ADMIN' as const })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    const profile = async (userId: string, slug: string) =>
      (
        await prisma.creatorProfile.create({
          data: { userId, slug, status: 'APPROVED', ...profileFields(slug) },
        })
      ).id;
    const creatorProfileId = await profile(USERS.creator, 'comment-moderation-spec');
    const adminProfileId = await profile(USERS.creatorAdmin, 'comment-moderation-spec-admin');
    for (const [key, owner, status] of [
      ['free', creatorProfileId, 'PUBLISHED'],
      ['race', creatorProfileId, 'PUBLISHED'],
      ['adminOwn', adminProfileId, 'PUBLISHED'],
      ['archived', creatorProfileId, 'ARCHIVED'],
      ['draft', creatorProfileId, 'DRAFT'],
      ['removed', creatorProfileId, 'REMOVED'],
    ] as const) {
      posts[key] = (
        await prisma.post.create({
          data: {
            creatorProfileId: owner,
            visibility: 'FREE',
            status,
            publishedAt: status === 'DRAFT' ? null : new Date(),
          },
        })
      ).id;
    }
    app = await boot({});
  });

  afterAll(async () => {
    await app.close();
    const where = { creatorProfile: { userId: { in: userIds } } };
    await prisma.commentModerationAction.deleteMany({ where: { post: where } });
    await prisma.postComment.deleteMany({ where: { post: where, parentId: { not: null } } });
    await prisma.postComment.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (user?: UserName): Record<string, string> =>
    user ? { [SESSION_COOKIE]: token(user) } : {};
  const remove = (
    postId: string,
    commentId: string,
    user: UserName | undefined,
    {
      origin = WEB_ORIGIN,
      headers = {},
      query = '',
    }: { origin?: string; headers?: Record<string, string>; query?: string } = {},
  ) =>
    app.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${postId}/comments/${commentId}${query}`,
      cookies: cookies(user),
      headers: { origin, ...headers },
    });
  const patch = (postId: string, commentId: string, user: UserName, body: string) =>
    app.inject({
      method: 'PATCH',
      url: `/api/v1/posts/${postId}/comments/${commentId}`,
      cookies: cookies(user),
      headers: { origin: WEB_ORIGIN },
      payload: { body },
    });
  const list = (postId: string, user?: UserName) =>
    app.inject({ method: 'GET', url: `/api/v1/posts/${postId}/comments`, cookies: cookies(user) });
  const repliesOf = (postId: string, commentId: string, user?: UserName) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/comments/${commentId}/replies`,
      cookies: cookies(user),
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const seed = (
    id: number,
    postKey: string,
    extra: { userId?: string; body?: string; parentId?: string; pinnedAt?: Date } = {},
  ) =>
    prisma.postComment.create({
      data: {
        id: cid(id),
        postId: posts[postKey]!,
        userId: extra.userId ?? USERS.author,
        body: extra.body ?? `isi ${id}`,
        createdAt: new Date(Date.now() - 3_600_000),
        parentId: extra.parentId,
        pinnedAt: extra.pinnedAt,
      },
    });
  const audits = (id: number) =>
    prisma.commentModerationAction.findMany({ where: { commentId: cid(id) } });
  const isDeleted = async (id: number) =>
    (await prisma.postComment.findUniqueOrThrow({ where: { id: cid(id) } })).deletedAt !== null;

  describe('admin delete', () => {
    it('deletes any comment on a post the admin does not own, keeps the placeholder rules, audits it', async () => {
      await seed(1, 'free', { body: 'RAHASIA-ADMIN' });
      await seed(2, 'free', { userId: USERS.other, parentId: cid(1), body: 'balasan hidup' });
      const res = await remove(posts.free!, cid(1), 'admin');
      expect(res.statusCode).toBe(204);
      const listed = await list(posts.free!);
      expect(listed.body).not.toContain('RAHASIA-ADMIN');
      const item = postCommentListSchema.parse(listed.json()).items.find((c) => c.id === cid(1))!;
      expect(item).toMatchObject({
        deleted: true,
        body: '',
        author: { displayName: '' },
        replyCount: 1,
      });
      const row = await prisma.postComment.findUniqueOrThrow({ where: { id: cid(1) } });
      expect(row.deletedByUserId).toBe(USERS.admin);
      expect(await audits(1)).toMatchObject([
        { actorId: USERS.admin, actorRole: 'ADMIN', postId: posts.free },
      ]);
    });

    it('deletes a reply, and comments on ARCHIVED, DRAFT and REMOVED posts', async () => {
      await seed(10, 'free', { userId: USERS.other });
      await seed(11, 'free', { parentId: cid(10) });
      expect((await remove(posts.free!, cid(11), 'admin')).statusCode).toBe(204);
      expect(
        postReplyListSchema.parse((await repliesOf(posts.free!, cid(10))).json()).items,
      ).toEqual([]);
      for (const [n, key] of [
        [12, 'archived'],
        [13, 'draft'],
        [14, 'removed'],
      ] as const) {
        await seed(n, key);
        expect((await remove(posts[key]!, cid(n), 'admin')).statusCode).toBe(204);
        expect(await isDeleted(n)).toBe(true);
        expect(await audits(n)).toMatchObject([{ actorRole: 'ADMIN', postId: posts[key] }]);
      }
    });

    it('clears the pin of a pinned comment (existing behaviour kept)', async () => {
      await seed(15, 'free', { pinnedAt: new Date() });
      expect((await remove(posts.free!, cid(15), 'admin')).statusCode).toBe(204);
      expect(
        (await prisma.postComment.findUniqueOrThrow({ where: { id: cid(15) } })).pinnedAt,
      ).toBeNull();
    });
  });

  describe('creator delete', () => {
    it("the post's creator deletes a fan's comment: audited as CREATOR", async () => {
      await seed(20, 'free');
      expect((await remove(posts.free!, cid(20), 'creator')).statusCode).toBe(204);
      expect(await audits(20)).toMatchObject([{ actorId: USERS.creator, actorRole: 'CREATOR' }]);
    });

    it('a user who is both the post creator and an admin is recorded as ADMIN', async () => {
      await seed(21, 'adminOwn');
      expect((await remove(posts.adminOwn!, cid(21), 'creatorAdmin')).statusCode).toBe(204);
      expect(await audits(21)).toMatchObject([{ actorRole: 'ADMIN' }]);
    });
  });

  describe('no audit for a self-delete', () => {
    it('the author, an admin and the creator deleting their own comments write nothing', async () => {
      await seed(30, 'free', { userId: USERS.author });
      await seed(31, 'free', { userId: USERS.admin });
      await seed(32, 'free', { userId: USERS.creator });
      for (const [n, user] of [
        [30, 'author'],
        [31, 'admin'],
        [32, 'creator'],
      ] as const) {
        expect((await remove(posts.free!, cid(n), user)).statusCode).toBe(204);
        expect(await isDeleted(n)).toBe(true);
        expect(await audits(n)).toEqual([]);
      }
    });
  });

  describe('who may not', () => {
    it('another user gets 403 and nothing is deleted or audited', async () => {
      await seed(40, 'free');
      const res = await remove(posts.free!, cid(40), 'other');
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('FORBIDDEN');
      expect(await isDeleted(40)).toBe(false);
      expect(await audits(40)).toEqual([]);
    });

    it('claiming to be an admin in the request changes nothing', async () => {
      const res = await remove(posts.free!, cid(40), 'other', {
        query: '?role=ADMIN&admin=true',
        headers: { 'x-admin': '1', 'x-role': 'ADMIN' },
      });
      expect(res.statusCode).toBe(403);
      expect(await isDeleted(40)).toBe(false);
    });

    it('a guest gets 401 and a cross-origin request 403', async () => {
      const guest = await remove(posts.free!, cid(40), undefined);
      expect(guest.statusCode).toBe(401);
      const csrf = await remove(posts.free!, cid(40), 'admin', { origin: 'https://evil.example' });
      expect(csrf.statusCode).toBe(403);
      expect(await isDeleted(40)).toBe(false);
      expect(await audits(40)).toEqual([]);
    });

    it('deleted, unknown and other-post comments are 404 with no audit; a repeat admin delete adds no row', async () => {
      await seed(41, 'free');
      expect((await remove(posts.free!, cid(41), 'admin')).statusCode).toBe(204);
      expect((await remove(posts.free!, cid(41), 'admin')).statusCode).toBe(404);
      expect(await audits(41)).toHaveLength(1);
      expect((await remove(posts.free!, UNKNOWN, 'admin')).statusCode).toBe(404);
      await seed(42, 'adminOwn');
      expect((await remove(posts.free!, cid(42), 'admin')).statusCode).toBe(404);
      expect(await isDeleted(42)).toBe(false);
      expect(await audits(42)).toEqual([]);
    });
  });

  describe('concurrency and the audit table', () => {
    it('admin and creator deleting together leave one audit row; a second row for the comment is rejected', async () => {
      for (let i = 0; i < 5; i++) {
        const id = 50 + i;
        await seed(id, 'race');
        const [a, b] = await Promise.all([
          remove(posts.race!, cid(id), 'admin'),
          remove(posts.race!, cid(id), 'creator'),
        ]);
        expect([a.statusCode, b.statusCode].sort()).toEqual(expect.arrayContaining([204]));
        expect([204, 404]).toContain(a.statusCode);
        expect([204, 404]).toContain(b.statusCode);
        expect(await isDeleted(id)).toBe(true);
        expect(await audits(id)).toHaveLength(1);
      }
      await expect(
        prisma.commentModerationAction.create({
          data: {
            commentId: cid(50),
            postId: posts.race!,
            actorId: USERS.admin,
            actorRole: 'ADMIN',
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('flags and edit rights', () => {
    it('canDelete is true for the admin, the creator and the author; never canEdit/canPin for moderators', async () => {
      await seed(60, 'free', { userId: USERS.other });
      await seed(61, 'free', { userId: USERS.author, parentId: cid(60) });
      const find = async (user?: UserName) => {
        const page = postCommentListSchema.parse((await list(posts.free!, user)).json());
        return page.items.find((c) => c.id === cid(60))!;
      };
      const asAdmin = await find('admin');
      expect(asAdmin).toMatchObject({ canDelete: true, canEdit: false, canPin: false });
      expect(asAdmin.replies![0]).toMatchObject({ canDelete: true, canEdit: false, canPin: false });
      const replies = postReplyListSchema.parse(
        (await repliesOf(posts.free!, cid(60), 'admin')).json(),
      );
      expect(replies.items[0]).toMatchObject({ canDelete: true, canEdit: false });
      expect(await find('creator')).toMatchObject({
        canDelete: true,
        canEdit: false,
        canPin: true,
      });
      expect(await find('other')).toMatchObject({ canDelete: true, canEdit: true });
      for (const user of ['author', undefined] as const) {
        const item = await find(user);
        expect(item).toMatchObject({ canDelete: false, canEdit: false, canPin: false });
      }
    });

    it("an admin or creator still cannot edit anyone else's comment", async () => {
      await seed(62, 'free', { body: 'tidak boleh diubah' });
      for (const user of ['admin', 'creator'] as const) {
        const res = await patch(posts.free!, cid(62), user, 'diubah');
        expect(res.statusCode).toBe(403);
      }
      expect((await prisma.postComment.findUniqueOrThrow({ where: { id: cid(62) } })).body).toBe(
        'tidak boleh diubah',
      );
    });

    it('responses carry no user ids for an admin viewer', async () => {
      const res = await list(posts.free!, 'admin');
      for (const id of userIds) expect(res.body).not.toContain(id);
      expect(
        postCommentSchema.safeParse(postCommentListSchema.parse(res.json()).items[0]).success,
      ).toBe(true);
    });
  });
});
