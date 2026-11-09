import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  errorResponseSchema,
  mediaAccessResponseSchema,
  POST_MEDIA_MAX_PER_POST,
  studioMediaListSchema,
} from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creatorA: '0190a000-0000-7000-8000-0000003a0001',
  creatorB: '0190a000-0000-7000-8000-0000003a0002',
  plain: '0190a000-0000-7000-8000-0000003a0003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `media-order-spec-${name}`;
const POSTS = {
  draft: '0190a000-0000-7000-8000-0000003a0101',
  race: '0190a000-0000-7000-8000-0000003a0102',
  ordered: '0190a000-0000-7000-8000-0000003a0103',
  backfill: '0190a000-0000-7000-8000-0000003a0104',
  gaps: '0190a000-0000-7000-8000-0000003a0105',
  published: '0190a000-0000-7000-8000-0000003a0106',
  reorder: '0190a000-0000-7000-8000-0000003a0107',
  raced: '0190a000-0000-7000-8000-0000003a0108',
  other: '0190a000-0000-7000-8000-0000003a0201',
} as const;
const MEDIA = (n: number) => `0190a000-0000-7000-8000-0000003a03${String(n).padStart(2, '0')}`;

describe('post media order and limit', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Order ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    const [profileA, profileB] = await Promise.all([
      prisma.creatorProfile.create({
        data: {
          userId: USERS.creatorA,
          slug: 'media-order-spec-a',
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('A'),
        },
      }),
      prisma.creatorProfile.create({
        data: {
          userId: USERS.creatorB,
          slug: 'media-order-spec-b',
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('B'),
        },
      }),
    ]);
    await prisma.post.createMany({
      data: [
        { id: POSTS.draft, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.race, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.ordered, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.backfill, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.gaps, creatorProfileId: profileA.id, visibility: 'FREE' },
        {
          id: POSTS.published,
          creatorProfileId: profileA.id,
          visibility: 'FREE',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
        { id: POSTS.reorder, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.raced, creatorProfileId: profileA.id, visibility: 'FREE' },
        { id: POSTS.other, creatorProfileId: profileB.id, visibility: 'FREE' },
      ],
    });

    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(memory.storage)
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
    await prisma.mediaAsset.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.mediaAsset.deleteMany({ where: { postId: { in: Object.values(POSTS) } } });
  });

  const base = (postId: string) => `/api/v1/creators/me/posts/${postId}/media`;
  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const slot = (name: UserName | undefined, postId: string) =>
    app.inject({
      method: 'POST',
      url: base(postId),
      headers: { origin: WEB_ORIGIN },
      cookies: cookies(name),
      payload: { contentType: 'image/png', byteSize: 11 },
    });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const positionsOf = async (postId: string) =>
    (await prisma.mediaAsset.findMany({ where: { postId }, orderBy: { createdAt: 'asc' } })).map(
      (m) => m.position,
    );

  /** READY images/videos created in this order, with the given positions (index = creation order). */
  async function seedReady(
    postId: string,
    rows: { kind?: 'IMAGE' | 'VIDEO'; position: number; durationSeconds?: number }[],
  ) {
    const start = Date.now() - 60_000;
    const ids: string[] = [];
    for (const [i, row] of rows.entries()) {
      const id = MEDIA(Number(postId.slice(-2)) * 10 + i);
      ids.push(id);
      await prisma.mediaAsset.create({
        data: {
          id,
          postId,
          kind: row.kind ?? 'IMAGE',
          status: 'READY',
          ...(row.kind === 'VIDEO'
            ? { videoUid: randomUUID(), durationSeconds: row.durationSeconds ?? 30 }
            : { objectKey: `post-media/${randomUUID()}` }),
          contentType: row.kind === 'VIDEO' ? 'video/mp4' : 'image/png',
          byteSize: 10,
          uploadExpiresAt: new Date(start + 3_600_000),
          position: row.position,
          createdAt: new Date(start + i * 1000),
        },
      });
    }
    return ids;
  }

  describe('limit', () => {
    it(`allows ${POST_MEDIA_MAX_PER_POST} items and refuses the next with MEDIA_LIMIT_REACHED`, async () => {
      expect(POST_MEDIA_MAX_PER_POST).toBe(5);
      for (let i = 0; i < POST_MEDIA_MAX_PER_POST; i++) {
        expect((await slot('creatorA', POSTS.draft)).statusCode).toBe(201);
      }
      const over = await slot('creatorA', POSTS.draft);
      expect(over.statusCode).toBe(409);
      expect(errorOf(over)).toMatchObject({ code: 'MEDIA_LIMIT_REACHED', details: { max: 5 } });
    });

    it('never lets concurrent uploads exceed it', async () => {
      const results = await Promise.all(
        Array.from({ length: POST_MEDIA_MAX_PER_POST + 3 }, () => slot('creatorA', POSTS.race)),
      );
      const created = results.filter((r) => r.statusCode === 201);
      expect(created).toHaveLength(POST_MEDIA_MAX_PER_POST);
      for (const rest of results.filter((r) => r.statusCode !== 201)) {
        expect(errorOf(rest).code).toBe('MEDIA_LIMIT_REACHED');
      }
      expect(await prisma.mediaAsset.count({ where: { postId: POSTS.race } })).toBe(5);
      // Every item got its own position, 0..4.
      expect([...(await positionsOf(POSTS.race))].sort()).toEqual([0, 1, 2, 3, 4]);
    });

    it('does not count a failed item toward the limit', async () => {
      for (let i = 0; i < POST_MEDIA_MAX_PER_POST; i++) await slot('creatorA', POSTS.draft);
      await prisma.mediaAsset.updateMany({
        where: { postId: POSTS.draft },
        data: { status: 'REJECTED' },
      });
      expect((await slot('creatorA', POSTS.draft)).statusCode).toBe(201);
    });
  });

  describe('position', () => {
    it('appends each new item after the last', async () => {
      for (let i = 0; i < 3; i++) await slot('creatorA', POSTS.draft);
      expect(await positionsOf(POSTS.draft)).toEqual([0, 1, 2]);
    });

    it('continues after the highest position, even with a gap left by a deleted item', async () => {
      await seedReady(POSTS.gaps, [{ position: 0 }, { position: 4 }]);
      await slot('creatorA', POSTS.gaps);
      expect(await positionsOf(POSTS.gaps)).toEqual([0, 4, 5]);
    });

    it('cannot be negative', async () => {
      await expect(
        prisma.mediaAsset.create({
          data: {
            postId: POSTS.draft,
            kind: 'IMAGE',
            objectKey: `post-media/${randomUUID()}`,
            contentType: 'image/png',
            byteSize: 1,
            uploadExpiresAt: new Date(),
            position: -1,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('migration backfill', () => {
    it('numbers existing media per post in created_at order', async () => {
      // Rows made before positions existed all sit at position 0; created in the order c1, c2, c3 (ids shuffled).
      const ids = await seedReady(POSTS.backfill, [
        { position: 0 },
        { position: 0 },
        { position: 0 },
      ]);
      await prisma.mediaAsset.update({ where: { id: ids[0]! }, data: { id: MEDIA(99) } });
      const sql = readFileSync(
        new URL(
          '../../../prisma/migrations/20261109054009_media_position/migration.sql',
          import.meta.url,
        ),
        'utf8',
      );
      const update = /UPDATE "media_assets"[\s\S]*?WHERE m\."id" = ranked\."id";/.exec(sql)?.[0];
      expect(update).toBeDefined();
      // The migration's own statement, limited to this spec's post so parallel specs are untouched.
      const scoped = update!.replace(
        'FROM "media_assets"\n',
        `FROM "media_assets" WHERE "post_id" = '${POSTS.backfill}'::uuid\n`,
      );
      expect(scoped).not.toBe(update);
      await prisma.$executeRawUnsafe(scoped);
      const rows = await prisma.mediaAsset.findMany({
        where: { postId: POSTS.backfill },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    });
  });

  describe('reads follow the creator order', () => {
    // Created c1 (image, pos 2), c2 (video, pos 0), c3 (image, pos 1): by position that is c2, c3, c1.
    it('studio list', async () => {
      const [c1, c2, c3] = await seedReady(POSTS.ordered, [
        { position: 2 },
        { kind: 'VIDEO', position: 0 },
        { position: 1 },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: base(POSTS.ordered),
        cookies: cookies('creatorA'),
      });
      expect(res.statusCode).toBe(200);
      expect(studioMediaListSchema.parse(res.json()).media.map((m) => m.id)).toEqual([c2, c3, c1]);
    });

    it('public post media (kinds and durations)', async () => {
      await seedReady(POSTS.published, [
        { position: 2 },
        { kind: 'VIDEO', position: 0, durationSeconds: 30 },
        { position: 1 },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/creators/media-order-spec-a/posts',
      });
      expect(res.statusCode).toBe(200);
      const post = res
        .json<{
          posts: { id: string; media: { kind: string; durationSeconds: number | null }[] }[];
        }>()
        .posts.find((p) => p.id === POSTS.published);
      expect(post?.media).toEqual([
        { kind: 'VIDEO', durationSeconds: 30 },
        { kind: 'IMAGE', durationSeconds: null },
        { kind: 'IMAGE', durationSeconds: null },
      ]);
    });

    it('media-access (the viewer)', async () => {
      const [c1, c2, c3] = await seedReady(POSTS.published, [
        { position: 2 },
        { position: 0 },
        { position: 1 },
      ]);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/posts/${POSTS.published}/media-access`,
      });
      expect(res.statusCode).toBe(200);
      expect(mediaAccessResponseSchema.parse(res.json()).media.map((m) => m.id)).toEqual([
        c2,
        c3,
        c1,
      ]);
    });
  });

  describe('PUT /creators/me/posts/:postId/media/order', () => {
    const order = (
      name: UserName | undefined,
      postId: string,
      payload: unknown,
      origin: string | undefined = WEB_ORIGIN,
    ) =>
      app.inject({
        method: 'PUT',
        url: `${base(postId)}/order`,
        headers: origin ? { origin } : {},
        cookies: cookies(name),
        payload: payload as object,
      });
    const listed = async (postId: string) =>
      studioMediaListSchema
        .parse(
          (
            await app.inject({
              method: 'GET',
              url: base(postId),
              cookies: cookies('creatorA'),
            })
          ).json(),
        )
        .media.map((m) => m.id);

    it('saves the order and answers with the list in that order', async () => {
      const [a, b, c] = await seedReady(POSTS.reorder, [
        { position: 0 },
        { position: 1 },
        { position: 2 },
      ]);
      const res = await order('creatorA', POSTS.reorder, { mediaIds: [c, a, b] });
      expect(res.statusCode).toBe(200);
      expect(studioMediaListSchema.parse(res.json()).media.map((m) => m.id)).toEqual([c, a, b]);
      expect(await listed(POSTS.reorder)).toEqual([c, a, b]);
      expect(await positionsOf(POSTS.reorder)).toEqual([1, 2, 0]);
    });

    it('is what the viewer sees once the post is live', async () => {
      const [a, b, c] = await seedReady(POSTS.reorder, [
        { position: 0 },
        { position: 1 },
        { position: 2 },
      ]);
      await order('creatorA', POSTS.reorder, { mediaIds: [b, c, a] });
      await prisma.post.update({
        where: { id: POSTS.reorder },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
      const access = await app.inject({
        method: 'GET',
        url: `/api/v1/posts/${POSTS.reorder}/media-access`,
      });
      expect(mediaAccessResponseSchema.parse(access.json()).media.map((m) => m.id)).toEqual([
        b,
        c,
        a,
      ]);
      await prisma.post.update({ where: { id: POSTS.reorder }, data: { status: 'DRAFT' } });
    });

    it('is idempotent: the same order twice changes nothing', async () => {
      const [a, b] = await seedReady(POSTS.reorder, [{ position: 0 }, { position: 1 }]);
      await order('creatorA', POSTS.reorder, { mediaIds: [b, a] });
      const again = await order('creatorA', POSTS.reorder, { mediaIds: [b, a] });
      expect(again.statusCode).toBe(200);
      expect(await listed(POSTS.reorder)).toEqual([b, a]);
    });

    it.each([
      ['a missing item', (ids: string[]) => ({ mediaIds: ids.slice(0, 2) })],
      ['a duplicated item', (ids: string[]) => ({ mediaIds: [ids[0], ids[0], ids[1], ids[2]] })],
      [
        'an unknown id',
        (ids: string[]) => ({ mediaIds: [...ids, '0190a000-0000-7000-8000-00000000dead'] }),
      ],
      ['an empty list', () => ({ mediaIds: [] })],
      ['a malformed id', (ids: string[]) => ({ mediaIds: [...ids, 'nope'] })],
      ['an extra key', (ids: string[]) => ({ mediaIds: ids, position: 3 })],
      ['no body field', () => ({})],
    ])('refuses %s with 400 and changes nothing', async (_label, body) => {
      const ids = await seedReady(POSTS.reorder, [
        { position: 0 },
        { position: 1 },
        { position: 2 },
      ]);
      const res = await order('creatorA', POSTS.reorder, body(ids));
      expect(res.statusCode).toBe(400);
      expect(errorOf(res).code).toBe('VALIDATION_FAILED');
      expect(await positionsOf(POSTS.reorder)).toEqual([0, 1, 2]);
    });

    it('refuses the media id of another post', async () => {
      const [a, b] = await seedReady(POSTS.reorder, [{ position: 0 }, { position: 1 }]);
      const [foreign] = await seedReady(POSTS.other, [{ position: 0 }]);
      const res = await order('creatorA', POSTS.reorder, { mediaIds: [a, b, foreign] });
      expect(res.statusCode).toBe(400);
      expect(await positionsOf(POSTS.other)).toEqual([0]);
    });

    it('lets an in-flight upload be left out: it follows the listed items', async () => {
      const [a, b] = await seedReady(POSTS.reorder, [{ position: 0 }, { position: 1 }]);
      const pending = await slot('creatorA', POSTS.reorder);
      expect(pending.statusCode).toBe(201);
      const res = await order('creatorA', POSTS.reorder, { mediaIds: [b, a] });
      expect(res.statusCode).toBe(200);
      const rows = await prisma.mediaAsset.findMany({
        where: { postId: POSTS.reorder },
        orderBy: { position: 'asc' },
      });
      expect(rows.map((r) => r.status)).toEqual(['READY', 'READY', 'PENDING_UPLOAD']);
      expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
      expect(rows.slice(0, 2).map((r) => r.id)).toEqual([b, a]);
    });

    it('404s on another creator post and never touches it', async () => {
      const [a, b] = await seedReady(POSTS.other, [{ position: 0 }, { position: 1 }]);
      const res = await order('creatorA', POSTS.other, { mediaIds: [b, a] });
      expect(res.statusCode).toBe(404);
      expect(await positionsOf(POSTS.other)).toEqual([0, 1]);
    });

    it('404s on an unknown post id', async () => {
      const res = await order('creatorA', '0190a000-0000-7000-8000-00000000dead', {
        mediaIds: [MEDIA(1)],
      });
      expect(res.statusCode).toBe(404);
    });

    it('is only for drafts: a published post answers POST_LOCKED', async () => {
      const [a, b] = await seedReady(POSTS.published, [{ position: 0 }, { position: 1 }]);
      const res = await order('creatorA', POSTS.published, { mediaIds: [b, a] });
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('POST_LOCKED');
      expect(await positionsOf(POSTS.published)).toEqual([0, 1]);
    });

    it('needs a signed-in approved creator and a same-origin request', async () => {
      const ids = await seedReady(POSTS.reorder, [{ position: 0 }, { position: 1 }]);
      const body = { mediaIds: [ids[1], ids[0]] };
      expect((await order(undefined, POSTS.reorder, body)).statusCode).toBe(401);
      expect((await order('plain', POSTS.reorder, body)).statusCode).toBe(403);
      const crossSite = await order('creatorA', POSTS.reorder, body, 'https://evil.example');
      expect(crossSite.statusCode).toBe(403);
      expect(await positionsOf(POSTS.reorder)).toEqual([0, 1]);
    });

    it('keeps positions unique when a reorder races an upload', async () => {
      const [a, b] = await seedReady(POSTS.raced, [{ position: 0 }, { position: 1 }]);
      const [reorder, upload] = await Promise.all([
        order('creatorA', POSTS.raced, { mediaIds: [b, a] }),
        slot('creatorA', POSTS.raced),
      ]);
      expect(reorder.statusCode).toBe(200);
      expect(upload.statusCode).toBe(201);
      const rows = await prisma.mediaAsset.findMany({ where: { postId: POSTS.raced } });
      // Whichever ran first, the two ready items end up in the creator order and nothing shares a position.
      expect(new Set(rows.map((r) => r.position)).size).toBe(3);
      const ready = rows
        .filter((r) => r.status === 'READY')
        .sort((x, y) => x.position - y.position);
      expect(ready.map((r) => r.id)).toEqual([b, a]);
    });
  });
});
