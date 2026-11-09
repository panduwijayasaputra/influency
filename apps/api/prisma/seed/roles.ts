import { CREATOR_AGREEMENT_VERSION } from '@influency/shared';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_CREATOR_PROFILE_IDS, DEMO_USER_IDS } from '../../src/common/demo-ids.js';

const DEMO_CREATOR_PROFILES = [
  {
    id: DEMO_CREATOR_PROFILE_IDS.claudia,
    userId: DEMO_USER_IDS.claudia,
    slug: 'claudiandreya',
    displayName: 'Claudia Andreya',
    bio: 'Kreator demo untuk pengujian sandbox.',
    category: 'Gaya hidup',
  },
  {
    id: DEMO_CREATOR_PROFILE_IDS.creatorB,
    userId: DEMO_USER_IDS.creatorB,
    slug: 'creatorb',
    displayName: 'Creator B',
    bio: 'Kreator demo kedua.',
    category: 'Musik',
  },
];

/**
 * ADMIN for the demo admin; APPROVED creator profiles for Claudia and Creator B (handoff §15.5);
 * a PENDING_REVIEW application for Subscriber B so the admin review queue (US-011) has an entry.
 */
export async function seedRoles(prisma: PrismaClient): Promise<void> {
  const adminRole = { userId: DEMO_USER_IDS.admin, role: 'ADMIN' as const };
  await prisma.userRole.upsert({
    where: { userId_role: adminRole },
    create: adminRole,
    update: {},
  });
  for (const profile of DEMO_CREATOR_PROFILES) {
    await prisma.creatorProfile.upsert({
      where: { id: profile.id },
      create: {
        ...profile,
        status: 'APPROVED',
        agreementVersion: CREATOR_AGREEMENT_VERSION,
        agreementAcceptedAt: new Date(),
      },
      update: {
        slug: profile.slug,
        status: 'APPROVED',
        displayName: profile.displayName,
        bio: profile.bio,
        category: profile.category,
      },
    });
  }
  // Create-only: re-seeding never undoes an admin's decision on this application.
  await prisma.creatorProfile.upsert({
    where: { userId: DEMO_USER_IDS.subscriberB },
    create: {
      id: DEMO_CREATOR_PROFILE_IDS.subscriberB,
      userId: DEMO_USER_IDS.subscriberB,
      slug: 'subscriberb',
      displayName: 'Subscriber B',
      bio: 'Contoh pengajuan kreator yang menunggu peninjauan.',
      category: 'Fotografi',
      agreementVersion: CREATOR_AGREEMENT_VERSION,
      agreementAcceptedAt: new Date(),
    },
    update: {},
  });
}
