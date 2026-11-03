import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { errorResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeTelegram, type FakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { TELEGRAM_OIDC_CLIENT } from './telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';

describe('POST /auth/logout', () => {
  const prisma = createTestPrisma();
  const subs: string[] = [];
  let app: NestFastifyApplication;
  let fake: FakeTelegram;

  beforeAll(async () => {
    fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
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
    const identities = await prisma.authIdentity.findMany({ where: { providerSub: { in: subs } } });
    const userIds = identities.map((i) => i.userId);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /** Logs in through the real start/callback flow and returns the session cookie value. */
  async function login(sub = `itest-${randomUUID()}`): Promise<string> {
    subs.push(sub);
    const start = await app.inject({ method: 'GET', url: '/api/v1/auth/telegram/start' });
    const location = new URL(String(start.headers.location));
    const binding = start.cookies.find((c) => c.name === 'influency_oidc')!.value;
    const code = `code-${randomUUID()}`;
    fake.tokensByCode.set(
      code,
      await fake.signIdToken({ sub, nonce: location.searchParams.get('nonce') }),
    );
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/telegram/callback',
      query: { code, state: location.searchParams.get('state')! },
      cookies: { influency_oidc: binding },
    });
    return res.cookies.find((c) => c.name === 'influency_session')!.value;
  }

  const me = (token: string) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { influency_session: token },
    });

  const logout = (token?: string, headers: Record<string, string> = { origin: WEB_ORIGIN }) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers,
      cookies: token ? { influency_session: token } : {},
    });

  const sessionOf = (token: string) =>
    prisma.session.findUniqueOrThrow({ where: { tokenHash: sha256hex(token) } });

  function expectClearedCookie(res: Awaited<ReturnType<typeof logout>>) {
    expect(res.statusCode).toBe(204);
    expect(res.headers['cache-control']).toBe('no-store');
    const cookie = res.cookies.find((c) => c.name === 'influency_session')!;
    expect(cookie).toMatchObject({ value: '', path: '/', httpOnly: true, sameSite: 'Lax' });
    expect(cookie.expires!.getTime()).toBeLessThanOrEqual(Date.now());
  }

  it('revokes the session server-side so the old cookie no longer works', async () => {
    const token = await login();
    expect((await me(token)).statusCode).toBe(200);

    const res = await logout(token);
    expectClearedCookie(res);
    expect((await sessionOf(token)).revokedAt).not.toBeNull();

    const after = await me(token);
    expect(after.statusCode).toBe(401);
    expect(errorResponseSchema.parse(after.json()).error.code).toBe('AUTH_REQUIRED');
  });

  it('revokes only the current session, not the user’s other sessions', async () => {
    const sub = `itest-${randomUUID()}`;
    const a = await login(sub);
    const b = await login(sub);

    await logout(a);
    expect((await me(a)).statusCode).toBe(401);
    expect((await me(b)).statusCode).toBe(200);
  });

  it('is idempotent without a cookie (no Origin needed: nothing to protect)', async () => {
    expectClearedCookie(await logout(undefined, {}));
  });

  it('is idempotent for an unknown token', async () => {
    expectClearedCookie(await logout('not-a-real-token'));
  });

  it('keeps the first revocation time on a repeat logout', async () => {
    const token = await login();
    await logout(token);
    const first = (await sessionOf(token)).revokedAt;

    expectClearedCookie(await logout(token));
    expect((await sessionOf(token)).revokedAt).toEqual(first);
  });

  it.each([
    ['no Origin', {}],
    ['a foreign Origin', { origin: 'https://evil.example' }],
  ])('rejects a cross-site logout with %s (CSRF) and keeps the session', async (_l, headers) => {
    const token = await login();
    const res = await logout(token, headers);

    expect(res.statusCode).toBe(403);
    expect(errorResponseSchema.parse(res.json()).error.code).toBe('FORBIDDEN');
    expect((await sessionOf(token)).revokedAt).toBeNull();
    expect((await me(token)).statusCode).toBe(200);
  });

  it('only accepts POST', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/logout' });
    expect(res.statusCode).toBe(404);
  });
});
