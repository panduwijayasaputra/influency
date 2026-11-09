import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../test/prisma.js';
import { dbNow, writtenInstant } from './db-time.js';

describe('dbNow and writtenInstant', () => {
  const prisma = createTestPrisma();
  afterAll(() => prisma.$disconnect());

  it('is the real current instant, whatever time zone the database session uses', async () => {
    const before = Date.now();
    const now = (await dbNow(prisma)).getTime();
    expect(now).toBeGreaterThanOrEqual(before - 2000);
    expect(now).toBeLessThanOrEqual(Date.now() + 2000);
  });

  it('agrees with timestamps the database stores', async () => {
    const [row] = await prisma.$queryRaw<{ ms: bigint }[]>`
      SELECT (extract(epoch FROM now()) * 1000)::bigint AS ms`;
    expect(Math.abs(Number(row!.ms) - (await dbNow(prisma)).getTime())).toBeLessThan(5000);
  });

  it('writtenInstant recovers the instant a JS Date meant, whatever the session time zone', async () => {
    const meant = new Date(Date.now() + 5 * 86_400_000);
    const user = await prisma.user.create({ data: { displayName: 'writtenInstant spec' } });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: `written-instant-${meant.getTime()}`,
        expiresAt: meant,
      },
    });
    try {
      const [row] = await prisma.$queryRaw<{ ms: bigint }[]>`
        SELECT (extract(epoch FROM ${writtenInstant('expires_at')}) * 1000)::bigint AS ms
        FROM sessions WHERE id = ${session.id}::uuid`;
      expect(Number(row!.ms)).toBe(meant.getTime());
    } finally {
      await prisma.session.delete({ where: { id: session.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('also recovers createdAt @default(now()): Prisma fills that in from JS, so it is shifted too', async () => {
    const user = await prisma.user.create({ data: { displayName: 'writtenInstant default spec' } });
    try {
      const [row] = await prisma.$queryRaw<{ raw_ms: bigint; fixed_ms: bigint }[]>`
        SELECT (extract(epoch FROM created_at) * 1000)::bigint AS raw_ms,
               (extract(epoch FROM ${writtenInstant('created_at')}) * 1000)::bigint AS fixed_ms
        FROM users WHERE id = ${user.id}::uuid`;
      const now = (await dbNow(prisma)).getTime();
      expect(Math.abs(Number(row!.fixed_ms) - now)).toBeLessThan(60_000);
      // Without it the value is off by exactly the session offset (0 when the session runs in UTC).
      const [offset] = await prisma.$queryRaw<{ offset_ms: bigint }[]>`
        SELECT (extract(timezone FROM now()) * 1000)::bigint AS offset_ms`;
      expect(Math.abs(Number(row!.raw_ms) - (now - Number(offset!.offset_ms)))).toBeLessThan(
        60_000,
      );
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });

  it('shows why it is needed: the raw stored value is off by the session offset or equal to it', async () => {
    const meant = new Date(Date.now() + 5 * 86_400_000);
    const user = await prisma.user.create({ data: { displayName: 'writtenInstant raw spec' } });
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: `written-instant-raw-${meant.getTime()}`,
        expiresAt: meant,
      },
    });
    try {
      const [row] = await prisma.$queryRaw<{ raw_ms: bigint; offset_ms: bigint }[]>`
        SELECT (extract(epoch FROM expires_at) * 1000)::bigint AS raw_ms,
               (extract(timezone FROM now()) * 1000)::bigint AS offset_ms
        FROM sessions WHERE id = ${session.id}::uuid`;
      // The stored instant is the meant one moved by the session offset (0 when the session runs in UTC).
      expect(Number(row!.raw_ms)).toBe(meant.getTime() - Number(row!.offset_ms));
    } finally {
      await prisma.session.delete({ where: { id: session.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
});
