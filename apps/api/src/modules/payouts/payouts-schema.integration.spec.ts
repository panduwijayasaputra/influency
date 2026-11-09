import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USER = '0190a000-0000-7000-8000-0000003b0001';
const OTHER_USER = '0190a000-0000-7000-8000-0000003b0002';

describe('payout tables', () => {
  const prisma = createTestPrisma();
  let creatorId = '';
  let otherCreatorId = '';
  let accountSeq = 0;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: USER, displayName: 'Payout schema creator' },
        { id: OTHER_USER, displayName: 'Payout schema other' },
      ],
    });
    creatorId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USER,
          slug: 'payout-schema-a',
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('A'),
        },
      })
    ).id;
    otherCreatorId = (
      await prisma.creatorProfile.create({
        data: {
          userId: OTHER_USER,
          slug: 'payout-schema-b',
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('B'),
        },
      })
    ).id;
  });

  afterAll(async () => {
    // The tables are append-only on purpose, so a spec cannot delete its rows: disable the guards for the cleanup only.
    await prisma.$executeRawUnsafe(
      'ALTER TABLE creator_payout_status_changes DISABLE TRIGGER USER',
    );
    await prisma.$executeRawUnsafe('ALTER TABLE creator_payouts DISABLE TRIGGER USER');
    await prisma.$executeRawUnsafe('ALTER TABLE creator_payout_accounts DISABLE TRIGGER USER');
    try {
      const where = { creatorProfileId: { in: [creatorId, otherCreatorId] } };
      await prisma.creatorPayoutStatusChange.deleteMany({ where: { payout: where } });
      await prisma.creatorPayout.deleteMany({ where });
      await prisma.creatorPayoutAccount.deleteMany({ where });
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE creator_payout_status_changes ENABLE TRIGGER USER',
      );
      await prisma.$executeRawUnsafe('ALTER TABLE creator_payouts ENABLE TRIGGER USER');
      await prisma.$executeRawUnsafe('ALTER TABLE creator_payout_accounts ENABLE TRIGGER USER');
    }
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: [USER, OTHER_USER] } } });
    await prisma.user.deleteMany({ where: { id: { in: [USER, OTHER_USER] } } });
    await prisma.$disconnect();
  });

  const account = (over: Partial<Prisma.CreatorPayoutAccountUncheckedCreateInput> = {}) =>
    prisma.creatorPayoutAccount.create({
      data: {
        creatorProfileId: creatorId,
        bankCode: 'BCA',
        accountNumberEnc: `v1:test:${accountSeq++}`,
        last4: '4821',
        holderName: 'Nadia Kirana',
        ...over,
      },
    });
  const payout = async (over: Partial<Prisma.CreatorPayoutUncheckedCreateInput> = {}) => {
    const acct = await account();
    return prisma.creatorPayout.create({
      data: {
        creatorProfileId: creatorId,
        payoutAccountId: acct.id,
        bankCode: 'BCA',
        accountLast4: '4821',
        holderName: 'Nadia Kirana',
        amountIdr: 150_000n,
        feeIdr: 2_500n,
        netIdr: 147_500n,
        feeIsPlaceholder: true,
        requestedByUserId: USER,
        ...over,
      },
    });
  };

  describe('creator_payout_accounts', () => {
    /** Each test starts with no active account, whatever the previous test left behind. */
    const clearActive = (creatorProfileId: string) =>
      prisma.creatorPayoutAccount.updateMany({
        where: { creatorProfileId, active: true },
        data: { active: false },
      });

    it('allows only one active, non-deleted account per creator', async () => {
      await clearActive(otherCreatorId);
      await account({ creatorProfileId: otherCreatorId, active: true });
      await expect(account({ creatorProfileId: otherCreatorId, active: true })).rejects.toThrow();
      // Any number of inactive accounts is fine.
      await account({ creatorProfileId: otherCreatorId });
      await account({ creatorProfileId: otherCreatorId });
    });

    it('gives each creator their own active account', async () => {
      await clearActive(creatorId);
      await clearActive(otherCreatorId);
      await account({ creatorProfileId: otherCreatorId, active: true });
      await expect(account({ active: true })).resolves.toMatchObject({ active: true });
    });

    it('lets a new account become active once the old active one is deactivated', async () => {
      await clearActive(creatorId);
      const first = await account({ active: true });
      await expect(account({ active: true })).rejects.toThrow();
      await prisma.creatorPayoutAccount.update({
        where: { id: first.id },
        data: { active: false },
      });
      await expect(account({ active: true })).resolves.toMatchObject({ active: true });
    });

    it('frees the active slot when the active account is soft-deleted', async () => {
      await clearActive(creatorId);
      const first = await account({ active: true });
      await prisma.creatorPayoutAccount.update({
        where: { id: first.id },
        data: { active: false, deletedAt: new Date() },
      });
      await expect(account({ active: true })).resolves.toMatchObject({ active: true });
    });

    it('refuses a deleted account that is still active', async () => {
      const row = await account();
      await expect(
        prisma.creatorPayoutAccount.update({
          where: { id: row.id },
          data: { active: true, deletedAt: new Date() },
        }),
      ).rejects.toThrow();
    });

    it.each([
      ['a last4 that is not 4 digits', { last4: '482' }],
      ['a last4 with letters', { last4: '48a1' }],
      ['an empty holder', { holderName: '' }],
      ['a holder over 100 characters', { holderName: 'x'.repeat(101) }],
    ])('rejects %s', async (_label, over) => {
      await expect(account(over)).rejects.toThrow();
    });

    it('allows only active and soft-delete to change', async () => {
      const row = await account();
      await expect(
        prisma.creatorPayoutAccount.update({ where: { id: row.id }, data: { bankCode: 'BNI' } }),
      ).rejects.toThrow(/allows only/);
      await expect(
        prisma.creatorPayoutAccount.update({ where: { id: row.id }, data: { last4: '0000' } }),
      ).rejects.toThrow(/allows only/);
      const deleted = await prisma.creatorPayoutAccount.update({
        where: { id: row.id },
        data: { deletedAt: new Date() },
      });
      expect(deleted.deletedAt).not.toBeNull();
      // A deleted account stays deleted.
      await expect(
        prisma.creatorPayoutAccount.update({ where: { id: row.id }, data: { deletedAt: null } }),
      ).rejects.toThrow(/allows only/);
    });

    it('is never really deleted', async () => {
      const row = await account();
      await expect(prisma.creatorPayoutAccount.delete({ where: { id: row.id } })).rejects.toThrow(
        /never deleted/,
      );
    });
  });

  describe('creator_payouts', () => {
    it('accepts a valid payout with its snapshot', async () => {
      const row = await payout();
      expect(row).toMatchObject({ status: 'REQUESTED', amountIdr: 150_000n, netIdr: 147_500n });
    });

    it('accepts exactly the minimum, and refuses one rupiah less', async () => {
      await expect(
        payout({ amountIdr: 100_000n, feeIdr: 2_500n, netIdr: 97_500n }),
      ).resolves.toBeDefined();
      await expect(
        payout({ amountIdr: 99_999n, feeIdr: 2_500n, netIdr: 97_499n }),
      ).rejects.toThrow();
    });

    it.each([
      ['a net that is not amount minus fee', { netIdr: 147_000n }],
      ['a net of zero', { amountIdr: 100_000n, feeIdr: 100_000n, netIdr: 0n }],
      ['a negative fee', { feeIdr: -1n, netIdr: 150_001n }],
      ['a net above the amount', { netIdr: 150_001n }],
      ['a last4 that is not 4 digits', { accountLast4: '12' }],
    ])('rejects %s', async (_label, over) => {
      await expect(payout(over)).rejects.toThrow();
    });

    it('stores money as integers beyond 32 bits', async () => {
      const amount = 5_000_000_000n;
      const row = await payout({ amountIdr: amount, feeIdr: 2_500n, netIdr: amount - 2_500n });
      expect(row.amountIdr).toBe(amount);
    });

    it('can move from REQUESTED to a final status, changing nothing else', async () => {
      for (const status of ['CANCELED', 'REJECTED', 'PAID_OUT'] as const) {
        const row = await payout();
        const updated = await prisma.creatorPayout.update({
          where: { id: row.id },
          data: { status },
        });
        expect(updated).toMatchObject({ status, amountIdr: row.amountIdr });
      }
    });

    it('refuses to leave a final status', async () => {
      const row = await payout();
      await prisma.creatorPayout.update({ where: { id: row.id }, data: { status: 'CANCELED' } });
      for (const status of ['REQUESTED', 'PAID_OUT', 'REJECTED'] as const) {
        await expect(
          prisma.creatorPayout.update({ where: { id: row.id }, data: { status } }),
        ).rejects.toThrow(/allows only/);
      }
    });

    it('refuses to change the amount, fee, net or destination, alone or with a status change', async () => {
      const row = await payout();
      for (const data of [
        { amountIdr: 200_000n, netIdr: 197_500n },
        { feeIdr: 1n, netIdr: 149_999n },
        { holderName: 'Someone else' },
        { accountLast4: '0000' },
        { status: 'CANCELED' as const, amountIdr: 200_000n, netIdr: 197_500n },
        { status: 'CANCELED' as const, holderName: 'Someone else' },
      ]) {
        await expect(prisma.creatorPayout.update({ where: { id: row.id }, data })).rejects.toThrow(
          /allows only/,
        );
      }
      expect(await prisma.creatorPayout.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject(
        {
          amountIdr: 150_000n,
          status: 'REQUESTED',
        },
      );
    });

    it('refuses an update that changes nothing but touches the row', async () => {
      const row = await payout();
      await expect(
        prisma.creatorPayout.update({ where: { id: row.id }, data: { status: 'REQUESTED' } }),
      ).rejects.toThrow(/allows only/);
    });

    it('is never deleted', async () => {
      const row = await payout();
      await expect(prisma.creatorPayout.delete({ where: { id: row.id } })).rejects.toThrow(
        /never deleted/,
      );
    });

    it('cannot reference a payout account that is gone', async () => {
      await expect(
        prisma.creatorPayout.create({
          data: {
            creatorProfileId: creatorId,
            payoutAccountId: '0190a000-0000-7000-8000-00000000dead',
            bankCode: 'BCA',
            accountLast4: '4821',
            holderName: 'x',
            amountIdr: 150_000n,
            feeIdr: 0n,
            netIdr: 150_000n,
            feeIsPlaceholder: false,
            requestedByUserId: USER,
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe('creator_payout_status_changes', () => {
    it('records the trail and refuses to change or delete it', async () => {
      const row = await payout();
      const change = await prisma.creatorPayoutStatusChange.create({
        data: { payoutId: row.id, fromStatus: null, toStatus: 'REQUESTED', actorUserId: USER },
      });
      await expect(
        prisma.creatorPayoutStatusChange.update({
          where: { id: change.id },
          data: { toStatus: 'PAID_OUT' },
        }),
      ).rejects.toThrow(/append-only/);
      await expect(
        prisma.creatorPayoutStatusChange.delete({ where: { id: change.id } }),
      ).rejects.toThrow(/append-only/);
    });
  });
});
