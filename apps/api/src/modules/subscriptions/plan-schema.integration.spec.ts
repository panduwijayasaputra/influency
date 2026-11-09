import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestPrisma } from '../../../test/prisma.js';
import { seedRoles } from '../../../prisma/seed/roles.js';
import { seedSubscriptionPlans } from '../../../prisma/seed/subscription-plans.js';
import { seedUsers } from '../../../prisma/seed/users.js';
import { DEMO_CREATOR_PROFILE_IDS } from '../../common/demo-ids.js';

// Plans are append-only, so rows are never deleted: each test makes a fresh creator.
describe('creator subscription plan schema', () => {
  const prisma = createTestPrisma();
  afterAll(() => prisma.$disconnect());

  async function newCreator() {
    const user = await prisma.user.create({ data: { displayName: 'Plan Spec' } });
    return prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug: `plan-${randomUUID().slice(0, 8)}`,
        displayName: 'Plan Spec',
        agreementVersion: 'test',
        agreementAcceptedAt: new Date(),
      },
    });
  }
  const plan = (creatorProfileId: string, over: Record<string, unknown> = {}) => ({
    creatorProfileId,
    version: 1,
    priceCoins: 10n,
    active: true,
    ...over,
  });

  it('accepts 10 and 5,000 Koin and rejects 9 and 5,001', async () => {
    const c = await newCreator();
    await expect(
      prisma.creatorSubscriptionPlan.create({ data: plan(c.id, { priceCoins: 9n }) }),
    ).rejects.toThrow();
    await expect(
      prisma.creatorSubscriptionPlan.create({ data: plan(c.id, { priceCoins: 5001n }) }),
    ).rejects.toThrow();
    await prisma.creatorSubscriptionPlan.create({ data: plan(c.id, { priceCoins: 10n }) });
    await prisma.creatorSubscriptionPlan.create({
      data: plan(c.id, { version: 2, priceCoins: 5000n }),
    });
  });

  it('fixes the duration at 30 days and rejects a duplicate version', async () => {
    const c = await newCreator();
    await expect(
      prisma.creatorSubscriptionPlan.create({ data: plan(c.id, { durationDays: 31 }) }),
    ).rejects.toThrow();
    await prisma.creatorSubscriptionPlan.create({ data: plan(c.id) });
    await expect(prisma.creatorSubscriptionPlan.create({ data: plan(c.id) })).rejects.toThrow();
    await expect(
      prisma.creatorSubscriptionPlan.create({ data: plan(c.id, { version: 0 }) }),
    ).rejects.toThrow();
  });

  it('is append-only: update and delete are rejected', async () => {
    const c = await newCreator();
    const row = await prisma.creatorSubscriptionPlan.create({ data: plan(c.id) });
    await expect(
      prisma.creatorSubscriptionPlan.update({ where: { id: row.id }, data: { priceCoins: 20n } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.creatorSubscriptionPlan.delete({ where: { id: row.id } })).rejects.toThrow(
      /append-only/,
    );
  });

  it('seeds the demo plans idempotently', async () => {
    await seedUsers(prisma);
    await seedRoles(prisma);
    await seedSubscriptionPlans(prisma);
    await seedSubscriptionPlans(prisma);
    const plans = await prisma.creatorSubscriptionPlan.findMany({
      where: {
        creatorProfileId: {
          in: [DEMO_CREATOR_PROFILE_IDS.claudia, DEMO_CREATOR_PROFILE_IDS.creatorB],
        },
      },
      orderBy: { priceCoins: 'asc' },
    });
    expect(plans.map((p) => [p.version, Number(p.priceCoins), p.active])).toEqual([
      [1, 75, true],
      [1, 150, true],
    ]);
  });
});
