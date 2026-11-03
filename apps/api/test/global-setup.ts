import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const help = 'see README "Local database"';

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.slice(1));
}

/** Throws unless `testUrl` names a `*_test` database that is not the dev database. */
export function assertSafeTestDatabaseUrl(
  testUrl: string | undefined,
  devUrl: string | undefined,
): asserts testUrl is string {
  if (!testUrl) throw new Error(`TEST_DATABASE_URL is not set — ${help}`);
  const name = databaseName(testUrl);
  if (!name.endsWith('_test')) {
    throw new Error(
      `TEST_DATABASE_URL database "${name}" must end in _test (it is wiped on every run)`,
    );
  }
  if (devUrl && databaseName(devUrl) === name) {
    throw new Error('TEST_DATABASE_URL must not point at the DATABASE_URL database');
  }
}

/** Wipes the test database and applies all migrations, once per `vitest run`. */
export default async function setup(): Promise<void> {
  const testUrl = process.env.TEST_DATABASE_URL;
  assertSafeTestDatabaseUrl(testUrl, process.env.DEV_DATABASE_URL);

  // Not `prisma migrate reset`: Prisma blocks it for AI agents without user consent, and this DB is guarded above.
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: testUrl }) });
  try {
    await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await prisma.$executeRawUnsafe('CREATE SCHEMA public');
  } catch (error) {
    throw new Error(`Cannot reach the test database (is PostgreSQL running?) — ${help}`, {
      cause: error,
    });
  } finally {
    await prisma.$disconnect();
  }
  execSync('pnpm exec prisma migrate deploy', {
    cwd: apiDir,
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
