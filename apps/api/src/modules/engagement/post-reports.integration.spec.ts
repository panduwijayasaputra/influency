import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { postReportResponseSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { POST_REPORT_RATE_LIMIT } from './post-reports.controller.js';

const WEB_ORIGIN = 'http://localhost:3000';
// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  creator: '0190a000-0000-7000-8000-000000421001',
  suspendedCreator: '0190a000-0000-7000-8000-000000421002',
  fanA: '0190a000-0000-7000-8000-000000421003',
  fanB: '0190a000-0000-7000-8000-000000421004',
  spammer: '0190a000-0000-7000-8000-000000421005',
  admin: '0190a000-0000-7000-8000-000000421006',
  outsider: '0190a000-0000-7000-8000-000000421007',
  validator: '0190a000-0000-7000-8000-000000421008',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `post-reports-spec-${name}`;

describe('POST /posts/:id/report', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const posts: Record<string, string> = {};
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Reports ${name}`,
        status: name === 'suspendedCreator' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
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
    const profile = async (userId: string, slug: string) =>
      (
        await prisma.creatorProfile.create({
          data: { userId, slug, status: 'APPROVED', ...profileFields('Reports') },
        })
      ).id;
    const creatorProfileId = await profile(USERS.creator, 'post-reports-spec');
    const suspendedProfileId = await profile(USERS.suspendedCreator, 'post-reports-spec-b');
    const post = async (
      key: string,
      visibility: 'FREE' | 'PREMIUM',
      status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED' | 'REMOVED',
      profileId = creatorProfileId,
    ) => {
      posts[key] = (
        await prisma.post.create({
          data: {
            creatorProfileId: profileId,
            visibility,
            status,
            publishedAt: status === 'DRAFT' ? null : new Date(),
          },
        })
      ).id;
    };
    await post('free', 'FREE', 'PUBLISHED');
    await post('again', 'FREE', 'PUBLISHED');
    await post('concurrent', 'FREE', 'PUBLISHED');
    await post('premium', 'PREMIUM', 'PUBLISHED');
    await post('draft', 'FREE', 'DRAFT');
    await post('review', 'FREE', 'PENDING_REVIEW');
    await post('archived', 'FREE', 'ARCHIVED');
    await post('removed', 'FREE', 'REMOVED');
    await post('suspended', 'FREE', 'PUBLISHED', suspendedProfileId);
    await prisma.postOffer.create({
      data: { postId: posts.premium!, version: 1, priceCoins: 10n },
    });

    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
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
    await prisma.postReport.deleteMany({ where: { post: where } });
    await prisma.moderationAction.deleteMany({ where: { adminId: { in: userIds } } });
    await prisma.postOffer.deleteMany({ where: { post: where } });
    await prisma.post.deleteMany({ where });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const send = (
    postId: string,
    user: UserName | undefined,
    body: unknown = { reason: 'SPAM' },
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/report`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      headers: { origin },
      payload: body as object,
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const openReports = (postId: string) =>
    prisma.postReport.findMany({ where: { postId, resolvedByActionId: null } });

  it('stores a report with its reason and note', async () => {
    const res = await send(posts.free!, 'fanA', { reason: 'HARASSMENT', note: '  kasar  ' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(postReportResponseSchema.parse(res.json())).toEqual({ reported: true });
    expect(await openReports(posts.free!)).toEqual([
      expect.objectContaining({ reporterId: USERS.fanA, reason: 'HARASSMENT', note: 'kasar' }),
    ]);
  });

  it('lets a viewer report a locked premium post', async () => {
    expect((await send(posts.premium!, 'fanA')).statusCode).toBe(200);
    expect(await openReports(posts.premium!)).toHaveLength(1);
  });

  it('keeps one open report per user and allows a new one after resolution', async () => {
    expect((await send(posts.again!, 'fanA', { reason: 'SPAM' })).statusCode).toBe(200);
    expect((await send(posts.again!, 'fanA', { reason: 'VIOLENCE' })).statusCode).toBe(200);
    const [first] = await openReports(posts.again!);
    expect(first).toMatchObject({ reason: 'SPAM' });
    expect(await openReports(posts.again!)).toHaveLength(1);

    const action = await prisma.moderationAction.create({
      data: { adminId: USERS.admin, action: 'DISMISS', postId: posts.again! },
    });
    await prisma.postReport.updateMany({
      where: { postId: posts.again! },
      data: { resolvedByActionId: action.id },
    });
    expect((await send(posts.again!, 'fanA', { reason: 'VIOLENCE' })).statusCode).toBe(200);
    expect(await openReports(posts.again!)).toEqual([
      expect.objectContaining({ reason: 'VIOLENCE' }),
    ]);
  });

  it('stores one report under simultaneous requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => send(posts.concurrent!, 'fanB')),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(await openReports(posts.concurrent!)).toHaveLength(1);
  });

  it('refuses the owner', async () => {
    const res = await send(posts.free!, 'creator');
    expect(res.statusCode).toBe(403);
    expect(errorCode(res)).toBe('CANNOT_REPORT_OWN_POST');
  });

  it('answers 404 for posts the reporter cannot see', async () => {
    for (const key of ['draft', 'review', 'archived', 'removed', 'suspended']) {
      const res = await send(posts[key]!, 'outsider');
      expect(res.statusCode, key).toBe(404);
      expect(errorCode(res), key).toBe('NOT_FOUND');
    }
    const unknown = await send('0190a000-0000-7000-8000-000000429999', 'outsider');
    expect(unknown.statusCode).toBe(404);
  });

  it('answers POST_NOT_AVAILABLE when a viewer who can see it (admin) reports an unpublished post', async () => {
    const res = await send(posts.draft!, 'admin');
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('POST_NOT_AVAILABLE');
  });

  it('requires a session, a same-origin request and a valid body', async () => {
    const anonymous = await send(posts.free!, undefined);
    expect(anonymous.statusCode).toBe(401);
    expect(errorCode(anonymous)).toBe('AUTH_REQUIRED');
    expect(
      (await send(posts.free!, 'validator', undefined, 'https://evil.example')).statusCode,
    ).toBe(403);
    expect((await send('not-a-uuid', 'validator')).statusCode).toBe(400);
    for (const body of [{}, { reason: 'OTHER' }, { reason: 'SPAM', status: 'REMOVED' }]) {
      const res = await send(posts.free!, 'validator', body);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe('VALIDATION_FAILED');
    }
  });

  it(`rate-limits a user after ${POST_REPORT_RATE_LIMIT.max} reports per window`, async () => {
    for (let i = 0; i < POST_REPORT_RATE_LIMIT.max; i++) {
      expect((await send(posts.free!, 'spammer')).statusCode).toBe(200);
    }
    const res = await send(posts.free!, 'spammer');
    expect(res.statusCode).toBe(429);
    expect(errorCode(res)).toBe('RATE_LIMITED');
    expect(res.headers['retry-after']).toBeDefined();
  });
});
