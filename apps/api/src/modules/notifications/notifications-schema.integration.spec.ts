import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../../test/prisma.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USER = '0190a000-0000-7000-8000-000000710001';

describe('notification tables (US-071)', () => {
  const prisma = createTestPrisma();

  beforeAll(async () => {
    await prisma.user.create({ data: { id: USER, displayName: 'Notif schema' } });
  });
  afterAll(async () => {
    // Notifications, preferences and jobs cascade with the user.
    await prisma.user.delete({ where: { id: USER } });
    await prisma.$disconnect();
  });

  it('allows one notification per (user, dedupe key)', async () => {
    const data = { userId: USER, type: 'TOPUP_CREDITED' as const, dedupeKey: 'schema:dup' };
    await prisma.notification.create({ data });
    await expect(prisma.notification.create({ data })).rejects.toThrow();
  });

  it('rejects a non-positive coin snapshot and negative attempts', async () => {
    await expect(
      prisma.notification.create({
        data: { userId: USER, type: 'TIP_RECEIVED', dedupeKey: 'schema:zero', coins: 0n },
      }),
    ).rejects.toThrow(/notifications_coins_positive/);
    const n = await prisma.notification.create({
      data: { userId: USER, type: 'TIP_RECEIVED', dedupeKey: 'schema:job', coins: 5n },
    });
    await expect(
      prisma.notificationJob.create({ data: { notificationId: n.id, attempts: -1 } }),
    ).rejects.toThrow(/notification_jobs_attempts_non_negative/);
    await prisma.notificationJob.create({ data: { notificationId: n.id } });
    await expect(
      prisma.notificationJob.create({ data: { notificationId: n.id } }),
    ).rejects.toThrow();
  });

  it('defaults opt-outs to likes on comments and keeps one row per user', async () => {
    const row = await prisma.notificationPreference.create({ data: { userId: USER } });
    expect(row.optOutTypes).toEqual(['COMMENT_LIKE']);
    expect(row.telegramAllowed).toBe(false);
    await expect(
      prisma.notificationPreference.create({ data: { userId: USER } }),
    ).rejects.toThrow();
  });
});
