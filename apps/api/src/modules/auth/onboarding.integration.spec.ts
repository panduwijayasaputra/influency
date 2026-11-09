import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { TELEGRAM_OIDC_CLIENT } from './telegram-oidc.client.js';

const ORIGIN = 'http://localhost:3000';

describe('POST /me/onboarding/complete', () => {
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
    const user = await prisma.user.create({ data: { displayName: 'Onboarding spec' } });
    const token = `onb-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 864e5),
      },
    });
    return { id: user.id, token };
  }
  const post = (token?: string, headers: Record<string, string> = { origin: ORIGIN }) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/me/onboarding/complete',
      cookies: token ? { [SESSION_COOKIE]: token } : {},
      headers,
    });
  const me = async (token: string) =>
    (
      await app.inject({
        method: 'GET',
        url: '/api/v1/auth/me',
        cookies: { [SESSION_COOKIE]: token },
      })
    ).json<{ onboardingCompleted: boolean }>();
  const storedAt = async (id: string) =>
    (
      await prisma.$queryRaw<
        { ms: bigint | null }[]
      >`SELECT (extract(epoch FROM onboarding_completed_at) * 1000)::bigint AS ms FROM users WHERE id = ${id}::uuid`
    )[0]!.ms;

  it('rejects a guest with 401', async () => {
    expect((await post()).statusCode).toBe(401);
  });

  it('marks the caller done (204, uncached) and /auth/me reflects it', async () => {
    const u = await newUser();
    expect((await me(u.token)).onboardingCompleted).toBe(false);
    const res = await post(u.token);
    expect(res.statusCode).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    expect((await me(u.token)).onboardingCompleted).toBe(true);
    expect(await storedAt(u.id)).not.toBeNull();
  });

  it('is idempotent and keeps the first time', async () => {
    const u = await newUser();
    await post(u.token);
    const first = await storedAt(u.id);
    await new Promise((r) => setTimeout(r, 15));
    expect((await post(u.token)).statusCode).toBe(204);
    expect(await storedAt(u.id)).toBe(first);
  });

  it("does not touch another user's flag", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await post(a.token);
    expect((await me(b.token)).onboardingCompleted).toBe(false);
    expect(await storedAt(b.id)).toBeNull();
  });

  it('is rejected by the CSRF guard without the web Origin', async () => {
    const u = await newUser();
    const res = await post(u.token, { origin: 'https://evil.example' });
    expect(res.statusCode).toBe(403);
    expect((await me(u.token)).onboardingCompleted).toBe(false);
  });

  it('is also marked by submitting a creator application', async () => {
    const u = await newUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/creators/apply',
      cookies: { [SESSION_COOKIE]: u.token },
      headers: { origin: ORIGIN },
      payload: {
        displayName: 'Onb Creator',
        slug: `onb-${randomUUID().slice(0, 8)}`,
        acceptAgreement: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect((await me(u.token)).onboardingCompleted).toBe(true);
  });

  it('a rejected applicant resubmitting keeps the flag set', async () => {
    const u = await newUser();
    await prisma.creatorProfile.create({
      data: {
        userId: u.id,
        slug: `onb-r-${randomUUID().slice(0, 6)}`,
        status: 'REJECTED',
        ...profileFields(),
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/creators/apply',
      cookies: { [SESSION_COOKIE]: u.token },
      headers: { origin: ORIGIN },
      payload: {
        displayName: 'Again',
        slug: `onb-s-${randomUUID().slice(0, 6)}`,
        acceptAgreement: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect((await me(u.token)).onboardingCompleted).toBe(true);
  });
});
