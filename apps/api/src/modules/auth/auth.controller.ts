import { Controller, Get, Header, Inject, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  API_PREFIX,
  type LoginErrorCode,
  type MeResponse,
  safeReturnTo,
  SESSION_COOKIE,
} from '@influency/shared';
import { z } from 'zod';
import { ENV, type Env } from '../../common/env.js';
import { DomainError } from '../../common/domain-error.js';
import { SessionGuard } from '../../common/session.guard.js';
import { AuthService } from './auth.service.js';

const BINDING_COOKIE = 'influency_oidc';
const BINDING_COOKIE_PATH = `/${API_PREFIX}/auth/telegram`;

// Lenient: a malformed callback becomes a failed-login redirect, never a JSON 400 page.
const callbackQuerySchema = z.object({
  code: z.string().max(2048).optional().catch(undefined),
  state: z.string().max(256).optional().catch(undefined),
  error: z.string().max(256).optional().catch(undefined),
});

function loginErrorLocation(code: LoginErrorCode, returnTo?: string): string {
  const params = new URLSearchParams({ error: code });
  if (returnTo && returnTo !== '/') params.set('returnTo', returnTo);
  return `/login?${params.toString()}`;
}

@Controller('auth')
export class AuthController {
  private readonly production: boolean;
  private readonly secure: boolean;
  private readonly sessionMaxAge: number;
  // Shared by set and clear so the browser matches (and deletes) the same cookie.
  private readonly sessionCookie: {
    httpOnly: true;
    sameSite: 'lax';
    secure: boolean;
    path: '/';
  };

  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) env: Env,
  ) {
    this.production = env.NODE_ENV === 'production';
    this.secure = env.WEB_ORIGIN.startsWith('https:');
    this.sessionMaxAge = env.SESSION_TTL_DAYS * 86_400;
    this.sessionCookie = { httpOnly: true, sameSite: 'lax', secure: this.secure, path: '/' };
  }

  /** Public. Starts Telegram login; an unsafe or missing `returnTo` becomes `/` (never a 400). */
  @Get('telegram/start')
  async start(@Query('returnTo') returnTo: unknown, @Res() reply: FastifyReply): Promise<void> {
    const { redirectUrl, bindingToken } = await this.auth.startLogin(safeReturnTo(returnTo));
    void reply
      .header('cache-control', 'no-store')
      .setCookie(BINDING_COOKIE, bindingToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: this.secure,
        path: BINDING_COOKIE_PATH,
        maxAge: 600,
      })
      .redirect(redirectUrl, 302);
  }

  /**
   * Public. Ends on the attempt's `returnTo` with a session cookie, or `/login?error=…[&returnTo=…]` without one.
   * Redirects are relative so they resolve against the web origin (via its /api/v1 rewrite).
   */
  @Get('telegram/callback')
  async callback(
    @Query() query: unknown,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const parsed = callbackQuerySchema.safeParse(query);
    const result = await this.auth.completeLogin({
      ...(parsed.success ? parsed.data : {}),
      bindingToken: req.cookies[BINDING_COOKIE],
    });
    void reply
      .header('cache-control', 'no-store')
      .clearCookie(BINDING_COOKIE, { path: BINDING_COOKIE_PATH });
    if (!result.ok) {
      void reply.redirect(loginErrorLocation(result.code, result.returnTo), 302);
      return;
    }
    void reply
      .setCookie(SESSION_COOKIE, result.sessionToken, {
        ...this.sessionCookie,
        maxAge: this.sessionMaxAge,
      })
      .redirect(result.returnTo, 302);
  }

  /**
   * Dev only (404 in production): logs in as a seeded demo user (`?user=claudia|creatorB|subscriberA|subscriberB|admin`)
   * and redirects to `returnTo`. GET so the /login page can link to it; login CSRF is acceptable outside production.
   */
  @Get('dev/login')
  async devLogin(
    @Query('user') user: unknown,
    @Query('returnTo') returnTo: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (this.production || typeof user !== 'string') throw new DomainError('NOT_FOUND');
    const sessionToken = await this.auth.devLogin(user);
    void reply
      .header('cache-control', 'no-store')
      .setCookie(SESSION_COOKIE, sessionToken, {
        ...this.sessionCookie,
        maxAge: this.sessionMaxAge,
      })
      .redirect(safeReturnTo(returnTo), 302);
  }

  /** Current user and roles, read from the DB on every call (never from Telegram claims). */
  @Get('me')
  @UseGuards(SessionGuard)
  @Header('cache-control', 'no-store')
  me(@Req() req: FastifyRequest): Promise<MeResponse> {
    return this.auth.me(req.authSession!.userId);
  }

  /**
   * Idempotent: always 204 with a cleared cookie; revokes the session if the cookie names a live one.
   * CsrfGuard (global) requires `Origin: WEB_ORIGIN` when the session cookie is sent.
   */
  @Post('logout')
  async logout(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    await this.auth.logout(req.cookies[SESSION_COOKIE]);
    void reply
      .header('cache-control', 'no-store')
      .clearCookie(SESSION_COOKIE, this.sessionCookie)
      .status(204)
      .send();
  }
}
