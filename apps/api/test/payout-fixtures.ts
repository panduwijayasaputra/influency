import { randomUUID } from 'node:crypto';
import { sha256hex } from '../src/common/crypto.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { RevenueLedgerService } from '../src/modules/financial-ledger/revenue-ledger.service.js';
import { LEFTOVER_CREATED_AT, profileFields } from './creator-profile.js';

export interface TestCreator {
  userId: string;
  creatorProfileId: string;
  /** Session cookie value; only meaningful when the creator was made with `withSession`. */
  token: string;
}

const DAY = 86_400_000;

/**
 * Helpers for specs of the payouts feature. Their tables are append-only (and their creators are referenced), so specs
 * never delete: a fresh creator per test, with LEFTOVER_CREATED_AT so the leftovers sink in ranked lists. Create
 * sessions only in `beforeAll` (the auth spec counts sessions across a request).
 */
export function payoutFixtures(prisma: PrismaClient) {
  const revenue = new RevenueLedgerService();

  async function newUser(withSession = false): Promise<TestCreator> {
    const user = await prisma.user.create({ data: { displayName: 'Payout spec' } });
    const token = `payout-spec-${randomUUID()}`;
    if (withSession) {
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256hex(token),
          expiresAt: new Date(Date.now() + DAY),
        },
      });
    }
    return { userId: user.id, creatorProfileId: '', token };
  }

  async function newCreator(withSession = false): Promise<TestCreator> {
    const user = await newUser(withSession);
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.userId,
        slug: `payout-${randomUUID().slice(0, 10)}`,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Payout'),
      },
    });
    return { ...user, creatorProfileId: profile.id };
  }

  /**
   * Matured earnings: a tip of `idr` rupiah (a whole number of thousands, fee 0) that accrued `daysAgo` days ago, so
   * the full amount is available. Use a small `daysAgo` for pending money.
   */
  async function earn(creator: TestCreator, idr: number, daysAgo = 30): Promise<void> {
    if (idr % 1000 !== 0)
      throw new Error('earn() takes whole thousands of rupiah (1 Koin = Rp1.000)');
    await prisma.$transaction((tx) =>
      revenue.postSaleInTx(tx, {
        creatorProfileId: creator.creatorProfileId,
        sourceType: 'TIP',
        sourceId: randomUUID(),
        coins: BigInt(idr / 1000),
        feeBps: 0,
        accruesAt: new Date(Date.now() - daysAgo * DAY),
      }),
    );
  }

  /** An account row inserted directly (the encrypted value is a stand-in: these specs never decrypt it). */
  async function addAccount(
    creator: TestCreator,
    over: { active?: boolean; last4?: string; bankCode?: string; holderName?: string } = {},
  ) {
    return prisma.creatorPayoutAccount.create({
      data: {
        creatorProfileId: creator.creatorProfileId,
        bankCode: over.bankCode ?? 'BCA',
        accountNumberEnc: `v1:test:${randomUUID()}`,
        last4: over.last4 ?? '4821',
        holderName: over.holderName ?? 'Nadia Kirana',
        active: over.active ?? true,
      },
    });
  }

  return { newUser, newCreator, earn, addAccount };
}
