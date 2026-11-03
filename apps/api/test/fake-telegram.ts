import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import {
  TELEGRAM_ISSUER,
  TelegramOidcClient,
  type TelegramOidcConfig,
} from '../src/modules/auth/telegram-oidc.client.js';

type KeyLike = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

export const FAKE_TELEGRAM_CONFIG: TelegramOidcConfig = {
  clientId: '123456789',
  clientSecret: 'test-client-secret',
  redirectUri: 'http://localhost:3000/api/v1/auth/telegram/callback',
};

/**
 * Stands in for oauth.telegram.org: a local signing key + JWKS and a stub token endpoint.
 * A token request returns `tokensByCode.get(code) ?? nextToken` (none → HTTP 400, or `tokenStatus`).
 */
export async function createFakeTelegram() {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
  const jwks = createLocalJWKSet({ keys: [jwk] });

  const fake = {
    jwks,
    requests: [] as { url: string; headers: Headers; body: URLSearchParams }[],
    nextToken: null as string | null,
    tokensByCode: new Map<string, string>(),
    tokenStatus: 200,

    /** Signs an ID token with valid defaults; `claims` overrides or removes (undefined) any claim. */
    async signIdToken(claims: Record<string, unknown>, opts: { key?: KeyLike } = {}) {
      const now = Math.floor(Date.now() / 1000);
      const payload = Object.fromEntries(
        Object.entries({
          iss: TELEGRAM_ISSUER,
          aud: FAKE_TELEGRAM_CONFIG.clientId,
          sub: 'tg-sub-1',
          iat: now,
          exp: now + 3600,
          name: 'Test User',
          ...claims,
        }).filter(([, v]) => v !== undefined),
      );
      return new SignJWT(payload)
        .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
        .sign(opts.key ?? privateKey);
    },

    // The client always calls fetch(url: string, { headers, body: URLSearchParams }).
    fetch: ((input: string, init: { headers: Record<string, string>; body: URLSearchParams }) => {
      const { body } = init;
      fake.requests.push({ url: input, headers: new Headers(init.headers), body });
      const idToken = fake.tokensByCode.get(body.get('code') ?? '') ?? fake.nextToken;
      if (fake.tokenStatus !== 200 || idToken === null) {
        const status = fake.tokenStatus === 200 ? 400 : fake.tokenStatus;
        return Promise.resolve(Response.json({ error: 'invalid_grant' }, { status }));
      }
      return Promise.resolve(
        Response.json({
          access_token: 'at',
          token_type: 'Bearer',
          expires_in: 3600,
          id_token: idToken,
        }),
      );
    }) as unknown as typeof fetch,

    client(now?: () => Date) {
      return new TelegramOidcClient(FAKE_TELEGRAM_CONFIG, { fetch: fake.fetch, jwks, now });
    },
  };
  return fake;
}

export type FakeTelegram = Awaited<ReturnType<typeof createFakeTelegram>>;
