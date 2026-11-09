import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_USER_IDS } from '../../src/common/demo-ids.js';

const DEMO_USERS = [
  { id: DEMO_USER_IDS.claudia, displayName: 'Claudia Andreya' },
  { id: DEMO_USER_IDS.creatorB, displayName: 'Creator B' },
  { id: DEMO_USER_IDS.subscriberA, displayName: 'Subscriber A' },
  { id: DEMO_USER_IDS.subscriberB, displayName: 'Subscriber B' },
  { id: DEMO_USER_IDS.admin, displayName: 'Admin' },
];

export async function seedUsers(prisma: PrismaClient): Promise<void> {
  for (const user of DEMO_USERS) {
    await prisma.user.upsert({
      where: { id: user.id },
      // Demo users skip the welcome stepper; an update never resets the flag.
      create: { ...user, onboardingCompletedAt: new Date() },
      update: { displayName: user.displayName },
    });
  }
}
