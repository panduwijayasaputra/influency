import { createHash, randomBytes } from 'node:crypto';
import { errors as joseErrors, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { z } from 'zod';

// Endpoints from https://oauth.telegram.org/.well-known/openid-configuration (checked 2026-11-03).
export const TELEGRAM_ISSUER = 'https://oauth.telegram.org';
export const TELEGRAM_AUTH_URL = `${TELEGRAM_ISSUER}/auth`;
export const TELEGRAM_TOKEN_URL = `${TELEGRAM_ISSUER}/token`;
export const TELEGRAM_JWKS_URL = `${TELEGRAM_ISSUER}/.well-known/jwks.json`;
// Algorithms BotFather can pick for the Login Widget (RS256 is the default).
const ALGORITHMS = ['RS256', 'ES256', 'EdDSA'];

/** Injection token for the `TelegramOidcClient` (tests override it with a fake provider). */
export const TELEGRAM_OIDC_CLIENT = Symbol('TELEGRAM_OIDC_CLIENT');

export interface TelegramOidcConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TelegramOidcDeps {
  fetch: typeof fetch;
  jwks: JWTVerifyGetKey;
  now?: () => Date;
}

export interface VerifiedTelegramIdentity {
  sub: string;
  name: string | null;
  /** Telegram username (`profile` scope); null when absent or malformed. Display only. */
  username: string | null;
}

/** An expected login failure. `reason` is English, safe to log, and never contains tokens. */
export class OidcError extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

const tokenResponseSchema = z.object({ id_token: z.string().min(1) });
const claimsSchema = z.object({
  sub: z.string().min(1),
  nonce: z.string(),
  name: z.string().optional(),
  // A missing or odd username must never fail login: drop it instead.
  preferred_username: z
    .string()
    .regex(/^[A-Za-z0-9_]{1,64}$/)
    .optional()
    .catch(undefined),
});

/** base64url(sha256(verifier)): the PKCE S256 challenge (RFC 7636). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

/** 256-bit random token, base64url. Used for state, nonce, PKCE verifier and cookies. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Telegram Login OIDC (Authorization Code + PKCE). No UserInfo endpoint: claims come from the ID token. */
export class TelegramOidcClient {
  constructor(
    private readonly config: TelegramOidcConfig,
    private readonly deps: TelegramOidcDeps,
  ) {}

  authorizationUrl(params: { state: string; nonce: string; codeChallenge: string }): string {
    const query = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'openid profile',
      state: params.state,
      nonce: params.nonce,
      code_challenge: params.codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${TELEGRAM_AUTH_URL}?${query.toString()}`;
  }

  /** Exchanges the code server-side (Basic auth with the client secret); returns the ID token only. */
  async exchangeCode(params: { code: string; codeVerifier: string }): Promise<string> {
    const basic = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      'base64',
    );
    let res: Response;
    try {
      res = await this.deps.fetch(TELEGRAM_TOKEN_URL, {
        method: 'POST',
        headers: {
          authorization: `Basic ${basic}`,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: params.code,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
          code_verifier: params.codeVerifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new OidcError('token_exchange_unreachable');
    }
    if (!res.ok) throw new OidcError(`token_exchange_failed: ${res.status}`);
    const parsed = tokenResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new OidcError('token_response_invalid');
    return parsed.data.id_token;
  }

  /** Verifies signature (JWKS), issuer, audience, exp/iat and nonce. */
  async verifyIdToken(idToken: string, expectedNonce: string): Promise<VerifiedTelegramIdentity> {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(idToken, this.deps.jwks, {
        issuer: TELEGRAM_ISSUER,
        audience: this.config.clientId,
        algorithms: ALGORITHMS,
        maxTokenAge: '10m',
        clockTolerance: 30,
        currentDate: this.deps.now?.(),
      }));
    } catch (error) {
      throw new OidcError(
        `id_token_invalid: ${error instanceof joseErrors.JOSEError ? error.code : 'unknown'}`,
      );
    }
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) throw new OidcError('id_token_claims_invalid');
    if (claims.data.nonce !== expectedNonce) throw new OidcError('id_token_nonce_mismatch');
    return {
      sub: claims.data.sub,
      name: claims.data.name ?? null,
      username: claims.data.preferred_username ?? null,
    };
  }
}
