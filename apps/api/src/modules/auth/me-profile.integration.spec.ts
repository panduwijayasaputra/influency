import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { errorResponseSchema, meResponseSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { TELEGRAM_OIDC_CLIENT } from './telegram-oidc.client.js';

const ORIGIN = 'http://localhost:3000';

describe('PATCH /me/profile', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;

  beforeAll(async () => {
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
    await prisma.$disconnect();
  });

  async function newUser() {
    const user = await prisma.user.create({
      data: { displayName: 'Profile spec', bio: 'old bio' },
    });
    const token = `prof-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 864e5),
      },
    });
    return { id: user.id, token };
  }
  const patch = (token: string | undefined, payload: unknown, origin = ORIGIN) =>
    app.inject({
      method: 'PATCH',
      url: '/api/v1/me/profile',
      cookies: token ? { [SESSION_COOKIE]: token } : {},
      headers: { origin },
      payload: payload as object,
    });
  const row = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

  it('rejects a guest with 401', async () => {
    expect((await patch(undefined, { displayName: 'A', bio: '' })).statusCode).toBe(401);
  });

  it('updates name and bio, trims, and returns the /auth/me shape (uncached)', async () => {
    const u = await newUser();
    const res = await patch(u.token, { displayName: '  Bima S  ', bio: '  Hai semua  ' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(meResponseSchema.parse(res.json())).toMatchObject({
      id: u.id,
      displayName: 'Bima S',
      bio: 'Hai semua',
    });
    const stored = await row(u.id);
    expect([stored.displayName, stored.bio]).toEqual(['Bima S', 'Hai semua']);
  });

  it('clears the bio with an empty string', async () => {
    const u = await newUser();
    const res = await patch(u.token, { displayName: 'Bima', bio: '   ' });
    expect(res.json()).toMatchObject({ bio: null });
    expect((await row(u.id)).bio).toBeNull();
  });

  it.each([
    ['empty name', { displayName: ' ', bio: '' }],
    ['61-character name', { displayName: 'x'.repeat(61), bio: '' }],
    ['501-character bio', { displayName: 'Bima', bio: 'x'.repeat(501) }],
    ['missing bio', { displayName: 'Bima' }],
  ])('rejects %s with 400 and changes nothing', async (_label, payload) => {
    const u = await newUser();
    const res = await patch(u.token, payload);
    expect(res.statusCode).toBe(400);
    expect(errorResponseSchema.parse(res.json()).error.code).toBe('VALIDATION_FAILED');
    expect((await row(u.id)).displayName).toBe('Profile spec');
  });

  it.each([
    { roles: ['ADMIN'] },
    { username: 'hacker' },
    { status: 'SUSPENDED' },
    { id: randomUUID() },
  ])('rejects extra field %j (strict) and changes nothing', async (extra) => {
    const u = await newUser();
    const res = await patch(u.token, { displayName: 'Hacked', bio: '', ...extra });
    expect(res.statusCode).toBe(400);
    const stored = await row(u.id);
    expect([stored.displayName, stored.status]).toEqual(['Profile spec', 'ACTIVE']);
    expect(await prisma.userRole.count({ where: { userId: u.id } })).toBe(0);
  });

  it("never touches another user's row", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await patch(a.token, { displayName: 'Only A', bio: 'a' });
    const other = await row(b.id);
    expect([other.displayName, other.bio]).toEqual(['Profile spec', 'old bio']);
  });

  it('leaves an approved creator public name alone', async () => {
    const u = await newUser();
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: u.id,
        slug: `prof-${randomUUID().slice(0, 8)}`,
        status: 'APPROVED',
        ...profileFields('Public Name'),
      },
    });
    await patch(u.token, { displayName: 'Account Name', bio: '' });
    const after = await prisma.creatorProfile.findUniqueOrThrow({ where: { id: profile.id } });
    expect(after.displayName).toBe(profile.displayName);
    expect((await row(u.id)).displayName).toBe('Account Name');
  });

  it('is rejected by the CSRF guard without the web Origin', async () => {
    const u = await newUser();
    const res = await patch(u.token, { displayName: 'Evil', bio: '' }, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect((await row(u.id)).displayName).toBe('Profile spec');
  });
});
