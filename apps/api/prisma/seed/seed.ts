import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { seedRoles } from './roles.js';
import { seedUsers } from './users.js';

type SeedStep = { name: string; run: (prisma: PrismaClient) => Promise<void> };

// Later stories append steps (posts, plans, coin packages).
// Order matters for foreign keys; every step must be idempotent (upsert by fixed id from src/common/demo-ids.ts).
export const seedSteps: SeedStep[] = [
  { name: 'demo users', run: seedUsers },
  { name: 'roles and creator profiles', run: seedRoles },
];

export async function seed(prisma: PrismaClient): Promise<void> {
  for (const step of seedSteps) await step.run(prisma);
}
