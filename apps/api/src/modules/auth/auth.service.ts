import { Inject, Injectable, Logger } from '@nestjs/common';
import { type LoginErrorCode, type MeResponse, type Role, safeReturnTo } from '@influency/shared';
import { sha256hex } from '../../common/crypto.js';
import { DEMO_USER_IDS } from '../../common/demo-ids.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import {
  OidcError,
  pkceChallenge,
  randomToken,
  TELEGRAM_OIDC_CLIENT,
  type TelegramOidcClient,
  type VerifiedTelegramIdentity,
} from './telegram-oidc.client.js';

const ATTEMPT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_DISPLAY_NAME = 'Pengguna Telegram';

export type LoginResult =
  | { ok: true; sessionToken: string; returnTo: string }
  | { ok: false; code: LoginErrorCode; returnTo?: string };

export interface CallbackInput {
  code?: string;
  state?: string;
  error?: string;
  bindingToken?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(TELEGRAM_OIDC_CLIENT) private readonly oidc: TelegramOidcClient,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Creates a single-use login attempt; `bindingToken` goes in a cookie to tie it to this browser.
   * `returnTo` is stored server-side so nothing coming back from Telegram can change it.
   */
  async startLogin(returnTo: string): Promise<{ redirectUrl: string; bindingToken: string }> {
    const state = randomToken();
    const nonce = randomToken();
    const codeVerifier = randomToken();
    const bindingToken = randomToken();
    await this.prisma.oidcLoginAttempt.create({
      data: {
        state,
        nonce,
        codeVerifier,
        browserBindingHash: sha256hex(bindingToken),
        expiresAt: new Date(Date.now() + ATTEMPT_TTL_MS),
        returnTo: safeReturnTo(returnTo),
      },
    });
    const redirectUrl = this.oidc.authorizationUrl({
      state,
      nonce,
      codeChallenge: pkceChallenge(codeVerifier),
    });
    return { redirectUrl, bindingToken };
  }

  /** Never throws for expected failures; a failure creates no session. */
  async completeLogin(input: CallbackInput): Promise<LoginResult> {
    const fail = (code: LoginErrorCode, reason: string, returnTo?: string): LoginResult => {
      this.logger.warn(`telegram login failed: ${reason}`);
      return { ok: false, code, returnTo };
    };
    if (!input.state || !input.bindingToken) {
      return fail('login_failed', 'missing_state_or_binding');
    }

    // Atomic consume: rejects unknown, replayed, expired and other-browser state in one statement.
    const now = new Date();
    const { count } = await this.prisma.oidcLoginAttempt.updateMany({
      where: {
        state: input.state,
        browserBindingHash: sha256hex(input.bindingToken),
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: { consumedAt: now },
    });
    if (count !== 1) return fail('login_failed', 'attempt_invalid');
    const attempt = await this.prisma.oidcLoginAttempt.findUniqueOrThrow({
      where: { state: input.state },
    });

    // From here on failures keep the trusted return path, so a retry lands on the same page.
    const { returnTo } = attempt;
    if (input.error) {
      return input.error === 'access_denied'
        ? fail('login_cancelled', 'access_denied', returnTo)
        : fail('login_failed', 'provider_error', returnTo);
    }
    if (!input.code) return fail('login_failed', 'missing_code', returnTo);

    let identity: VerifiedTelegramIdentity;
    try {
      const idToken = await this.oidc.exchangeCode({
        code: input.code,
        codeVerifier: attempt.codeVerifier,
      });
      identity = await this.oidc.verifyIdToken(idToken, attempt.nonce);
    } catch (error) {
      if (error instanceof OidcError) return fail('login_failed', error.reason, returnTo);
      throw error;
    }

    const userId = await this.findOrCreateUser(identity);
    return { ok: true, sessionToken: await this.createSession(userId), returnTo };
  }

  /**
   * Dev only: a session for a seeded demo user, skipping Telegram. The caller refuses in production.
   * NOT_FOUND for an unknown key or an unseeded user (run `pnpm db:seed`).
   */
  async devLogin(user: string): Promise<string> {
    const userId = Object.hasOwn(DEMO_USER_IDS, user)
      ? DEMO_USER_IDS[user as keyof typeof DEMO_USER_IDS]
      : undefined;
    if (!userId || !(await this.prisma.user.findUnique({ where: { id: userId } }))) {
      throw new DomainError('NOT_FOUND');
    }
    return this.createSession(userId);
  }

  /** Revokes the session for this cookie token, if any. Never throws for unknown/expired/revoked tokens. */
  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    // `revokedAt: null` keeps the first revocation time on a repeat logout.
    await this.prisma.session.updateMany({
      where: { tokenHash: sha256hex(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Current user + roles from the DB (never from Telegram claims): USER always, CREATOR if APPROVED, ADMIN if granted. */
  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        displayName: true,
        authIdentities: { where: { provider: 'TELEGRAM' }, select: { username: true }, take: 1 },
        roles: { select: { role: true } },
        creatorProfile: { select: { status: true } },
      },
    });
    const roles: Role[] = ['USER'];
    if (user.creatorProfile?.status === 'APPROVED') roles.push('CREATOR');
    if (user.roles.some((r) => r.role === 'ADMIN')) roles.push('ADMIN');
    return {
      id: user.id,
      displayName: user.displayName,
      username: user.authIdentities[0]?.username ?? null,
      roles,
    };
  }

  /** Returns the cookie token; only its hash is stored. */
  private async createSession(userId: string): Promise<string> {
    const sessionToken = randomToken();
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256hex(sessionToken),
        expiresAt: new Date(Date.now() + this.env.SESSION_TTL_DAYS * 86_400_000),
      },
    });
    return sessionToken;
  }

  /** Matches by (TELEGRAM, sub) only, never by name or username. */
  private async findOrCreateUser({
    sub,
    name,
    username,
  }: VerifiedTelegramIdentity): Promise<string> {
    const where = { provider_providerSub: { provider: 'TELEGRAM', providerSub: sub } } as const;
    const existing = await this.prisma.authIdentity.findUnique({ where });
    if (existing) {
      // Telegram usernames change; keep the display copy current (null clears it).
      if (existing.username !== username) {
        await this.prisma.authIdentity.update({ where: { id: existing.id }, data: { username } });
      }
      return existing.userId;
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { displayName: name?.trim() || DEFAULT_DISPLAY_NAME },
        });
        await tx.authIdentity.create({
          data: { userId: user.id, provider: 'TELEGRAM', providerSub: sub, username },
        });
        return user.id;
      });
    } catch (error) {
      // Concurrent first login for the same sub: the other request won, so use its user.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return (await this.prisma.authIdentity.findUniqueOrThrow({ where })).userId;
      }
      throw error;
    }
  }
}
