import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_CREATOR_PROFILE_IDS, DEMO_SUBSCRIPTION_PLAN_IDS } from '../../src/common/demo-ids.js';

// EXAMPLE prices (the creator sets the real one, 10–5,000 Koin).
const PLANS = [
  {
    id: DEMO_SUBSCRIPTION_PLAN_IDS.claudia,
    creatorProfileId: DEMO_CREATOR_PROFILE_IDS.claudia,
    priceCoins: 150n,
  },
  {
    id: DEMO_SUBSCRIPTION_PLAN_IDS.creatorB,
    creatorProfileId: DEMO_CREATOR_PROFILE_IDS.creatorB,
    priceCoins: 75n,
  },
];

export async function seedSubscriptionPlans(prisma: PrismaClient): Promise<void> {
  for (const plan of PLANS) {
    // Plans are append-only: only create version 1 when it is missing, never rewrite it.
    await prisma.creatorSubscriptionPlan.upsert({
      where: { id: plan.id },
      create: { ...plan, version: 1, active: true },
      update: {},
    });
  }
}
