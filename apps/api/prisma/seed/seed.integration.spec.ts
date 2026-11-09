import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../test/prisma.js';
import { DEMO_USER_IDS } from '../../src/common/demo-ids.js';
import { seed } from './seed.js';

describe('demo seed', () => {
  const prisma = createTestPrisma();
  afterAll(() => prisma.$disconnect());

  it('marks demo users as done with onboarding and a re-seed does not reset it', async () => {
    await seed(prisma);
    const where = { id: { in: Object.values(DEMO_USER_IDS) } };
    expect(await prisma.user.count({ where: { ...where, onboardingCompletedAt: null } })).toBe(0);
    await prisma.user.update({
      where: { id: DEMO_USER_IDS.subscriberA },
      data: { onboardingCompletedAt: null },
    });
    await seed(prisma);
    const row = await prisma.user.findUniqueOrThrow({ where: { id: DEMO_USER_IDS.subscriberA } });
    expect(row.onboardingCompletedAt).toBeNull(); // update never touches the flag
    await prisma.user.update({
      where: { id: DEMO_USER_IDS.subscriberA },
      data: { onboardingCompletedAt: new Date() },
    });
  });

  it('creates the demo users, roles and creator profiles and is idempotent', async () => {
    await seed(prisma);
    await seed(prisma);

    const users = await prisma.user.findMany({
      where: { id: { in: Object.values(DEMO_USER_IDS) } },
      orderBy: { id: 'asc' },
    });
    expect(users.map((u) => [u.displayName, u.status])).toEqual([
      ['Claudia Andreya', 'ACTIVE'],
      ['Creator B', 'ACTIVE'],
      ['Subscriber A', 'ACTIVE'],
      ['Subscriber B', 'ACTIVE'],
      ['Admin', 'ACTIVE'],
    ]);

    const roles = await prisma.userRole.findMany({
      where: { userId: { in: Object.values(DEMO_USER_IDS) } },
    });
    expect(roles.map((r) => [r.userId, r.role])).toEqual([[DEMO_USER_IDS.admin, 'ADMIN']]);

    const profiles = await prisma.creatorProfile.findMany({
      where: { userId: { in: Object.values(DEMO_USER_IDS) } },
      orderBy: { userId: 'asc' },
    });
    expect(profiles.map((p) => [p.userId, p.slug, p.status, p.displayName])).toEqual([
      [DEMO_USER_IDS.claudia, 'claudiandreya', 'APPROVED', 'Claudia Andreya'],
      [DEMO_USER_IDS.creatorB, 'creatorb', 'APPROVED', 'Creator B'],
      [DEMO_USER_IDS.subscriberB, 'subscriberb', 'PENDING_REVIEW', 'Subscriber B'],
    ]);
  });

  it("keeps an admin's decision on the demo application when re-seeded", async () => {
    await seed(prisma);
    const where = { userId: DEMO_USER_IDS.subscriberB };
    await prisma.creatorProfile.update({ where, data: { status: 'APPROVED' } });
    try {
      await seed(prisma);
      expect((await prisma.creatorProfile.findUniqueOrThrow({ where })).status).toBe('APPROVED');
    } finally {
      await prisma.creatorProfile.update({ where, data: { status: 'PENDING_REVIEW' } });
    }
  });
});
