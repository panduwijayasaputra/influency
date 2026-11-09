import { generateKeyPair, SignJWT } from 'jose';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createFakeTelegram,
  FAKE_TELEGRAM_CONFIG,
  type FakeTelegram,
} from '../../../test/fake-telegram.js';
import {
  OidcError,
  pkceChallenge,
  randomToken,
  TELEGRAM_TOKEN_URL,
} from './telegram-oidc.client.js';

const NONCE = 'nonce-123';

describe('pkceChallenge / randomToken', () => {
  it('matches the RFC 7636 appendix B S256 vector', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('produces distinct 43-char base64url tokens', () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });
});

describe('TelegramOidcClient', () => {
  let fake: FakeTelegram;
  beforeEach(async () => {
    fake = await createFakeTelegram();
  });

  describe('authorizationUrl', () => {
    it('builds an S256 code request with state and nonce and no secret', () => {
      const url = new URL(
        fake.client().authorizationUrl({ state: 's1', nonce: 'n1', codeChallenge: 'c1' }),
      );
      expect(url.origin + url.pathname).toBe('https://oauth.telegram.org/auth');
      expect(Object.fromEntries(url.searchParams)).toEqual({
        client_id: FAKE_TELEGRAM_CONFIG.clientId,
        redirect_uri: FAKE_TELEGRAM_CONFIG.redirectUri,
        response_type: 'code',
        scope: 'openid profile',
        state: 's1',
        nonce: 'n1',
        code_challenge: 'c1',
        code_challenge_method: 'S256',
      });
      expect(url.toString()).not.toContain(FAKE_TELEGRAM_CONFIG.clientSecret);
    });
  });

  describe('exchangeCode', () => {
    it('posts the code and verifier with Basic auth and returns the ID token', async () => {
      fake.nextToken = 'the-id-token';
      await expect(fake.client().exchangeCode({ code: 'c', codeVerifier: 'v' })).resolves.toBe(
        'the-id-token',
      );
      const [req] = fake.requests;
      expect(req!.url).toBe(TELEGRAM_TOKEN_URL);
      expect(req!.headers.get('authorization')).toBe(
        `Basic ${Buffer.from('123456789:test-client-secret').toString('base64')}`,
      );
      expect(Object.fromEntries(req!.body)).toEqual({
        grant_type: 'authorization_code',
        code: 'c',
        redirect_uri: FAKE_TELEGRAM_CONFIG.redirectUri,
        client_id: FAKE_TELEGRAM_CONFIG.clientId,
        code_verifier: 'v',
      });
    });

    it.each([400, 500])('throws OidcError on HTTP %i', async (status) => {
      fake.tokenStatus = status;
      fake.nextToken = 'x';
      await expect(fake.client().exchangeCode({ code: 'c', codeVerifier: 'v' })).rejects.toThrow(
        new OidcError(`token_exchange_failed: ${status}`),
      );
    });

    it('throws OidcError when id_token is missing', async () => {
      fake.fetch = () => Promise.resolve(Response.json({ access_token: 'at' }));
      await expect(fake.client().exchangeCode({ code: 'c', codeVerifier: 'v' })).rejects.toThrow(
        'token_response_invalid',
      );
    });

    it('throws OidcError when the endpoint is unreachable', async () => {
      fake.fetch = () => Promise.reject(new TypeError('fetch failed'));
      await expect(fake.client().exchangeCode({ code: 'c', codeVerifier: 'v' })).rejects.toThrow(
        'token_exchange_unreachable',
      );
    });
  });

  describe('verifyIdToken', () => {
    it('accepts a valid token and returns sub + name', async () => {
      const token = await fake.signIdToken({ nonce: NONCE, sub: 'abc', name: 'Claudia' });
      await expect(fake.client().verifyIdToken(token, NONCE)).resolves.toEqual({
        sub: 'abc',
        name: 'Claudia',
        username: null,
      });
    });

    it.each([
      ['valid', 'claudia_01', 'claudia_01'],
      ['malformed', 'bad name!', null],
      ['not a string', 42, null],
    ])('keeps a %s preferred_username leniently', async (_label, preferred_username, expected) => {
      const token = await fake.signIdToken({ nonce: NONCE, preferred_username });
      await expect(fake.client().verifyIdToken(token, NONCE)).resolves.toMatchObject({
        username: expected,
      });
    });

    it('returns name null when the profile claim is absent', async () => {
      const token = await fake.signIdToken({ nonce: NONCE, name: undefined });
      await expect(fake.client().verifyIdToken(token, NONCE)).resolves.toMatchObject({
        name: null,
      });
    });

    const now = () => Math.floor(Date.now() / 1000);
    it.each([
      ['wrong issuer', { iss: 'https://evil.example' }, 'id_token_invalid'],
      ['wrong audience', { aud: '987654321' }, 'id_token_invalid'],
      ['expired', { iat: now() - 7200, exp: now() - 3600 }, 'id_token_invalid'],
      ['iat too old', { iat: now() - 3600 }, 'id_token_invalid'],
      ['missing nonce', { nonce: undefined }, 'id_token_claims_invalid'],
      ['mismatched nonce', { nonce: 'other' }, 'id_token_nonce_mismatch'],
      ['missing sub', { sub: undefined }, 'id_token_claims_invalid'],
    ])('rejects %s', async (_label, claims, reason) => {
      const token = await fake.signIdToken({ nonce: NONCE, ...claims });
      await expect(fake.client().verifyIdToken(token, NONCE)).rejects.toThrow(reason);
    });

    it('rejects a token signed by a different key (bad signature)', async () => {
      const other = await generateKeyPair('RS256');
      const token = await fake.signIdToken({ nonce: NONCE }, { key: other.privateKey });
      await expect(fake.client().verifyIdToken(token, NONCE)).rejects.toThrow(
        'id_token_invalid: ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
      );
    });

    it('rejects an HS256 token (symmetric alg not allowed)', async () => {
      const token = await new SignJWT({
        nonce: NONCE,
        sub: 'x',
        iss: 'https://oauth.telegram.org',
        aud: '123456789',
      })
        .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(new TextEncoder().encode('test-client-secret'));
      await expect(fake.client().verifyIdToken(token, NONCE)).rejects.toThrow('id_token_invalid');
    });

    it('rejects an unsigned (alg: none) token', async () => {
      const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
      const token = `${b64({ alg: 'none' })}.${b64({ nonce: NONCE, sub: 'x', iss: 'https://oauth.telegram.org', aud: '123456789', exp: now() + 60, iat: now() })}.`;
      await expect(fake.client().verifyIdToken(token, NONCE)).rejects.toThrow('id_token_invalid');
    });

    it('rejects garbage', async () => {
      await expect(fake.client().verifyIdToken('not-a-jwt', NONCE)).rejects.toBeInstanceOf(
        OidcError,
      );
    });
  });
});
