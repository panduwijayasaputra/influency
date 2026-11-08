import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile, parseEnv } from './env.js';

const DATABASE_URL = 'postgresql://influency:s3cret-pw@localhost:5432/influency';
const TELEGRAM = {
  WEB_ORIGIN: 'http://localhost:3000',
  TELEGRAM_OIDC_CLIENT_ID: '123456789',
  TELEGRAM_OIDC_CLIENT_SECRET: 'tg-s3cret',
  TELEGRAM_OIDC_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/telegram/callback',
};
const R2 = {
  R2_ACCOUNT_ID: 'test-account',
  R2_ACCESS_KEY_ID: 'test-access-key',
  R2_SECRET_ACCESS_KEY: 'test-secret',
  R2_BUCKET: 'test-bucket',
};
const BASE = { DATABASE_URL, ...TELEGRAM, ...R2, STORAGE_DRIVER: 'r2' };
const MIDTRANS = {
  PAYMENT_PROVIDER: 'midtrans',
  MIDTRANS_SERVER_KEY: 'SB-Mid-server-secret',
  MIDTRANS_CLIENT_KEY: 'SB-Mid-client',
  MIDTRANS_MERCHANT_ID: 'G000',
};
const STREAM = {
  VIDEO_DRIVER: 'stream',
  CLOUDFLARE_STREAM_ACCOUNT_ID: 'test-stream-account',
  CLOUDFLARE_STREAM_TOKEN: 'test-stream-token',
};

describe('parseEnv', () => {
  it('applies defaults to a minimal valid environment', () => {
    expect(parseEnv(BASE)).toEqual({
      NODE_ENV: 'development',
      API_PORT: 4000,
      TRUST_PROXY: false,
      ...BASE,
      SESSION_TTL_DAYS: 30,
      LOCAL_STORAGE_DIR: '.local-storage',
      UPLOAD_URL_TTL_SECONDS: 300,
      VIDEO_DRIVER: 'stub',
      VIDEO_UPLOAD_TTL_SECONDS: 1800,
      VIDEO_PROCESSING_TIMEOUT_SECONDS: 7200,
      MEDIA_SWEEP_INTERVAL_SECONDS: 300,
      MEDIA_ACCESS_TTL_SECONDS: 1800,
      POST_MODERATION_REQUIRED: false,
      PREMIUM_COVER_CLEAR_ALLOWED: false,
      PREMIUM_LIKES_WITHOUT_ACCESS: false,
      PREMIUM_COMMENTS_READ_WITHOUT_ACCESS: false,
      PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: false,
      COMMENT_RATE_LIMIT_PER_MINUTE: 10,
      PAYMENT_PROVIDER: 'fake',
      TOPUP_EXPIRY_MINUTES: 60,
      TOPUP_RECONCILE_INTERVAL_SECONDS: 60,
      MIDTRANS_IS_PRODUCTION: false,
    });
  });

  it('accepts a disabled media sweep and bounds the media cleanup settings', () => {
    const env = parseEnv({ ...BASE, MEDIA_SWEEP_INTERVAL_SECONDS: '0' });
    expect(env.MEDIA_SWEEP_INTERVAL_SECONDS).toBe(0);
    expect(env.CLOUDFLARE_STREAM_WEBHOOK_SECRET).toBeUndefined();
    expect(() => parseEnv({ ...BASE, MEDIA_SWEEP_INTERVAL_SECONDS: '3601' })).toThrow();
    expect(() => parseEnv({ ...BASE, VIDEO_PROCESSING_TIMEOUT_SECONDS: '599' })).toThrow();
    expect(() => parseEnv({ ...BASE, VIDEO_PROCESSING_TIMEOUT_SECONDS: '86401' })).toThrow();
  });

  it('defaults to local storage without any R2 variables', () => {
    const env = parseEnv({ DATABASE_URL, ...TELEGRAM });
    expect(env.STORAGE_DRIVER).toBe('local');
    expect(env.R2_BUCKET).toBeUndefined();
  });

  it('rejects local storage in production', () => {
    expect(() => parseEnv({ DATABASE_URL, ...TELEGRAM, NODE_ENV: 'production' })).toThrow(
      '- STORAGE_DRIVER: local storage is for development only',
    );
    expect(
      parseEnv({ ...BASE, ...STREAM, ...MIDTRANS, NODE_ENV: 'production' }).STORAGE_DRIVER,
    ).toBe('r2');
  });

  it('defaults to the stub video driver without any Stream variables', () => {
    const env = parseEnv(BASE);
    expect(env.VIDEO_DRIVER).toBe('stub');
    expect(env.CLOUDFLARE_STREAM_TOKEN).toBeUndefined();
  });

  it('requires the Stream variables for VIDEO_DRIVER=stream, never echoing values', () => {
    const run = () =>
      parseEnv({ ...BASE, ...STREAM, CLOUDFLARE_STREAM_TOKEN: undefined, VIDEO_DRIVER: 'stream' });
    expect(run).toThrow('- CLOUDFLARE_STREAM_TOKEN: required when VIDEO_DRIVER=stream');
    expect(run).not.toThrow(/test-stream-account/);
    expect(parseEnv({ ...BASE, ...STREAM }).VIDEO_DRIVER).toBe('stream');
  });

  it('rejects the stub video driver in production', () => {
    expect(() => parseEnv({ ...BASE, NODE_ENV: 'production' })).toThrow(
      '- VIDEO_DRIVER: stub video is for development only',
    );
  });

  it.each(['119', '21601', 'abc'])('rejects VIDEO_UPLOAD_TTL_SECONDS=%s', (ttl) => {
    expect(() => parseEnv({ ...BASE, VIDEO_UPLOAD_TTL_SECONDS: ttl })).toThrow(
      /- VIDEO_UPLOAD_TTL_SECONDS:/,
    );
  });

  it.each(['59', '3601', '1.5', 'abc'])('rejects UPLOAD_URL_TTL_SECONDS=%s', (ttl) => {
    expect(() => parseEnv({ ...BASE, UPLOAD_URL_TTL_SECONDS: ttl })).toThrow(
      /- UPLOAD_URL_TTL_SECONDS:/,
    );
  });

  it('bounds MEDIA_ACCESS_TTL_SECONDS to 10–30 minutes', () => {
    expect(parseEnv({ ...BASE, MEDIA_ACCESS_TTL_SECONDS: '600' }).MEDIA_ACCESS_TTL_SECONDS).toBe(
      600,
    );
    for (const value of ['599', '1801']) {
      expect(() => parseEnv({ ...BASE, MEDIA_ACCESS_TTL_SECONDS: value })).toThrow(
        'MEDIA_ACCESS_TTL_SECONDS',
      );
    }
  });

  it('rejects an unknown STORAGE_DRIVER', () => {
    expect(() => parseEnv({ ...BASE, STORAGE_DRIVER: 's3' })).toThrow(/- STORAGE_DRIVER:/);
  });

  it.each([
    ['1', 1],
    ['127.0.0.1, ::1', ['127.0.0.1', '::1']],
    ['10.0.0.0/8', ['10.0.0.0/8']],
    ['', false],
  ])('parses TRUST_PROXY=%j', (value, expected) => {
    expect(parseEnv({ ...BASE, TRUST_PROXY: value }).TRUST_PROXY).toEqual(expected);
  });

  it.each(['true', 'TRUE', 'abc', '999.1.1.1', '0', '6', '10.0.0.0/33', '::1/129'])(
    'rejects TRUST_PROXY=%s',
    (value) => {
      expect(() => parseEnv({ ...BASE, TRUST_PROXY: value })).toThrow(/TRUST_PROXY/);
    },
  );

  it('coerces a valid SESSION_TTL_DAYS to a number', () => {
    expect(parseEnv({ ...BASE, SESSION_TTL_DAYS: '7' }).SESSION_TTL_DAYS).toBe(7);
  });

  it.each(['0', '-1', '1.5', 'abc', '366'])('rejects SESSION_TTL_DAYS=%s', (days) => {
    expect(() => parseEnv({ ...BASE, SESSION_TTL_DAYS: days })).toThrow(/- SESSION_TTL_DAYS:/);
  });

  it('rejects a missing DATABASE_URL and points to .env.example', () => {
    expect(() => parseEnv({})).toThrow(/\.env\.example/);
    expect(() => parseEnv({})).toThrow(/- DATABASE_URL:/);
  });

  it.each(['mysql://u:p@localhost/db', 'not-a-url'])('rejects DATABASE_URL=%s', (url) => {
    expect(() => parseEnv({ ...BASE, DATABASE_URL: url })).toThrow(/- DATABASE_URL:/);
  });

  it('accepts the postgres:// scheme', () => {
    expect(parseEnv({ ...BASE, DATABASE_URL: 'postgres://u:p@localhost/db' }).DATABASE_URL).toBe(
      'postgres://u:p@localhost/db',
    );
  });

  it.each(['abc', '0', '70000', '1.5'])('rejects API_PORT=%s', (port) => {
    expect(() => parseEnv({ ...BASE, API_PORT: port })).toThrow(/- API_PORT:/);
  });

  it('coerces a valid API_PORT to a number', () => {
    expect(parseEnv({ ...BASE, API_PORT: '4123' }).API_PORT).toBe(4123);
  });

  it('rejects MIDTRANS_IS_PRODUCTION=true (sandbox only)', () => {
    expect(() => parseEnv({ ...BASE, MIDTRANS_IS_PRODUCTION: 'true' })).toThrow(
      '- MIDTRANS_IS_PRODUCTION: production payments are disabled for the MVP (sandbox only)',
    );
  });

  it.each(['TRUE', '1', 'yes'])('rejects MIDTRANS_IS_PRODUCTION=%s', (value) => {
    expect(() => parseEnv({ ...BASE, MIDTRANS_IS_PRODUCTION: value })).toThrow(
      /- MIDTRANS_IS_PRODUCTION:/,
    );
  });

  it('accepts MIDTRANS_IS_PRODUCTION=false', () => {
    expect(parseEnv({ ...BASE, MIDTRANS_IS_PRODUCTION: 'false' }).MIDTRANS_IS_PRODUCTION).toBe(
      false,
    );
  });

  it('parses POST_MODERATION_REQUIRED (default false)', () => {
    expect(parseEnv(BASE).POST_MODERATION_REQUIRED).toBe(false);
    expect(parseEnv({ ...BASE, POST_MODERATION_REQUIRED: 'true' }).POST_MODERATION_REQUIRED).toBe(
      true,
    );
    expect(() => parseEnv({ ...BASE, POST_MODERATION_REQUIRED: 'yes' })).toThrow(
      /- POST_MODERATION_REQUIRED:/,
    );
  });

  it('parses PREMIUM_LIKES_WITHOUT_ACCESS (default false = only viewers with access)', () => {
    expect(parseEnv(BASE).PREMIUM_LIKES_WITHOUT_ACCESS).toBe(false);
    expect(
      parseEnv({ ...BASE, PREMIUM_LIKES_WITHOUT_ACCESS: 'true' }).PREMIUM_LIKES_WITHOUT_ACCESS,
    ).toBe(true);
    expect(() => parseEnv({ ...BASE, PREMIUM_LIKES_WITHOUT_ACCESS: '1' })).toThrow(
      /- PREMIUM_LIKES_WITHOUT_ACCESS:/,
    );
  });

  it.each([
    'PREMIUM_COMMENTS_READ_WITHOUT_ACCESS',
    'PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS',
  ] as const)('parses %s (default false = only viewers with access)', (name) => {
    expect(parseEnv(BASE)[name]).toBe(false);
    expect(parseEnv({ ...BASE, [name]: 'true' })[name]).toBe(true);
    expect(() => parseEnv({ ...BASE, [name]: '1' })).toThrow(new RegExp(`- ${name}:`));
  });

  it('parses COMMENT_RATE_LIMIT_PER_MINUTE (default 10, at least 1)', () => {
    expect(
      parseEnv({ ...BASE, COMMENT_RATE_LIMIT_PER_MINUTE: '3' }).COMMENT_RATE_LIMIT_PER_MINUTE,
    ).toBe(3);
    expect(() => parseEnv({ ...BASE, COMMENT_RATE_LIMIT_PER_MINUTE: '0' })).toThrow(
      /- COMMENT_RATE_LIMIT_PER_MINUTE:/,
    );
  });

  it('parses PREMIUM_COVER_CLEAR_ALLOWED (default false = blurred only)', () => {
    expect(parseEnv(BASE).PREMIUM_COVER_CLEAR_ALLOWED).toBe(false);
    expect(
      parseEnv({ ...BASE, PREMIUM_COVER_CLEAR_ALLOWED: 'true' }).PREMIUM_COVER_CLEAR_ALLOWED,
    ).toBe(true);
    expect(() => parseEnv({ ...BASE, PREMIUM_COVER_CLEAR_ALLOWED: '1' })).toThrow(
      /- PREMIUM_COVER_CLEAR_ALLOWED:/,
    );
  });

  it('lists every problem at once', () => {
    let message = '';
    try {
      parseEnv({ API_PORT: 'abc', NODE_ENV: 'staging', MIDTRANS_IS_PRODUCTION: 'true' });
    } catch (error) {
      message = (error as Error).message;
    }
    for (const name of ['DATABASE_URL', 'API_PORT', 'NODE_ENV', 'MIDTRANS_IS_PRODUCTION']) {
      expect(message).toContain(`- ${name}:`);
    }
  });

  it.each([...Object.keys(TELEGRAM), ...Object.keys(R2)])('rejects a missing %s', (name) => {
    expect(() => parseEnv({ ...BASE, [name]: undefined })).toThrow(`- ${name}:`);
  });

  it.each(['SET_LOCALLY', '12ab', ''])('rejects TELEGRAM_OIDC_CLIENT_ID=%s', (id) => {
    expect(() => parseEnv({ ...BASE, TELEGRAM_OIDC_CLIENT_ID: id })).toThrow(
      '- TELEGRAM_OIDC_CLIENT_ID:',
    );
  });

  it('never includes variable values in the error message', () => {
    const secretUrl = 'mysql://influency:s3cret-pw@localhost/db';
    expect(() => parseEnv({ ...BASE, DATABASE_URL: secretUrl })).toThrow();
    try {
      parseEnv({ ...BASE, DATABASE_URL: secretUrl, TELEGRAM_OIDC_REDIRECT_URI: 'x' });
    } catch (error) {
      expect((error as Error).message).not.toMatch(/s3cret-pw|tg-s3cret/);
    }
  });
});

describe('loadEnvFile', () => {
  let dir: string | undefined;

  // Delete keys instead of reassigning process.env: process.loadEnvFile writes to the real env.
  afterEach(() => {
    delete process.env.INFLUENCY_TEST_NEW;
    delete process.env.INFLUENCY_TEST_EXISTING;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('does nothing when the file is missing', () => {
    expect(() => loadEnvFile(join(tmpdir(), 'influency-no-such-file.env'))).not.toThrow();
  });

  it('sets unset variables but keeps ones already in process.env', () => {
    dir = mkdtempSync(join(tmpdir(), 'influency-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, 'INFLUENCY_TEST_NEW=from-file\nINFLUENCY_TEST_EXISTING=from-file\n');
    delete process.env.INFLUENCY_TEST_NEW;
    process.env.INFLUENCY_TEST_EXISTING = 'from-env';

    loadEnvFile(file);

    expect(process.env.INFLUENCY_TEST_NEW).toBe('from-file');
    expect(process.env.INFLUENCY_TEST_EXISTING).toBe('from-env');
  });

  it('defaults to the fake payment provider and rejects it in production', () => {
    expect(parseEnv(BASE).PAYMENT_PROVIDER).toBe('fake');
    expect(() => parseEnv({ ...BASE, ...STREAM, NODE_ENV: 'production' })).toThrow(
      '- PAYMENT_PROVIDER: fake payments are for development and test only',
    );
  });

  it('requires the Midtrans keys for PAYMENT_PROVIDER=midtrans, never echoing values', () => {
    expect(() => parseEnv({ ...BASE, PAYMENT_PROVIDER: 'midtrans' })).toThrow(
      '- MIDTRANS_SERVER_KEY: required when PAYMENT_PROVIDER=midtrans',
    );
    const keys = {
      MIDTRANS_SERVER_KEY: 'SB-Mid-server-secret',
      MIDTRANS_CLIENT_KEY: 'SB-Mid-client',
      MIDTRANS_MERCHANT_ID: 'G000',
    };
    expect(
      parseEnv({
        ...BASE,
        ...STREAM,
        ...keys,
        PAYMENT_PROVIDER: 'midtrans',
        NODE_ENV: 'production',
      }).PAYMENT_PROVIDER,
    ).toBe('midtrans');
    expect(() =>
      parseEnv({ ...BASE, PAYMENT_PROVIDER: 'midtrans', MIDTRANS_IS_PRODUCTION: 'true', ...keys }),
    ).toThrow(/MIDTRANS_IS_PRODUCTION/);
  });

  it('bounds the top-up expiry', () => {
    expect(() => parseEnv({ ...BASE, TOPUP_EXPIRY_MINUTES: '14' })).toThrow();
    expect(parseEnv({ ...BASE, TOPUP_EXPIRY_MINUTES: '30' }).TOPUP_EXPIRY_MINUTES).toBe(30);
  });
});
