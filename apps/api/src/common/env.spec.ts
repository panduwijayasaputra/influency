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

describe('parseEnv', () => {
  it('applies defaults to a minimal valid environment', () => {
    expect(parseEnv(BASE)).toEqual({
      NODE_ENV: 'development',
      API_PORT: 4000,
      ...BASE,
      SESSION_TTL_DAYS: 30,
      LOCAL_STORAGE_DIR: '.local-storage',
      UPLOAD_URL_TTL_SECONDS: 300,
      MIDTRANS_IS_PRODUCTION: false,
    });
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
    expect(parseEnv({ ...BASE, NODE_ENV: 'production' }).STORAGE_DRIVER).toBe('r2');
  });

  it.each(['59', '3601', '1.5', 'abc'])('rejects UPLOAD_URL_TTL_SECONDS=%s', (ttl) => {
    expect(() => parseEnv({ ...BASE, UPLOAD_URL_TTL_SECONDS: ttl })).toThrow(
      /- UPLOAD_URL_TTL_SECONDS:/,
    );
  });

  it('rejects an unknown STORAGE_DRIVER', () => {
    expect(() => parseEnv({ ...BASE, STORAGE_DRIVER: 's3' })).toThrow(/- STORAGE_DRIVER:/);
  });

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
});
