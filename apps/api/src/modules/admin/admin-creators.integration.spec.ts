import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  adminCreatorApplicationListSchema,
  creatorApplicationResponseSchema,
  errorResponseSchema,
  meResponseSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  admin: '0190a000-0000-7000-8000-0000000f0001',
  user: '0190a000-0000-7000-8000-0000000f0002',
  creator: '0190a000-0000-7000-8000-0000000f0003',
  older: '0190a000-0000-7000-8000-0000000f0004',
  newer: '0190a000-0000-7000-8000-0000000f0005',
  toReject: '0190a000-0000-7000-8000-0000000f0006',
  racer: '0190a000-0000-7000-8000-0000000f0007',
  mixed: '0190a000-0000-7000-8000-0000000f0008',
  csrf: '0190a000-0000-7000-8000-0000000f0009',
} as const;
type UserName = keyof typeof USERS;
const PROFILES = {
  creator: '0190a000-0000-7000-8000-0000000f0103',
  older: '0190a000-0000-7000-8000-0000000f0104',
  newer: '0190a000-0000-7000-8000-0000000f0105',
  toReject: '0190a000-0000-7000-8000-0000000f0106',
  racer: '0190a000-0000-7000-8000-0000000f0107',
  mixed: '0190a000-0000-7000-8000-0000000f0108',
  csrf: '0190a000-0000-7000-8000-0000000f0109',
} as const;
type ApplicantName = keyof typeof PROFILES;
const token = (name: UserName) => `admin-creators-spec-${name}`;
const UNKNOWN_ID = '0190a000-0000-7000-8000-0000000f0999';

describe('admin creator application review', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const profileIds: string[] = Object.values(PROFILES);
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Admin spec ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    await prisma.userRole.create({ data: { userId: USERS.admin, role: 'ADMIN' } });
    // Created one by one so updated_at (the list order) increases in this order.
    for (const name of Object.keys(PROFILES) as ApplicantName[]) {
      await prisma.creatorProfile.create({
        data: {
          id: PROFILES[name],
          userId: USERS[name],
          slug: `admin-spec-${name.toLowerCase()}`,
          status: name === 'creator' ? 'APPROVED' : 'PENDING_REVIEW',
          bio: `Bio ${name}`,
          category: 'Musik',
          ...profileFields(`Kreator ${name}`),
        },
      });
    }

    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
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
    await prisma.creatorApplicationReview.deleteMany({
      where: { creatorProfileId: { in: profileIds } },
    });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const cookies = (name?: UserName): Record<string, string> =>
    name ? { influency_session: token(name) } : {};
  const list = (name?: UserName) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/admin/creators/applications',
      cookies: cookies(name),
    });
  const decide = (
    name: UserName | undefined,
    id: string,
    action: 'approve' | 'reject',
    payload?: object,
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/admin/creators/${id}/${action}`,
      headers: { origin },
      cookies: cookies(name),
      ...(payload && { payload }),
    });
  const me = async (name: UserName) =>
    meResponseSchema.parse(
      (await app.inject({ method: 'GET', url: '/api/v1/auth/me', cookies: cookies(name) })).json(),
    );
  const myApplication = async (name: UserName) =>
    creatorApplicationResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/creators/me/application',
          cookies: cookies(name),
        })
      ).json<{ application: unknown }>().application,
    );
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;
  const statusOf = async (id: string) =>
    (await prisma.creatorProfile.findUniqueOrThrow({ where: { id } })).status;
  const reviewsOf = (id: string) =>
    prisma.creatorApplicationReview.findMany({
      where: { creatorProfileId: id },
      orderBy: { createdAt: 'asc' },
    });
  const listedIds = async () =>
    adminCreatorApplicationListSchema
      .parse((await list('admin')).json())
      .applications.map((a) => a.id)
      .filter((id) => profileIds.includes(id));

  it('requires a session', async () => {
    for (const res of [
      await list(),
      await decide(undefined, PROFILES.older, 'approve'),
      await decide(undefined, PROFILES.older, 'reject', { reason: 'x' }),
    ]) {
      expect(res.statusCode).toBe(401);
      expect(errorOf(res).code).toBe('AUTH_REQUIRED');
    }
  });

  it.each(['user', 'creator'] as const)(
    'forbids a non-admin (%s) to list, approve or reject',
    async (name) => {
      for (const res of [
        await list(name),
        await decide(name, PROFILES.older, 'approve'),
        await decide(name, PROFILES.older, 'reject', { reason: 'x' }),
      ]) {
        expect(res.statusCode).toBe(403);
        expect(errorOf(res).code).toBe('FORBIDDEN');
      }
      expect(await statusOf(PROFILES.older)).toBe('PENDING_REVIEW');
      expect(await reviewsOf(PROFILES.older)).toEqual([]);
    },
  );

  it('lists only pending applications, oldest first, with applicant details', async () => {
    const res = await list('admin');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { applications } = adminCreatorApplicationListSchema.parse(res.json());
    expect(applications.find((a) => a.id === PROFILES.older)).toMatchObject({
      id: PROFILES.older,
      displayName: 'Kreator older',
      slug: 'admin-spec-older',
      bio: 'Bio older',
      category: 'Musik',
      applicantName: 'Admin spec older',
    });
    const ids = await listedIds();
    expect(ids).not.toContain(PROFILES.creator);
    expect(ids.indexOf(PROFILES.older)).toBeLessThan(ids.indexOf(PROFILES.newer));
  });

  it('approves: records the admin + time and grants Studio access', async () => {
    expect((await me('older')).roles).not.toContain('CREATOR');

    const res = await decide('admin', PROFILES.older, 'approve');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: PROFILES.older, status: 'APPROVED' });

    const reviews = await reviewsOf(PROFILES.older);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({
      reviewerId: USERS.admin,
      decision: 'APPROVED',
      reason: null,
    });
    expect(reviews[0]!.createdAt).toBeInstanceOf(Date);

    expect((await me('older')).roles).toContain('CREATOR');
    expect(await listedIds()).not.toContain(PROFILES.older);
  });

  it('rejects with a trimmed reason the applicant can see; resubmitting clears it', async () => {
    const res = await decide('admin', PROFILES.toReject, 'reject', {
      reason: '  Foto profil tidak jelas  ',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id: PROFILES.toReject, status: 'REJECTED' });
    expect(await reviewsOf(PROFILES.toReject)).toMatchObject([
      { reviewerId: USERS.admin, decision: 'REJECTED', reason: 'Foto profil tidak jelas' },
    ]);
    expect(await myApplication('toReject')).toMatchObject({
      status: 'REJECTED',
      rejectionReason: 'Foto profil tidak jelas',
    });

    const resubmit = await app.inject({
      method: 'POST',
      url: '/api/v1/creators/apply',
      headers: { origin: WEB_ORIGIN },
      cookies: cookies('toReject'),
      payload: { displayName: 'Kreator Baru', slug: 'admin-spec-toreject', acceptAgreement: true },
    });
    expect(resubmit.statusCode).toBe(201);
    expect(resubmit.json()).toMatchObject({ status: 'PENDING_REVIEW', rejectionReason: null });
    expect(await myApplication('toReject')).toMatchObject({ rejectionReason: null });
    expect(await listedIds()).toContain(PROFILES.toReject);
    // The earlier decision is kept.
    expect(await reviewsOf(PROFILES.toReject)).toHaveLength(1);
  });

  it.each([{}, { reason: '' }, { reason: '   ' }, { reason: 'a'.repeat(501) }])(
    'requires a reason to reject (%j)',
    async (payload) => {
      const res = await decide('admin', PROFILES.newer, 'reject', payload);
      expect(res.statusCode).toBe(400);
      expect(errorOf(res)).toMatchObject({
        code: 'VALIDATION_FAILED',
        details: { issues: [expect.objectContaining({ path: 'reason' })] },
      });
      expect(await statusOf(PROFILES.newer)).toBe('PENDING_REVIEW');
    },
  );

  it('refuses to decide an application twice', async () => {
    for (const res of [
      await decide('admin', PROFILES.older, 'approve'),
      await decide('admin', PROFILES.older, 'reject', { reason: 'Terlambat' }),
    ]) {
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('CREATOR_APPLICATION_NOT_PENDING');
    }
    expect(await reviewsOf(PROFILES.older)).toHaveLength(1);
    expect(await statusOf(PROFILES.older)).toBe('APPROVED');
  });

  it('returns 404 for an unknown id and 400 for a malformed one', async () => {
    const unknown = await decide('admin', UNKNOWN_ID, 'approve');
    expect(unknown.statusCode).toBe(404);
    expect(errorOf(unknown).code).toBe('NOT_FOUND');
    const malformed = await decide('admin', 'not-a-uuid', 'approve');
    expect(malformed.statusCode).toBe(400);
    expect(errorOf(malformed).code).toBe('VALIDATION_FAILED');
  });

  it('accepts exactly one of 5 concurrent approvals', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () => decide('admin', PROFILES.racer, 'approve')),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409, 409, 409, 409]);
    expect(await reviewsOf(PROFILES.racer)).toHaveLength(1);
  });

  it('settles a concurrent approve vs reject with one decision', async () => {
    const [approve, reject] = await Promise.all([
      decide('admin', PROFILES.mixed, 'approve'),
      decide('admin', PROFILES.mixed, 'reject', { reason: 'Tidak sesuai' }),
    ]);
    expect([approve.statusCode, reject.statusCode].sort()).toEqual([200, 409]);
    const reviews = await reviewsOf(PROFILES.mixed);
    expect(reviews).toHaveLength(1);
    expect(await statusOf(PROFILES.mixed)).toBe(reviews[0]!.decision);
  });

  it('still enforces the CSRF Origin check', async () => {
    const res = await decide('admin', PROFILES.csrf, 'approve', undefined, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
    expect(await statusOf(PROFILES.csrf)).toBe('PENDING_REVIEW');
  });
});
