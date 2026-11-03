import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import type { FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../app.factory.js';
import { CommonModule } from './common.module.js';
import { sha256hex } from './crypto.js';
import { SessionGuard } from './session.guard.js';

@Controller('test-session')
class ProbeController {
  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() req: FastifyRequest) {
    return req.authSession;
  }

  @Post('mutate')
  @HttpCode(200)
  mutate() {
    return { ok: true };
  }

  @Get('read')
  read() {
    return { ok: true };
  }
}

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const ACTIVE_USER = '0190a000-0000-7000-8000-0000000a0001';
const SUSPENDED_USER = '0190a000-0000-7000-8000-0000000a0002';
const TOKENS = {
  live: 'guard-spec-live-token',
  expired: 'guard-spec-expired-token',
  revoked: 'guard-spec-revoked-token',
  suspended: 'guard-spec-suspended-token',
};
const WEB_ORIGIN = 'http://localhost:3000';

describe('SessionGuard + CsrfGuard', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let liveSessionId: string;

  beforeAll(async () => {
    const day = 86_400_000;
    await prisma.user.createMany({
      data: [
        { id: ACTIVE_USER, displayName: 'Guard Active' },
        { id: SUSPENDED_USER, displayName: 'Guard Suspended', status: 'SUSPENDED' },
      ],
    });
    const session = (token: string, userId: string, extra: object = {}) => ({
      userId,
      tokenHash: sha256hex(token),
      expiresAt: new Date(Date.now() + day),
      ...extra,
    });
    liveSessionId = (await prisma.session.create({ data: session(TOKENS.live, ACTIVE_USER) })).id;
    await prisma.session.createMany({
      data: [
        session(TOKENS.expired, ACTIVE_USER, { expiresAt: new Date(Date.now() - 1000) }),
        session(TOKENS.revoked, ACTIVE_USER, { revokedAt: new Date() }),
        session(TOKENS.suspended, SUSPENDED_USER),
      ],
    });

    const moduleRef = await Test.createTestingModule({
      imports: [CommonModule],
      controllers: [ProbeController],
    }).compile();
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
    const userIds = [ACTIVE_USER, SUSPENDED_USER];
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const me = (token?: string) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/test-session/me',
      cookies: token ? { influency_session: token } : {},
    });

  const codeOf = (res: { json: () => unknown }) => errorResponseSchema.parse(res.json()).error.code;

  describe('SessionGuard', () => {
    it('accepts a live session and exposes only its ids', async () => {
      const res = await me(TOKENS.live);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ sessionId: liveSessionId, userId: ACTIVE_USER });
      expect(res.body).not.toContain(TOKENS.live);
    });

    it.each([
      ['no cookie', undefined],
      ['unknown token', 'not-a-real-token'],
      ['expired session', TOKENS.expired],
      ['revoked session', TOKENS.revoked],
      ['suspended user', TOKENS.suspended],
    ])('rejects %s with 401 AUTH_REQUIRED', async (_label, token) => {
      const res = await me(token);
      expect(res.statusCode).toBe(401);
      expect(codeOf(res)).toBe('AUTH_REQUIRED');
    });
  });

  describe('CsrfGuard', () => {
    const mutate = (headers: Record<string, string>, withCookie = true) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/test-session/mutate',
        headers,
        cookies: withCookie ? { influency_session: TOKENS.live } : {},
      });

    it('allows a cookie-authenticated mutation from the web origin', async () => {
      expect((await mutate({ origin: WEB_ORIGIN })).statusCode).toBe(200);
    });

    it.each([
      ['no Origin', {}],
      ['a foreign Origin', { origin: 'https://evil.example' }],
      ['Origin: null', { origin: 'null' }],
      ['a look-alike Origin', { origin: `${WEB_ORIGIN}.evil.example` }],
    ])(
      'rejects a cookie-authenticated mutation with %s (403 FORBIDDEN)',
      async (_label, headers) => {
        const res = await mutate(headers);
        expect(res.statusCode).toBe(403);
        expect(codeOf(res)).toBe('FORBIDDEN');
      },
    );

    it('does not check mutations without the session cookie (e.g. webhooks)', async () => {
      expect((await mutate({}, false)).statusCode).toBe(200);
    });

    it('does not check safe methods', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/test-session/read',
        headers: { origin: 'https://evil.example' },
        cookies: { influency_session: TOKENS.live },
      });
      expect(res.statusCode).toBe(200);
    });
  });
});
