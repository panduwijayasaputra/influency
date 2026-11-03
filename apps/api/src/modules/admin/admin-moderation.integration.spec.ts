import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  moderationPostResultSchema,
  moderationQueueSchema,
  moderationUserResultSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
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
  admin: '0190a000-0000-7000-8000-000000422001',
  admin2: '0190a000-0000-7000-8000-000000422002',
  creator: '0190a000-0000-7000-8000-000000422003',
  fanA: '0190a000-0000-7000-8000-000000422004',
  fanB: '0190a000-0000-7000-8000-000000422005',
  target: '0190a000-0000-7000-8000-000000422006',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `admin-moderation-spec-${name}`;
const SLUG = 'admin-moderation-spec';
const UNKNOWN = '0190a000-0000-7000-8000-000000429998';

describe('admin moderation', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  let creatorProfileId: string;
  let app: NestFastifyApplication;

  const newPost = async (
    status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED' = 'PUBLISHED',
    visibility: 'FREE' | 'PREMIUM' = 'FREE',
  ) =>
    (
      await prisma.post.create({
        data: {
          creatorProfileId,
          visibility,
          status,
          publishedAt: status === 'DRAFT' ? null : new Date(),
        },
      })
    ).id;
  const report = (postId: string, reporter: UserName, reason: 'SPAM' | 'VIOLENCE' = 'SPAM') =>
    prisma.postReport.create({ data: { postId, reporterId: USERS[reporter], reason } });

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Mod ${name}` })),
    });
    await prisma.userRole.createMany({
      data: [USERS.admin, USERS.admin2].map((userId) => ({ userId, role: 'ADMIN' as const })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: { userId: USERS.creator, slug: SLUG, status: 'APPROVED', ...profileFields('Mod') },
      })
    ).id;

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
    const post = { creatorProfile: { userId: { in: userIds } } };
    await prisma.postReport.deleteMany({ where: { post } });
    await prisma.moderationAction.deleteMany({ where: { adminId: { in: userIds } } });
    await prisma.postLike.deleteMany({ where: { post } });
    await prisma.mediaAsset.deleteMany({ where: { post } });
    await prisma.postOffer.deleteMany({ where: { post } });
    await prisma.post.deleteMany({ where: post });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const request = (method: 'GET' | 'POST', url: string, user?: UserName, payload: object = {}) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      headers: { origin: WEB_ORIGIN },
      ...(method === 'POST' ? { payload } : {}),
    });
  const act = (postId: string, action: string, user: UserName = 'admin', payload: object = {}) =>
    request('POST', `/admin/moderation/posts/${postId}/${action}`, user, payload);
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const status = async (postId: string) =>
    (await prisma.post.findUniqueOrThrow({ where: { id: postId } })).status;
  const openCount = (postId: string) =>
    prisma.postReport.count({ where: { postId, resolvedByActionId: null } });
  const queueItems = async () =>
    moderationQueueSchema
      .parse((await request('GET', '/admin/moderation', 'admin')).json())
      .items.filter((i) => i.creator.slug === SLUG);

  describe('access', () => {
    it('requires an admin', async () => {
      const postId = await newPost();
      expect((await request('GET', '/admin/moderation')).statusCode).toBe(401);
      expect((await request('GET', '/admin/moderation', 'fanA')).statusCode).toBe(403);
      expect((await act(postId, 'remove', 'fanA')).statusCode).toBe(403);
      expect((await request('POST', `/admin/users/${USERS.fanB}/suspend`, 'fanA')).statusCode).toBe(
        403,
      );
      expect(await status(postId)).toBe('PUBLISHED');
    });

    it('validates ids, the action and the body', async () => {
      const postId = await newPost();
      expect((await act('nope', 'dismiss')).statusCode).toBe(400);
      expect((await act(postId, 'publish')).statusCode).toBe(400);
      expect((await act(postId, 'dismiss', 'admin', { status: 'REMOVED' })).statusCode).toBe(400);
      expect((await act(postId, 'dismiss', 'admin', { note: 'a'.repeat(501) })).statusCode).toBe(
        400,
      );
      const unknown = await act(UNKNOWN, 'dismiss');
      expect(unknown.statusCode).toBe(404);
      expect(errorCode(unknown)).toBe('NOT_FOUND');
    });
  });

  describe('queue', () => {
    beforeEach(async () => {
      await prisma.postReport.updateMany({
        where: { post: { creatorProfileId }, resolvedByActionId: null },
        data: {
          resolvedByActionId: (
            await prisma.moderationAction.create({
              data: { adminId: USERS.admin, action: 'DISMISS', postId: await newPost() },
            })
          ).id,
        },
      });
    });

    it('lists posts with open reports, oldest first, grouped with reasons', async () => {
      const older = await newPost('PUBLISHED', 'PREMIUM');
      const newer = await newPost();
      await report(older, 'fanA', 'VIOLENCE');
      await report(older, 'fanB', 'SPAM');
      await report(older, 'target', 'VIOLENCE');
      await report(newer, 'fanA');

      const res = await request('GET', '/admin/moderation', 'admin');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const items = await queueItems();
      expect(items.map((i) => i.post.id)).toEqual([older, newer]);
      expect(items[0]).toMatchObject({
        post: { id: older, status: 'PUBLISHED', visibility: 'PREMIUM' },
        creator: { userId: USERS.creator, slug: SLUG, userStatus: 'ACTIVE' },
        openReportCount: 3,
        reasons: [
          { reason: 'VIOLENCE', count: 2 },
          { reason: 'SPAM', count: 1 },
        ],
      });
      expect(items[0]!.reports.map((r) => r.reporterDisplayName)).toEqual([
        'Mod target',
        'Mod fanB',
        'Mod fanA',
      ]);
    });

    it('drops a post once its reports are resolved', async () => {
      const postId = await newPost();
      await report(postId, 'fanA');
      expect((await queueItems()).map((i) => i.post.id)).toEqual([postId]);
      expect((await act(postId, 'dismiss')).statusCode).toBe(200);
      expect(await queueItems()).toEqual([]);
    });
  });

  describe('post actions', () => {
    it('dismiss resolves every open report and keeps the status', async () => {
      const postId = await newPost();
      await report(postId, 'fanA');
      await report(postId, 'fanB');
      const res = await act(postId, 'dismiss', 'admin', { note: 'bukan pelanggaran' });
      expect(res.statusCode).toBe(200);
      expect(moderationPostResultSchema.parse(res.json())).toEqual({
        postId,
        status: 'PUBLISHED',
        resolvedReports: 2,
      });
      expect(await openCount(postId)).toBe(0);
      const action = await prisma.moderationAction.findFirstOrThrow({ where: { postId } });
      expect(action).toMatchObject({
        adminId: USERS.admin,
        action: 'DISMISS',
        note: 'bukan pelanggaran',
      });
      const resolved = await prisma.postReport.findMany({ where: { postId } });
      expect(resolved.every((r) => r.resolvedByActionId === action.id)).toBe(true);
    });

    it('hide takes a post off the public site; only an admin can unhide it', async () => {
      const postId = await newPost();
      await report(postId, 'fanA');
      const hidden = await act(postId, 'hide');
      expect(hidden.json()).toEqual({ postId, status: 'PENDING_REVIEW', resolvedReports: 1 });

      const publicDetail = await request('GET', `/creators/${SLUG}/posts/${postId}`, 'fanA');
      expect(publicDetail.statusCode).toBe(404);
      const ownerDetail = await request('GET', `/creators/${SLUG}/posts/${postId}`, 'creator');
      expect(ownerDetail.statusCode).toBe(200);
      for (const step of ['publish', 'archive', 'restore']) {
        const res = await request('POST', `/creators/me/posts/${postId}/${step}`, 'creator');
        expect(res.statusCode, step).toBe(409);
      }

      const before = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      const shown = await act(postId, 'unhide');
      expect(shown.json()).toEqual({ postId, status: 'PUBLISHED', resolvedReports: 0 });
      const after = await prisma.post.findUniqueOrThrow({ where: { id: postId } });
      expect(after.publishedAt).toEqual(before.publishedAt);
      expect((await request('GET', `/creators/${SLUG}/posts/${postId}`, 'fanA')).statusCode).toBe(
        200,
      );
    });

    it('refuses transitions that do not fit the status', async () => {
      const review = await newPost('PENDING_REVIEW'); // first-publish review, not an admin hide
      const published = await newPost();
      const archived = await newPost('ARCHIVED');
      for (const [postId, action] of [
        [review, 'unhide'],
        [published, 'unhide'],
        [archived, 'hide'],
        [review, 'hide'],
      ] as const) {
        const res = await act(postId, action);
        expect(res.statusCode, `${action}`).toBe(409);
        expect(errorCode(res)).toBe('POST_STATUS_CONFLICT');
      }
      expect(
        await prisma.moderationAction.count({
          where: { postId: { in: [review, published, archived] } },
        }),
      ).toBe(0);
    });

    it('remove is terminal and keeps offers, media, likes and earlier history', async () => {
      const postId = await newPost('PUBLISHED', 'PREMIUM');
      await prisma.postOffer.create({ data: { postId, version: 1, priceCoins: 25n } });
      const key = `post-media/${crypto.randomUUID()}`;
      memory.objects.set(key, { body: new Uint8Array([1, 2, 3]), contentType: 'image/png' });
      await prisma.mediaAsset.create({
        data: {
          postId,
          kind: 'IMAGE',
          status: 'READY',
          objectKey: key,
          contentType: 'image/png',
          byteSize: 3,
          uploadExpiresAt: new Date(),
        },
      });
      await prisma.postLike.create({ data: { postId, userId: USERS.fanA } });
      await report(postId, 'fanB');
      await act(postId, 'hide');
      const snapshot = async () => ({
        offers: await prisma.postOffer.findMany({ where: { postId } }),
        media: await prisma.mediaAsset.findMany({ where: { postId } }),
        likes: await prisma.postLike.findMany({ where: { postId } }),
        actions: await prisma.moderationAction.findMany({ where: { postId } }),
      });
      const before = await snapshot();

      const res = await act(postId, 'remove');
      expect(res.json()).toMatchObject({ postId, status: 'REMOVED' });
      const after = await snapshot();
      expect(after.offers).toEqual(before.offers);
      expect(after.media).toEqual(before.media);
      expect(after.likes).toEqual(before.likes);
      expect(after.actions.slice(0, before.actions.length)).toEqual(before.actions);
      expect(after.actions).toHaveLength(before.actions.length + 1);
      expect(memory.objects.has(key)).toBe(true);

      expect(
        (await request('GET', `/creators/${SLUG}/posts/${postId}`, 'creator')).statusCode,
      ).toBe(404);
      const adminView = await request('GET', `/creators/${SLUG}/posts/${postId}`, 'admin');
      expect(adminView.json()).toMatchObject({ access: 'full' });
      const again = await act(postId, 'remove');
      expect(again.statusCode).toBe(409);
    });

    it('lets one of two simultaneous hides win', async () => {
      const postId = await newPost();
      const results = await Promise.all([
        act(postId, 'hide', 'admin'),
        act(postId, 'hide', 'admin2'),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(await prisma.moderationAction.count({ where: { postId, action: 'HIDE' } })).toBe(1);
    });

    it('never leaves a report half-resolved when a report races a dismiss', async () => {
      const postId = await newPost();
      await report(postId, 'fanA');
      await Promise.all([
        act(postId, 'dismiss'),
        request('POST', `/posts/${postId}/report`, 'fanB', { reason: 'SPAM' }),
      ]);
      const action = await prisma.moderationAction.findFirstOrThrow({ where: { postId } });
      const reports = await prisma.postReport.findMany({ where: { postId } });
      expect(reports).toHaveLength(2);
      expect(
        reports.every((r) => r.resolvedByActionId === null || r.resolvedByActionId === action.id),
      ).toBe(true);
    });
  });

  describe('suspend / unsuspend', () => {
    const me = (user: UserName) => request('GET', '/auth/me', user);

    it('suspends a user: sessions stop working until unsuspended', async () => {
      expect((await me('target')).statusCode).toBe(200);
      const res = await request('POST', `/admin/users/${USERS.target}/suspend`, 'admin', {
        note: 'spam',
      });
      expect(res.statusCode).toBe(200);
      expect(moderationUserResultSchema.parse(res.json())).toEqual({
        userId: USERS.target,
        status: 'SUSPENDED',
      });
      expect((await me('target')).statusCode).toBe(401);

      const twice = await request('POST', `/admin/users/${USERS.target}/suspend`, 'admin');
      expect(twice.statusCode).toBe(409);
      expect(errorCode(twice)).toBe('USER_STATUS_CONFLICT');

      const back = await request('POST', `/admin/users/${USERS.target}/unsuspend`, 'admin');
      expect(back.json()).toEqual({ userId: USERS.target, status: 'ACTIVE' });
      expect((await me('target')).statusCode).toBe(200);
      const again = await request('POST', `/admin/users/${USERS.target}/unsuspend`, 'admin');
      expect(errorCode(again)).toBe('USER_STATUS_CONFLICT');

      const actions = await prisma.moderationAction.findMany({
        where: { targetUserId: USERS.target },
        orderBy: { createdAt: 'asc' },
      });
      expect(actions.map((a) => [a.action, a.note])).toEqual([
        ['SUSPEND_USER', 'spam'],
        ['UNSUSPEND_USER', null],
      ]);
    });

    it('suspending a creator hides the page and posts without touching them', async () => {
      const postId = await newPost();
      expect((await request('GET', `/creators/${SLUG}`)).statusCode).toBe(200);
      await request('POST', `/admin/users/${USERS.creator}/suspend`, 'admin');
      expect((await request('GET', `/creators/${SLUG}`)).statusCode).toBe(404);
      expect((await request('GET', `/creators/${SLUG}/posts/${postId}`, 'fanA')).statusCode).toBe(
        404,
      );
      expect((await request('GET', '/creators/me/posts', 'creator')).statusCode).toBe(401);
      expect(await status(postId)).toBe('PUBLISHED');
      await request('POST', `/admin/users/${USERS.creator}/unsuspend`, 'admin');
      expect((await request('GET', `/creators/${SLUG}`)).statusCode).toBe(200);
    });

    it('never suspends an admin or self, and 404s unknown users', async () => {
      for (const id of [USERS.admin, USERS.admin2]) {
        const res = await request('POST', `/admin/users/${id}/suspend`, 'admin');
        expect(res.statusCode).toBe(409);
        expect(errorCode(res)).toBe('CANNOT_SUSPEND_ADMIN');
      }
      const unknown = await request('POST', `/admin/users/${UNKNOWN}/suspend`, 'admin');
      expect(unknown.statusCode).toBe(404);
      expect((await request('POST', '/admin/users/nope/suspend', 'admin')).statusCode).toBe(400);
      expect(
        await prisma.moderationAction.count({
          where: { targetUserId: { in: [USERS.admin, USERS.admin2] } },
        }),
      ).toBe(0);
    });

    it('lets one of two simultaneous suspends win', async () => {
      const results = await Promise.all([
        request('POST', `/admin/users/${USERS.fanB}/suspend`, 'admin'),
        request('POST', `/admin/users/${USERS.fanB}/suspend`, 'admin2'),
      ]);
      expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
      expect(await prisma.moderationAction.count({ where: { targetUserId: USERS.fanB } })).toBe(1);
      await request('POST', `/admin/users/${USERS.fanB}/unsuspend`, 'admin');
    });
  });
});
