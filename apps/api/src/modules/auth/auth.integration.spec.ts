import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { generateKeyPair } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeTelegram,
  FAKE_TELEGRAM_CONFIG,
  type FakeTelegram,
} from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';
import { TELEGRAM_OIDC_CLIENT } from './telegram-oidc.client.js';

type Res = Awaited<ReturnType<NestFastifyApplication['inject']>>;

function expectExpiresInDays(expiresAt: Date, days: number) {
  expect(Math.abs(expiresAt.getTime() - (Date.now() + days * 86_400_000))).toBeLessThan(60_000);
}

describe('Telegram login (start + callback)', () => {
  const prisma = createTestPrisma();
  const subs: string[] = [];
  let app: NestFastifyApplication;
  let fake: FakeTelegram;

  beforeAll(async () => {
    fake = await createFakeTelegram();
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
    const identities = await prisma.authIdentity.findMany({ where: { providerSub: { in: subs } } });
    const userIds = identities.map((i) => i.userId);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  beforeEach(() => {
    fake.nextToken = null;
    fake.tokenStatus = 200;
    fake.tokensByCode.clear();
  });

  const newSub = () => {
    const sub = `itest-${randomUUID()}`;
    subs.push(sub);
    return sub;
  };

  async function start(query: Record<string, string | string[]> = {}) {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/telegram/start', query });
    const location = new URL(String(res.headers.location));
    const binding = res.cookies.find((c) => c.name === 'influency_oidc');
    return {
      res,
      location,
      state: location.searchParams.get('state')!,
      nonce: location.searchParams.get('nonce')!,
      binding: binding!.value,
    };
  }

  function callback(query: Record<string, string>, binding?: string): Promise<Res> {
    return app.inject({
      method: 'GET',
      url: '/api/v1/auth/telegram/callback',
      query,
      cookies: binding === undefined ? {} : { influency_oidc: binding },
    });
  }

  /** Full login: start, then callback with a token Telegram would sign for this attempt. */
  async function login(sub: string, claims: Record<string, unknown> = {}) {
    const attempt = await start();
    const code = `code-${randomUUID()}`;
    fake.tokensByCode.set(code, await fake.signIdToken({ sub, nonce: attempt.nonce, ...claims }));
    return callback({ code, state: attempt.state }, attempt.binding);
  }

  const sessionCookie = (res: Res) => res.cookies.find((c) => c.name === 'influency_session');
  const userIdOf = async (sub: string) =>
    (
      await prisma.authIdentity.findUnique({
        where: { provider_providerSub: { provider: 'TELEGRAM', providerSub: sub } },
      })
    )?.userId;

  function expectFailed(res: Res, code = 'login_failed') {
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`/login?error=${code}`);
    expect(sessionCookie(res)).toBeUndefined();
    // The single-use binding cookie is always cleared.
    expect(res.cookies.find((c) => c.name === 'influency_oidc')).toMatchObject({ value: '' });
  }

  it('start redirects to Telegram with S256 PKCE, state and nonce, and sets a binding cookie', async () => {
    const { res, location, state, nonce } = await start();

    expect(res.statusCode).toBe(302);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(location.origin + location.pathname).toBe('https://oauth.telegram.org/auth');
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(state).toMatch(/^[\w-]{43}$/);
    expect(nonce).toMatch(/^[\w-]{43}$/);

    const cookie = res.cookies.find((c) => c.name === 'influency_oidc')!;
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api/v1/auth/telegram',
      maxAge: 600,
    });

    const attempt = await prisma.oidcLoginAttempt.findUniqueOrThrow({ where: { state } });
    expect(attempt.browserBindingHash).toBe(sha256hex(cookie.value));
    expect(location.searchParams.get('code_challenge')).not.toBe(attempt.codeVerifier);
    expect(location.toString()).not.toContain(attempt.codeVerifier);
  });

  it('first login creates a user + identity + session and sets an HttpOnly session cookie', async () => {
    const sub = newSub();
    const res = await login(sub, { name: 'Claudia Andreya' });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/');
    const cookie = sessionCookie(res)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 2_592_000 });
    expect(cookie.secure).toBeFalsy(); // WEB_ORIGIN is http in tests

    const userId = await userIdOf(sub);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.displayName).toBe('Claudia Andreya');
    const sessions = await prisma.session.findMany({ where: { userId } });
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toBe(sha256hex(cookie.value));
    expect(sessions[0]!.tokenHash).not.toBe(cookie.value);
    // Default SESSION_TTL_DAYS = 30.
    expectExpiresInDays(sessions[0]!.expiresAt, 30);
  });

  it('uses a default display name when Telegram sends no name', async () => {
    const sub = newSub();
    await login(sub, { name: undefined });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: await userIdOf(sub) } });
    expect(user.displayName).toBe('Pengguna Telegram');
  });

  it('a returning user is matched by sub: same user, new session, name not overwritten', async () => {
    const sub = newSub();
    await login(sub, { name: 'First Name' });
    const userId = await userIdOf(sub);
    const res = await login(sub, { name: 'Changed Name' });

    expect(res.headers.location).toBe('/');
    expect(await prisma.authIdentity.count({ where: { providerSub: sub } })).toBe(1);
    expect(await prisma.session.count({ where: { userId } })).toBe(2);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).displayName).toBe(
      'First Name',
    );
  });

  it('never matches by name or username: same name, different sub → different users', async () => {
    const [a, b] = [newSub(), newSub()];
    await login(a, { name: 'Same', preferred_username: 'same' });
    await login(b, { name: 'Same', preferred_username: 'same' });
    expect(await userIdOf(a)).not.toBe(await userIdOf(b));
  });

  describe('rejects and creates no session', () => {
    it.each([
      ['wrong issuer', { iss: 'https://evil.example' }],
      ['wrong audience', { aud: '987654321' }],
      [
        'expired token',
        { iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 },
      ],
      ['mismatched nonce', { nonce: 'not-the-attempt-nonce' }],
    ])('%s', async (_label, claims) => {
      const sub = newSub();
      expectFailed(await login(sub, claims));
      expect(await userIdOf(sub)).toBeUndefined();
    });

    it('bad signature', async () => {
      const sub = newSub();
      const attempt = await start();
      const other = await generateKeyPair('RS256');
      fake.nextToken = await fake.signIdToken(
        { sub, nonce: attempt.nonce },
        { key: other.privateKey },
      );
      expectFailed(await callback({ code: 'c', state: attempt.state }, attempt.binding));
      expect(await userIdOf(sub)).toBeUndefined();
    });

    it('replayed state', async () => {
      const sub = newSub();
      const attempt = await start();
      fake.nextToken = await fake.signIdToken({ sub, nonce: attempt.nonce });
      const first = await callback({ code: 'c', state: attempt.state }, attempt.binding);
      expect(first.headers.location).toBe('/');
      const sessionsBefore = await prisma.session.count();

      expectFailed(await callback({ code: 'c', state: attempt.state }, attempt.binding));
      expect(await prisma.session.count()).toBe(sessionsBefore);
    });

    it('unknown state', async () => {
      const attempt = await start();
      fake.nextToken = await fake.signIdToken({ sub: newSub(), nonce: attempt.nonce });
      expectFailed(await callback({ code: 'c', state: 'unknown-state' }, attempt.binding));
    });

    it.each([
      ['missing binding cookie', undefined],
      ['binding cookie from another browser', 'someone-elses-binding'],
    ])('%s', async (_label, binding) => {
      const sub = newSub();
      const attempt = await start();
      fake.nextToken = await fake.signIdToken({ sub, nonce: attempt.nonce });
      expectFailed(await callback({ code: 'c', state: attempt.state }, binding));
      expect(await userIdOf(sub)).toBeUndefined();
    });

    it('expired attempt', async () => {
      const attempt = await start();
      await prisma.oidcLoginAttempt.update({
        where: { state: attempt.state },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      fake.nextToken = await fake.signIdToken({ sub: newSub(), nonce: attempt.nonce });
      expectFailed(await callback({ code: 'c', state: attempt.state }, attempt.binding));
    });

    it('token endpoint error', async () => {
      const attempt = await start();
      fake.tokenStatus = 500;
      expectFailed(await callback({ code: 'c', state: attempt.state }, attempt.binding));
    });

    it('missing code', async () => {
      const attempt = await start();
      expectFailed(await callback({ state: attempt.state }, attempt.binding));
    });

    it('malformed query (array params) fails as a redirect, not a 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/auth/telegram/callback?state=a&state=b&code=c',
      });
      expectFailed(res);
    });
  });

  it('cancelled login (access_denied) redirects with login_cancelled and burns the attempt', async () => {
    const attempt = await start();
    expectFailed(
      await callback({ error: 'access_denied', state: attempt.state }, attempt.binding),
      'login_cancelled',
    );
    const row = await prisma.oidcLoginAttempt.findUniqueOrThrow({
      where: { state: attempt.state },
    });
    expect(row.consumedAt).not.toBeNull();
  });

  it('other provider errors map to login_failed', async () => {
    const attempt = await start();
    expectFailed(await callback({ error: 'server_error', state: attempt.state }, attempt.binding));
  });

  it('never sends the client secret or the ID token to the browser', async () => {
    const attempt = await start();
    const idToken = await fake.signIdToken({ sub: newSub(), nonce: attempt.nonce });
    fake.nextToken = idToken;
    const res = await callback({ code: 'c', state: attempt.state }, attempt.binding);

    for (const r of [attempt.res, res]) {
      const raw = JSON.stringify(r.headers) + r.body;
      expect(raw).not.toContain(FAKE_TELEGRAM_CONFIG.clientSecret);
      expect(raw).not.toContain(idToken);
    }
  });

  describe('returnTo', () => {
    it('is stored on the attempt, not sent to Telegram, and is where login ends', async () => {
      const returnTo = '/kreator/posts/abc?x=1';
      const attempt = await start({ returnTo });
      const row = await prisma.oidcLoginAttempt.findUniqueOrThrow({
        where: { state: attempt.state },
      });
      expect(row.returnTo).toBe(returnTo);
      expect(attempt.location.toString()).not.toContain('kreator');

      fake.nextToken = await fake.signIdToken({ sub: newSub(), nonce: attempt.nonce });
      const res = await callback({ code: 'c', state: attempt.state }, attempt.binding);
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe(returnTo);
      expect(sessionCookie(res)).toBeDefined();
    });

    it('defaults to / when absent', async () => {
      const attempt = await start();
      const row = await prisma.oidcLoginAttempt.findUniqueOrThrow({
        where: { state: attempt.state },
      });
      expect(row.returnTo).toBe('/');
    });

    it.each([
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/login',
      '/kreator/€',
      ['/a', '/b'],
    ])('falls back to / for unsafe %j (no 400, no open redirect)', async (returnTo) => {
      const attempt = await start({ returnTo });
      expect(attempt.res.statusCode).toBe(302);
      const row = await prisma.oidcLoginAttempt.findUniqueOrThrow({
        where: { state: attempt.state },
      });
      expect(row.returnTo).toBe('/');

      fake.nextToken = await fake.signIdToken({ sub: newSub(), nonce: attempt.nonce });
      const res = await callback({ code: 'c', state: attempt.state }, attempt.binding);
      expect(res.headers.location).toBe('/');
    });

    it('is kept on /login after a cancelled login so a retry returns to the same page', async () => {
      const attempt = await start({ returnTo: '/kreator' });
      const res = await callback({ error: 'access_denied', state: attempt.state }, attempt.binding);
      expect(res.headers.location).toBe('/login?error=login_cancelled&returnTo=%2Fkreator');
      expect(sessionCookie(res)).toBeUndefined();
    });

    it('is kept on /login after a token exchange failure', async () => {
      const attempt = await start({ returnTo: '/kreator/posts/abc' });
      fake.tokenStatus = 500;
      const res = await callback({ code: 'c', state: attempt.state }, attempt.binding);
      expect(res.headers.location).toBe(
        '/login?error=login_failed&returnTo=%2Fkreator%2Fposts%2Fabc',
      );
    });

    it('is not used when the state is unknown (no trusted value)', async () => {
      const attempt = await start({ returnTo: '/kreator' });
      expectFailed(await callback({ code: 'c', state: 'unknown' }, attempt.binding));
    });
  });

  it('concurrent first logins for the same sub create exactly one user', async () => {
    const sub = newSub();
    const results = await Promise.all([login(sub), login(sub)]);

    expect(results.map((r) => r.headers.location)).toEqual(['/', '/']);
    expect(await prisma.authIdentity.count({ where: { providerSub: sub } })).toBe(1);
    expect(await prisma.session.count({ where: { userId: await userIdOf(sub) } })).toBe(2);
  });
});

describe('session cookie on an https origin with a custom lifetime', () => {
  const prisma = createTestPrisma();
  const sub = `itest-${randomUUID()}`;
  let app: NestFastifyApplication;
  let fake: FakeTelegram;

  beforeAll(async () => {
    fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(ENV)
      .useValue({
        ...parseEnv(process.env),
        WEB_ORIGIN: 'https://influency.test',
        SESSION_TTL_DAYS: 7,
      })
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
    const identity = await prisma.authIdentity.findMany({ where: { providerSub: sub } });
    const userIds = identity.map((i) => i.userId);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authIdentity.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it('marks the session cookie Secure and uses SESSION_TTL_DAYS for cookie and row', async () => {
    const startRes = await app.inject({ method: 'GET', url: '/api/v1/auth/telegram/start' });
    const location = new URL(String(startRes.headers.location));
    const binding = startRes.cookies.find((c) => c.name === 'influency_oidc')!;
    expect(binding.secure).toBe(true);
    fake.nextToken = await fake.signIdToken({ sub, nonce: location.searchParams.get('nonce') });

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/telegram/callback',
      query: { code: 'c', state: location.searchParams.get('state')! },
      cookies: { influency_oidc: binding.value },
    });

    expect(res.headers.location).toBe('/');
    const cookie = res.cookies.find((c) => c.name === 'influency_session')!;
    expect(cookie).toMatchObject({ httpOnly: true, secure: true, maxAge: 604_800 });
    const session = await prisma.session.findUniqueOrThrow({
      where: { tokenHash: sha256hex(cookie.value) },
    });
    expectExpiresInDays(session.expiresAt, 7);
  });
});
