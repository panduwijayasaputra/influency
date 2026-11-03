import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootEnv = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);
// global-setup.ts checks the test DB is not the dev DB.
process.env.DEV_DATABASE_URL = process.env.DATABASE_URL;

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'prisma/**/*.spec.ts', 'test/**/*.spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // Integration specs use the test database (wiped by global-setup.ts); unit tests never connect.
    // Telegram and R2 values are placeholders so tests never depend on the local .env
    // (specs override OBJECT_STORAGE with test/memory-storage.ts; R2 is never contacted).
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      WEB_ORIGIN: 'http://localhost:3000',
      TELEGRAM_OIDC_CLIENT_ID: '123456789',
      TELEGRAM_OIDC_CLIENT_SECRET: 'test-client-secret',
      TELEGRAM_OIDC_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/telegram/callback',
      STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: 'test-account',
      R2_ACCESS_KEY_ID: 'test-access-key',
      R2_SECRET_ACCESS_KEY: 'test-secret',
      R2_BUCKET: 'test-bucket',
    },
  },
});
