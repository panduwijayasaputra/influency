import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { creatorProfileResponseSchema, errorResponseSchema } from '@influency/shared';
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

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  approved: '0190a000-0000-7000-8000-0000001b0001',
  pending: '0190a000-0000-7000-8000-0000001b0002',
  rejected: '0190a000-0000-7000-8000-0000001b0003',
  suspended: '0190a000-0000-7000-8000-0000001b0004',
} as const;
const AVATAR_ID = '0190a000-0000-7000-8000-0000001b00a1';
const SUSPENDED_AVATAR_ID = '0190a000-0000-7000-8000-0000001b00a2';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

describe('public creator profile', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const memory = createMemoryStorage();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Public ${name}`,
        status: name === 'suspended' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
    });
    await prisma.session.create({
      data: {
        userId: USERS.approved,
        tokenHash: sha256hex('public-profile-spec'),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await prisma.creatorProfile.createMany({
      data: [
        {
          userId: USERS.approved,
          slug: 'public-spec-approved',
          status: 'APPROVED',
          bio: 'Halo!',
          category: 'Musik',
          avatarKey: `profile-images/${AVATAR_ID}`,
          ...profileFields('Public Approved'),
        },
        { userId: USERS.pending, slug: 'public-spec-pending', ...profileFields() },
        {
          userId: USERS.rejected,
          slug: 'public-spec-rejected',
          status: 'REJECTED',
          ...profileFields(),
        },
        {
          userId: USERS.suspended,
          slug: 'public-spec-suspended',
          status: 'APPROVED',
          avatarKey: `profile-images/${SUSPENDED_AVATAR_ID}`,
          ...profileFields(),
        },
      ],
    });
    await memory.storage.put(`profile-images/${AVATAR_ID}`, PNG, 'image/png');
    await memory.storage.put(`profile-images/${SUSPENDED_AVATAR_ID}`, PNG, 'image/png');

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
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (path: string, cookies: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/api/v1/creators/${path}`, cookies });

  it('serves an approved creator without a session, with only public fields', async () => {
    const res = await get('public-spec-approved');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    expect(res.headers['set-cookie']).toBeUndefined();
    const body = res.json<Record<string, unknown>>();
    expect(Object.keys(body).sort()).toEqual(
      ['avatarUrl', 'bannerUrl', 'bio', 'category', 'displayName', 'slug'].sort(),
    );
    expect(creatorProfileResponseSchema.parse(body)).toEqual({
      slug: 'public-spec-approved',
      displayName: 'Public Approved',
      bio: 'Halo!',
      category: 'Musik',
      avatarUrl: `/api/v1/creators/public-spec-approved/images/${AVATAR_ID}`,
      bannerUrl: null,
    });
  });

  it('matches the slug case-insensitively and ignores a session cookie', async () => {
    const upper = await get('Public-Spec-Approved');
    expect(upper.statusCode).toBe(200);
    const withCookie = await get('public-spec-approved', {
      influency_session: 'public-profile-spec',
    });
    expect(withCookie.json()).toEqual(upper.json());
  });

  it('returns the same 404 for unknown, pending, rejected and suspended creators', async () => {
    const bodies = [];
    for (const slug of [
      'public-spec-pending',
      'public-spec-rejected',
      'public-spec-suspended',
      'nobody-here',
    ]) {
      const res = await get(slug);
      expect(res.statusCode).toBe(404);
      const error = errorResponseSchema.parse(res.json()).error;
      bodies.push({ ...error, requestId: undefined });
    }
    expect(bodies[0]).toMatchObject({ code: 'NOT_FOUND' });
    for (const body of bodies) expect(body).toEqual(bodies[0]);
  });

  it("hides a suspended creator's images but serves an approved one's", async () => {
    expect((await get(`public-spec-approved/images/${AVATAR_ID}`)).statusCode).toBe(200);
    expect((await get(`public-spec-suspended/images/${SUSPENDED_AVATAR_ID}`)).statusCode).toBe(404);
  });

  it('does not shadow GET /creators/me', async () => {
    expect((await get('me')).statusCode).toBe(401);
  });
});
