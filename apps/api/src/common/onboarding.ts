import type { Prisma } from '../generated/prisma/client.js';

/**
 * Marks the user as having finished onboarding. Idempotent: the first time stays. Uses the DB clock
 * (a JS Date written through the ORM is shifted in this environment, see db-time.ts).
 */
export async function markOnboardingCompleted(
  client: Pick<Prisma.TransactionClient, '$executeRaw'>,
  userId: string,
): Promise<void> {
  await client.$executeRaw`UPDATE users SET onboarding_completed_at = now() WHERE id = ${userId}::uuid AND onboarding_completed_at IS NULL`;
}
