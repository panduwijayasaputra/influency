import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Locks one creator's profile row (`SELECT … FOR UPDATE`) until the transaction ends. Payout accounts and payout
 * requests / cancellations of the same creator all take it first, so they run one after another: the account limit,
 * the single active account, and the check "amount ≤ available" in a request can never race. Purchases only take
 * `FOR SHARE` on this row, so they merely wait a moment.
 */
export async function lockCreator(
  tx: Prisma.TransactionClient,
  creatorProfileId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM creator_profiles WHERE id = ${creatorProfileId}::uuid FOR UPDATE`;
}
