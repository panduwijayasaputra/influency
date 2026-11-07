import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  commentPinResponseSchema,
  POST_COMMENTS_PAGE_SIZE,
  postCommentListSchema,
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

type ErrorBody = { error: { code: string; message: string } };
const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS and the other comment specs (29, 2a, 2b, 2c), so this spec owns its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-0000002d0001',
  fan: '0190a000-0000-7000-8000-0000002d0002',
  admin: '0190a000-0000-7000-8000-0000002d0003',
  other: '0190a000-0000-7000-8000-0000002d0004',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `comment-pin-spec-${name}`;
const cid = (n: number) => `0190a000-0000-7000-8000-0000002d8${String(n).padStart(3, '0')}`;
const UNKNOWN = '0190a000-0000-7000-8000-0000002d9999';

describe('pin comment', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts = {} as Record<
    'main' | 'second' | 'foreign' | 'archived' | 'draft' | 'paged',
    string
  >;
  let app: NestFastifyApplication;
  let foreignProfileId: string;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Pin ${name}` })),
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
          slug: 'comment-pin-spec',
          status: 'APPROVED',
          ...profileFields('Pin'),
        },
      })
    ).id;
    foreignProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.other,
          slug: 'comment-pin-spec-other',
          status: 'APPROVED',
          ...profileFields('PinOther'),
        },
      })
    ).id;
    for (const [key, profileId, status] of [
      ['main', creatorProfileId, 'PUBLISHED'],
      ['second', creatorProfileId, 'PUBLISHED'],
      ['foreign', foreignProfileId, 'PUBLISHED'],
      ['archived', creatorProfileId, 'ARCHIVED'],
      ['draft', creatorProfileId, 'DRAFT'],
      ['paged', creatorProfileId, 'PUBLISHED'],
    ] as const) {
      posts[key] = (
        await prisma.post.create({
          data: {
            creatorProfileId: profileId,
            visibility: 'FREE',
            status,
            publishedAt: status === 'DRAFT' ? null : new Date(),
          },
        })
      ).id;
    }
    const c = (id: string, postId: string, extra: object = {}) => ({
      id,
      postId,
      userId: USERS.fan,
      body: 'komentar',
      ...extra,
    });
    // cid(1..12) are top-level on main; 13 is a reply; 14 is deleted; 15 is on second; 16 on foreign.
    await prisma.postComment.createMany({
      data: [
        ...Array.from({ length: 12 }, (_, i) => c(cid(i + 1), posts.main)),
        c(cid(14), posts.main, { deletedAt: new Date(), deletedByUserId: USERS.fan }),
        c(cid(15), posts.second),
        c(cid(16), posts.foreign),
        c(cid(17), posts.archived),
        c(cid(18), posts.draft),
      ],
    });
    await prisma.postComment.create({ data: c(cid(13), posts.main, { parentId: cid(1) }) });
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .overrideProvider(ENV)
      .useValue({ ...parseEnv(process.env), COMMENT_RATE_LIMIT_PER_MINUTE: 1000 })
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
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

  const call = (
    method: 'PUT' | 'DELETE',
    postId: string,
    commentId: string,
    who?: UserName,
    origin: string | null = WEB_ORIGIN,
  ) =>
    app.inject({
      method,
      url: `/api/v1/posts/${postId}/comments/${commentId}/pin`,
      cookies: who ? { [SESSION_COOKIE]: token(who) } : {},
      headers: origin === null ? {} : { origin },
    });
  const pin = (commentId: string, who: UserName = 'creator', postId = posts.main) =>
    call('PUT', postId, commentId, who);
  const unpin = (commentId: string, who: UserName = 'creator', postId = posts.main) =>
    call('DELETE', postId, commentId, who);
  const pinnedRows = (postId = posts.main) =>
    prisma.postComment.findMany({
      where: { postId, pinnedAt: { not: null } },
      select: { id: true },
    });
  const pinnedAt = async (id: string) =>
    (await prisma.postComment.findUniqueOrThrow({ where: { id } })).pinnedAt;
  const clear = () =>
    prisma.postComment.updateMany({
      where: { postId: { in: [posts.main, posts.second] } },
      data: { pinnedAt: null },
    });

  it('pins and unpins idempotently', async () => {
    const first = await pin(cid(1));
    expect(first.statusCode).toBe(200);
    expect(first.headers['cache-control']).toBe('no-store');
    expect(commentPinResponseSchema.parse(first.json())).toEqual({ pinned: true });
    const stamp = await pinnedAt(cid(1));
    expect(stamp).not.toBeNull();
    expect((await pin(cid(1))).statusCode).toBe(200);
    expect(await pinnedAt(cid(1))).toEqual(stamp);
    expect(commentPinResponseSchema.parse((await unpin(cid(1))).json())).toEqual({
      pinned: false,
    });
    expect(await pinnedAt(cid(1))).toBeNull();
    expect((await unpin(cid(1))).statusCode).toBe(200);
  });

  it('pinning another comment replaces the old pin in one step', async () => {
    await pin(cid(1));
    await pin(cid(2));
    expect((await pinnedRows()).map((r) => r.id)).toEqual([cid(2)]);
    await clear();
  });

  it('pins on different posts are independent', async () => {
    await pin(cid(1));
    await pin(cid(15), 'creator', posts.second);
    expect(await pinnedRows(posts.main)).toHaveLength(1);
    expect(await pinnedRows(posts.second)).toHaveLength(1);
    await clear();
  });

  it('only the post creator may pin or unpin, and non-owners learn nothing', async () => {
    for (const who of ['fan', 'admin', 'other'] as const) {
      expect((await pin(cid(1), who)).statusCode).toBe(403);
      expect((await unpin(cid(1), who)).statusCode).toBe(403);
      const real = await pin(cid(1), who);
      const unknown = await pin(UNKNOWN, who);
      expect(unknown.statusCode).toBe(403);
      expect(real.json<ErrorBody>().error.code).toBe(unknown.json<ErrorBody>().error.code);
      expect(real.json<ErrorBody>().error.message).toBe(unknown.json<ErrorBody>().error.message);
    }
    // The creator of another post cannot pin on this one either, even with a comment of their own post.
    expect((await pin(cid(16), 'other', posts.main)).statusCode).toBe(403);
    expect(await pinnedRows()).toHaveLength(0);
  });

  it('needs a session and a same-origin request, and rejects malformed ids', async () => {
    expect((await call('PUT', posts.main, cid(1))).statusCode).toBe(401);
    expect((await call('DELETE', posts.main, cid(1))).statusCode).toBe(401);
    expect((await call('PUT', posts.main, cid(1), 'creator', null)).statusCode).toBe(403);
    expect((await pin('not-a-uuid')).statusCode).toBe(400);
    expect(await pinnedRows()).toHaveLength(0);
  });

  it('rejects a reply (422) and answers 404 for deleted, unknown and other-post comments', async () => {
    const reply = await pin(cid(13));
    expect(reply.statusCode).toBe(422);
    expect(reply.json<ErrorBody>().error.code).toBe('COMMENT_NOT_PINNABLE');
    expect((await pin(cid(14))).statusCode).toBe(404);
    expect((await pin(UNKNOWN)).statusCode).toBe(404);
    expect((await pin(cid(16))).statusCode).toBe(404); // belongs to posts.foreign
    expect((await unpin(cid(14))).statusCode).toBe(404);
    expect((await unpin(UNKNOWN)).statusCode).toBe(404);
    expect(await pinnedRows()).toHaveLength(0);
  });

  it('archived, draft and unknown posts', async () => {
    expect((await pin(cid(17), 'creator', posts.archived)).json<ErrorBody>().error.code).toBe(
      'POST_NOT_AVAILABLE',
    );
    expect((await pin(cid(18), 'creator', posts.draft)).json<ErrorBody>().error.code).toBe(
      'POST_NOT_AVAILABLE',
    );
    expect((await pin(cid(1), 'creator', UNKNOWN)).statusCode).toBe(404);
  });

  it('the database allows one pin per post and only top-level pins', async () => {
    await pin(cid(1));
    await expect(
      prisma.postComment.update({ where: { id: cid(2) }, data: { pinnedAt: new Date() } }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      prisma.postComment.update({ where: { id: cid(13) }, data: { pinnedAt: new Date() } }),
    ).rejects.toThrow();
    await clear();
  });

  it('deleting the pinned comment clears the pin', async () => {
    await pin(cid(3));
    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${posts.main}/comments/${cid(3)}`,
      cookies: { [SESSION_COOKIE]: token('fan') },
      headers: { origin: WEB_ORIGIN },
    });
    expect(res.statusCode).toBe(204);
    expect(await pinnedRows()).toHaveLength(0);
    expect((await pin(cid(3))).statusCode).toBe(404);
  });

  describe('list order', () => {
    const list = async (postId: string, who?: UserName, cursor?: string) =>
      postCommentListSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/posts/${postId}/comments${cursor ? `?cursor=${cursor}` : ''}`,
            cookies: who ? { [SESSION_COOKIE]: token(who) } : {},
          })
        ).json(),
      );

    it('puts the pinned comment first, once, with pinned: true', async () => {
      await prisma.postComment.update({ where: { id: cid(5) }, data: { likeCount: 9 } });
      await pin(cid(2));
      for (const who of [undefined, 'fan', 'creator'] as const) {
        const items = (await list(posts.main, who)).items;
        expect(items[0]).toMatchObject({ id: cid(2), pinned: true });
        expect(items.filter((c) => c.pinned)).toHaveLength(1);
        expect(items.filter((c) => c.id === cid(2))).toHaveLength(1);
        expect(items[1]!.id).toBe(cid(5)); // then Top order: most liked first
      }
      expect((await list(posts.main, 'creator')).items[0]!.canPin).toBe(true);
      expect((await list(posts.main, 'fan')).items[0]!.canPin).toBe(false);
      await unpin(cid(2));
      const back = (await list(posts.main)).items;
      expect(back.some((c) => c.pinned)).toBe(false);
      expect(back[0]!.id).toBe(cid(5));
      await prisma.postComment.update({ where: { id: cid(5) }, data: { likeCount: 0 } });
    });

    it('a deleted pinned comment disappears from the top', async () => {
      await prisma.postComment.create({
        data: { id: cid(40), postId: posts.main, userId: USERS.fan, body: 'akan dihapus' },
      });
      await pin(cid(40));
      await app.inject({
        method: 'DELETE',
        url: `/api/v1/posts/${posts.main}/comments/${cid(40)}`,
        cookies: { [SESSION_COOKIE]: token('fan') },
        headers: { origin: WEB_ORIGIN },
      });
      const items = (await list(posts.main)).items;
      expect(items.some((c) => c.pinned || c.id === cid(40))).toBe(false);
    });

    it('keeps pages at 50 with a pin, and walks every comment once', async () => {
      const total = 60;
      await prisma.postComment.createMany({
        data: Array.from({ length: total }, (_, i) => ({
          id: cid(100 + i),
          postId: posts.paged,
          userId: USERS.fan,
          body: `komentar ${i}`,
        })),
      });
      // The oldest id sorts last in Top order, so pinning it moves it to the top of page one.
      const target = cid(100);
      await pin(target, 'creator', posts.paged);
      const first = await list(posts.paged);
      expect(first.items).toHaveLength(POST_COMMENTS_PAGE_SIZE);
      expect(first.items[0]).toMatchObject({ id: target, pinned: true });
      expect(first.nextCursor).not.toBeNull();
      const second = await list(posts.paged, undefined, first.nextCursor!);
      expect(second.items).toHaveLength(total - POST_COMMENTS_PAGE_SIZE);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((c) => c.id);
      expect(new Set(ids).size).toBe(total);
      expect(second.items.some((c) => c.id === target)).toBe(false);
      await unpin(target, 'creator', posts.paged);
      const plain = await list(posts.paged);
      expect(plain.items).toHaveLength(POST_COMMENTS_PAGE_SIZE);
      expect(plain.items.some((c) => c.pinned)).toBe(false);
    });

    it('a pinned comment keeps its replies', async () => {
      await pin(cid(1));
      const top = (await list(posts.main)).items[0]!;
      expect(top).toMatchObject({ id: cid(1), pinned: true, replyCount: 1 });
      expect(top.replies?.map((r) => r.id)).toEqual([cid(13)]);
      await clear();
    });
  });

  describe('concurrency', () => {
    it('parallel pins of nine different comments leave exactly one', async () => {
      const res = await Promise.all(Array.from({ length: 9 }, (_, i) => pin(cid(i + 4))));
      expect(res.map((r) => r.statusCode)).toEqual(Array(9).fill(200));
      expect(await pinnedRows()).toHaveLength(1);
      await clear();
    });

    it('twenty parallel pins of the same comment leave one', async () => {
      const res = await Promise.all(Array.from({ length: 20 }, () => pin(cid(4))));
      expect(res.every((r) => r.statusCode === 200)).toBe(true);
      expect((await pinnedRows()).map((r) => r.id)).toEqual([cid(4)]);
      await clear();
    });

    it('a mixed pin/unpin run never leaves more than one pin', async () => {
      const calls = Array.from({ length: 12 }, (_, i) =>
        i % 3 === 0 ? unpin(cid(4 + (i % 4))) : pin(cid(4 + (i % 4))),
      );
      const res = await Promise.all(calls);
      expect(res.every((r) => r.statusCode === 200)).toBe(true);
      expect((await pinnedRows()).length).toBeLessThanOrEqual(1);
      await clear();
    });

    it('a pin racing the delete of the same comment never leaves a deleted pin', async () => {
      const id = cid(30);
      await prisma.postComment.create({
        data: { id, postId: posts.main, userId: USERS.fan, body: 'racing' },
      });
      const [res] = await Promise.all([
        pin(id),
        app.inject({
          method: 'DELETE',
          url: `/api/v1/posts/${posts.main}/comments/${id}`,
          cookies: { [SESSION_COOKIE]: token('fan') },
          headers: { origin: WEB_ORIGIN },
        }),
      ]);
      expect([200, 404]).toContain(res.statusCode);
      const row = await prisma.postComment.findUniqueOrThrow({ where: { id } });
      expect(row.deletedAt !== null && row.pinnedAt !== null).toBe(false);
      await clear();
    });
  });
});
