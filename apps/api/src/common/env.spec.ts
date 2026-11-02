import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile, parseEnv } from './env.js';

const DATABASE_URL = 'postgresql://influency:s3cret-pw@localhost:5432/influency';

describe('parseEnv', () => {
  it('applies defaults to a minimal valid environment', () => {
    expect(parseEnv({ DATABASE_URL })).toEqual({
      NODE_ENV: 'development',
      API_PORT: 4000,
      DATABASE_URL,
      MIDTRANS_IS_PRODUCTION: false,
    });
  });

  it('rejects a missing DATABASE_URL and points to .env.example', () => {
    expect(() => parseEnv({})).toThrow(/\.env\.example/);
    expect(() => parseEnv({})).toThrow(/- DATABASE_URL:/);
  });

  it.each(['mysql://u:p@localhost/db', 'not-a-url'])('rejects DATABASE_URL=%s', (url) => {
    expect(() => parseEnv({ DATABASE_URL: url })).toThrow(/- DATABASE_URL:/);
  });

  it('accepts the postgres:// scheme', () => {
    expect(parseEnv({ DATABASE_URL: 'postgres://u:p@localhost/db' }).DATABASE_URL).toBe(
      'postgres://u:p@localhost/db',
    );
  });

  it.each(['abc', '0', '70000', '1.5'])('rejects API_PORT=%s', (port) => {
    expect(() => parseEnv({ DATABASE_URL, API_PORT: port })).toThrow(/- API_PORT:/);
  });

  it('coerces a valid API_PORT to a number', () => {
    expect(parseEnv({ DATABASE_URL, API_PORT: '4123' }).API_PORT).toBe(4123);
  });

  it('rejects MIDTRANS_IS_PRODUCTION=true (sandbox only)', () => {
    expect(() => parseEnv({ DATABASE_URL, MIDTRANS_IS_PRODUCTION: 'true' })).toThrow(
      '- MIDTRANS_IS_PRODUCTION: production payments are disabled for the MVP (sandbox only)',
    );
  });

  it.each(['TRUE', '1', 'yes'])('rejects MIDTRANS_IS_PRODUCTION=%s', (value) => {
    expect(() => parseEnv({ DATABASE_URL, MIDTRANS_IS_PRODUCTION: value })).toThrow(
      /- MIDTRANS_IS_PRODUCTION:/,
    );
  });

  it('accepts MIDTRANS_IS_PRODUCTION=false', () => {
    expect(parseEnv({ DATABASE_URL, MIDTRANS_IS_PRODUCTION: 'false' }).MIDTRANS_IS_PRODUCTION).toBe(
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

  it('never includes variable values in the error message', () => {
    const secretUrl = 'mysql://influency:s3cret-pw@localhost/db';
    expect(() => parseEnv({ DATABASE_URL: secretUrl })).toThrow();
    try {
      parseEnv({ DATABASE_URL: secretUrl });
    } catch (error) {
      expect((error as Error).message).not.toContain('s3cret-pw');
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
