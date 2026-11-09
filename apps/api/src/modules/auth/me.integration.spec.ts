import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { errorResponseSchema, meResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { TELEGRAM_OIDC_CLIENT } from './telegram-oidc.client.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const PLAIN = '0190a000-0000-7000-8000-0000000d0001';
const CREATOR_ADMIN = '0190a000-0000-7000-8000-0000000d0002';
const PENDING = '0190a000-0000-7000-8000-0000000d0003';
const TOKENS = {
  plain: 'me-spec-plain',
  creatorAdmin: 'me-spec-creator-admin',
  pending: 'me-spec-pending',
  revoked: 'me-spec-revoked',
};

describe('GET /auth/me', () => {
  const prisma = createTestPrisma();
  const userIds = [PLAIN, CREATOR_ADMIN, PENDING];
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: PLAIN, displayName: 'Me Plain' },
        { id: CREATOR_ADMIN, displayName: 'Me Creator Admin' },
        { id: PENDING, displayName: 'Me Pending' },
      ],
    });
    const expiresAt = new Date(Date.now() + 86_400_000);
    await prisma.session.createMany({
      data: [
        { userId: PLAIN, tokenHash: sha256hex(TOKENS.plain), expiresAt },
        { userId: CREATOR_ADMIN, tokenHash: sha256hex(TOKENS.creatorAdmin), expiresAt },
        { userId: PENDING, tokenHash: sha256hex(TOKENS.pending), expiresAt },
        { userId: PLAIN, tokenHash: sha256hex(TOKENS.revoked), expiresAt, revokedAt: new Date() },
      ],
    });
    await prisma.userRole.create({ data: { userId: CREATOR_ADMIN, role: 'ADMIN' } });
    await prisma.creatorProfile.createMany({
      data: [
        {
          userId: CREATOR_ADMIN,
          slug: 'me-spec-creator',
          status: 'APPROVED',
          ...profileFields(),
        },
        { userId: PENDING, slug: 'me-spec-pending', ...profileFields() },
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
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const me = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: token ? { influency_session: token } : {},
    });

  it.each([
    ['no cookie', undefined],
    ['a revoked session', TOKENS.revoked],
  ])('rejects %s with 401 AUTH_REQUIRED', async (_label, token) => {
    const res = await me(token);
    expect(res.statusCode).toBe(401);
    expect(errorResponseSchema.parse(res.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('returns a plain user with only USER, uncached', async () => {
    const res = await me(TOKENS.plain);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(meResponseSchema.parse(res.json())).toEqual({
      id: PLAIN,
      displayName: 'Me Plain',
      username: null,
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: false,
    });
  });

  it('returns the Telegram username from the identity', async () => {
    await prisma.authIdentity.create({
      data: {
        userId: PLAIN,
        provider: 'TELEGRAM',
        providerSub: 'me-spec-plain-sub',
        username: 'me_plain',
      },
    });
    expect((await me(TOKENS.plain)).json()).toMatchObject({ username: 'me_plain' });
    await prisma.authIdentity.deleteMany({ where: { userId: PLAIN } });
  });

  it('returns USER, CREATOR, ADMIN in fixed order for an approved creator who is admin', async () => {
    expect((await me(TOKENS.creatorAdmin)).json()).toMatchObject({
      roles: ['USER', 'CREATOR', 'ADMIN'],
    });
  });

  it('does not grant CREATOR for a pending profile', async () => {
    expect((await me(TOKENS.pending)).json()).toMatchObject({ roles: ['USER'] });
  });

  it('returns creatorSlug only for an APPROVED creator profile', async () => {
    expect((await me(TOKENS.creatorAdmin)).json()).toMatchObject({
      creatorSlug: 'me-spec-creator',
    });
    expect((await me(TOKENS.pending)).json()).toMatchObject({ creatorSlug: null });
    expect((await me(TOKENS.plain)).json()).toMatchObject({ creatorSlug: null });
  });

  it('returns the bio, and the database refuses one over 500 characters', async () => {
    await prisma.user.update({ where: { id: PLAIN }, data: { bio: 'Halo' } });
    expect((await me(TOKENS.plain)).json()).toMatchObject({ bio: 'Halo' });
    await expect(
      prisma.user.update({ where: { id: PLAIN }, data: { bio: 'x'.repeat(501) } }),
    ).rejects.toThrow();
    await prisma.user.update({ where: { id: PLAIN }, data: { bio: 'x'.repeat(500) } });
    await prisma.user.update({ where: { id: PLAIN }, data: { bio: null } });
  });

  it('reflects DB role changes on the next request with the same cookie', async () => {
    await prisma.userRole.create({ data: { userId: PLAIN, role: 'ADMIN' } });
    expect((await me(TOKENS.plain)).json()).toMatchObject({ roles: ['USER', 'ADMIN'] });
    await prisma.userRole.deleteMany({ where: { userId: PLAIN } });
    expect((await me(TOKENS.plain)).json()).toMatchObject({ roles: ['USER'] });
  });
});
