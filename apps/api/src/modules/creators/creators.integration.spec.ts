import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  CREATOR_AGREEMENT_VERSION,
  creatorApplicationResponseSchema,
  errorResponseSchema,
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
  fresh: '0190a000-0000-7000-8000-0000000e0001',
  racer: '0190a000-0000-7000-8000-0000000e0002',
  slugRaceA: '0190a000-0000-7000-8000-0000000e0003',
  slugRaceB: '0190a000-0000-7000-8000-0000000e0004',
  pending: '0190a000-0000-7000-8000-0000000e0005',
  approved: '0190a000-0000-7000-8000-0000000e0006',
  rejected: '0190a000-0000-7000-8000-0000000e0007',
  invalid: '0190a000-0000-7000-8000-0000000e0008',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `creators-spec-${name}`;

const valid = { displayName: 'Kreator Baru', slug: 'kreator-baru', acceptAgreement: true };

describe('creator applications', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Creators ${name}` })),
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    await prisma.creatorProfile.createMany({
      data: [
        { userId: USERS.pending, slug: 'creators-spec-pending', ...profileFields() },
        {
          userId: USERS.approved,
          slug: 'creators-spec-approved',
          status: 'APPROVED',
          ...profileFields(),
        },
        {
          userId: USERS.rejected,
          slug: 'creators-spec-rejected',
          status: 'REJECTED',
          ...profileFields('Old Name'),
        },
      ],
    });

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
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const apply = (name: UserName | undefined, payload: unknown, origin = WEB_ORIGIN) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/creators/apply',
      headers: { origin },
      cookies: name ? { influency_session: token(name) } : {},
      payload: payload as object,
    });
  const mine = (name?: UserName) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/creators/me/application',
      cookies: name ? { influency_session: token(name) } : {},
    });
  const errorOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error;

  it('requires a session on both routes', async () => {
    for (const res of [await apply(undefined, valid), await mine()]) {
      expect(res.statusCode).toBe(401);
      expect(errorOf(res).code).toBe('AUTH_REQUIRED');
    }
  });

  it('returns null when the user has no application', async () => {
    const res = await mine('invalid');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({ application: null });
  });

  it('creates a PENDING_REVIEW application with a normalized slug', async () => {
    const res = await apply('fresh', {
      ...valid,
      slug: '  Kreator-Baru ',
      bio: 'Halo',
      category: '',
    });
    expect(res.statusCode).toBe(201);
    expect(creatorApplicationResponseSchema.parse(res.json())).toMatchObject({
      status: 'PENDING_REVIEW',
      slug: 'kreator-baru',
      displayName: 'Kreator Baru',
      bio: 'Halo',
      category: null,
    });
    const row = await prisma.creatorProfile.findUniqueOrThrow({ where: { userId: USERS.fresh } });
    expect(row.agreementVersion).toBe(CREATOR_AGREEMENT_VERSION);
    expect(row.agreementAcceptedAt).toBeInstanceOf(Date);

    const got = await mine('fresh');
    expect(got.json()).toEqual({ application: res.json<unknown>() });
  });

  it.each([
    ['a reserved slug', { ...valid, slug: 'admin' }, 'slug'],
    ['a reserved slug in another case', { ...valid, slug: 'Become-Creator' }, 'slug'],
    ['a slug with a dot', { ...valid, slug: 'a.b' }, 'slug'],
    ['a too-short slug', { ...valid, slug: 'ab' }, 'slug'],
    ['a missing agreement', { ...valid, acceptAgreement: undefined }, 'acceptAgreement'],
    ['a declined agreement', { ...valid, acceptAgreement: false }, 'acceptAgreement'],
    ['an empty display name', { ...valid, displayName: ' ' }, 'displayName'],
  ])('rejects %s with 400 VALIDATION_FAILED', async (_label, payload, field) => {
    const res = await apply('invalid', payload);
    expect(res.statusCode).toBe(400);
    const error = errorOf(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.details?.issues).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: field })]),
    );
  });

  it('rejects a slug taken in another case with 409 SLUG_TAKEN', async () => {
    const res = await apply('invalid', { ...valid, slug: 'CREATORS-SPEC-APPROVED' });
    expect(res.statusCode).toBe(409);
    expect(errorOf(res)).toMatchObject({ code: 'SLUG_TAKEN', details: { field: 'slug' } });
  });

  it.each([['pending'], ['approved']] as const)(
    'rejects a second application from a %s user',
    async (name) => {
      const res = await apply(name, { ...valid, slug: `creators-spec-new-${name}` });
      expect(res.statusCode).toBe(409);
      expect(errorOf(res).code).toBe('CREATOR_APPLICATION_EXISTS');
    },
  );

  it('lets a rejected user resubmit, keeping their own old slug', async () => {
    const res = await apply('rejected', {
      ...valid,
      displayName: 'New Name',
      slug: 'creators-spec-rejected',
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      status: 'PENDING_REVIEW',
      displayName: 'New Name',
      slug: 'creators-spec-rejected',
    });
    expect(await prisma.creatorProfile.count({ where: { userId: USERS.rejected } })).toBe(1);

    const again = await apply('rejected', { ...valid, slug: 'creators-spec-other' });
    expect(errorOf(again).code).toBe('CREATOR_APPLICATION_EXISTS');
  });

  it('accepts exactly one of 5 concurrent applications from the same user', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) => apply('racer', { ...valid, slug: `creators-race-${i}` })),
    );
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([201, 409, 409, 409, 409]);
    for (const res of results.filter((r) => r.statusCode === 409)) {
      expect(errorOf(res).code).toBe('CREATOR_APPLICATION_EXISTS');
    }
    expect(await prisma.creatorProfile.count({ where: { userId: USERS.racer } })).toBe(1);
  });

  it('gives a contested slug to exactly one of two concurrent applicants', async () => {
    const payload = { ...valid, slug: 'creators-spec-contested' };
    const results = await Promise.all([apply('slugRaceA', payload), apply('slugRaceB', payload)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(errorOf(results.find((r) => r.statusCode === 409)!).code).toBe('SLUG_TAKEN');
  });

  it('still enforces the CSRF Origin check', async () => {
    const res = await apply('invalid', valid, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });
});
