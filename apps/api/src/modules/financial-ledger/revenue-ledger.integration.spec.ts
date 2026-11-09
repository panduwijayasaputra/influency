import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { RevenueLedgerService } from './revenue-ledger.service.js';
import { FEE_BPS } from './split-revenue.js';

// Revenue rows are append-only (and their creator is referenced), so nothing is deleted: fresh ids per test.
describe('RevenueLedgerService', () => {
  const prisma = createTestPrisma();
  const revenue = new RevenueLedgerService();
  let creatorProfileId: string;

  beforeAll(async () => {
    const user = await prisma.user.create({ data: { displayName: 'Revenue spec' } });
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: user.id,
          slug: `rev-${randomUUID().slice(0, 8)}`,
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('Revenue'),
        },
      })
    ).id;
  });
  afterAll(() => prisma.$disconnect());

  const sale = (sourceId: string, coins: bigint, feeBps: number) =>
    prisma.$transaction((tx) =>
      revenue.postSaleInTx(tx, {
        creatorProfileId,
        sourceType: 'POST_PURCHASE',
        sourceId,
        coins,
        feeBps,
        accruesAt: new Date(),
      }),
    );
  const rows = (sourceId: string) =>
    prisma.revenueLedgerEntry.findMany({
      where: { sourceId },
      orderBy: [{ kind: 'asc' }, { account: 'asc' }],
    });

  it('posts a 25-Koin premium unlock as creator Rp20.000 and platform Rp5.000', async () => {
    const id = randomUUID();
    await sale(id, 25n, FEE_BPS.POST_PURCHASE);
    const got = await rows(id);
    expect(
      got.map((r) => [r.account, r.kind, Number(r.amountIdr), Number(r.grossIdr), r.feeBps]),
    ).toEqual([
      ['CREATOR', 'SALE', 20_000, 25_000, 2000],
      ['PLATFORM', 'SALE', 5_000, 25_000, 2000],
    ]);
    expect(got[0]!.creatorProfileId).toBe(creatorProfileId);
    expect(got[1]!.creatorProfileId).toBe(creatorProfileId); // PLATFORM rows stay traceable
  });

  it('writes no PLATFORM row when the fee is 0 (tips)', async () => {
    const id = randomUUID();
    await sale(id, 20n, FEE_BPS.TIP);
    expect((await rows(id)).map((r) => [r.account, Number(r.amountIdr)])).toEqual([
      ['CREATOR', 20_000],
    ]);
  });

  it('posts a source once: a second sale for it fails and leaves nothing extra', async () => {
    const id = randomUUID();
    await sale(id, 10n, FEE_BPS.POST_PURCHASE);
    await expect(sale(id, 10n, FEE_BPS.POST_PURCHASE)).rejects.toThrow();
    expect(await rows(id)).toHaveLength(2);
  });

  it('reverses a sale with mirror rows, once', async () => {
    const id = randomUUID();
    await sale(id, 75n, FEE_BPS.SUBSCRIPTION);
    const reverse = () =>
      prisma.$transaction((tx) =>
        revenue.reverseSaleInTx(tx, { sourceType: 'POST_PURCHASE', sourceId: id }),
      );
    await reverse();
    const got = await rows(id);
    const net = (account: string) =>
      got.filter((r) => r.account === account).reduce((n, r) => n + r.amountIdr, 0n);
    expect(got).toHaveLength(4);
    expect(net('CREATOR')).toBe(0n);
    expect(net('PLATFORM')).toBe(0n);
    expect(
      got
        .filter((r) => r.kind === 'REVERSAL')
        .map((r) => Number(r.amountIdr))
        .sort((a, b) => a - b),
    ).toEqual([-63_750, -11_250]);
    await expect(reverse()).rejects.toThrow();
    expect(await rows(id)).toHaveLength(4);
  });

  it('refuses to reverse a source that has no sale', async () => {
    await expect(
      prisma.$transaction((tx) =>
        revenue.reverseSaleInTx(tx, { sourceType: 'POST_PURCHASE', sourceId: randomUUID() }),
      ),
    ).rejects.toThrow(/no sale/);
  });

  it('is append-only and keeps the sign and fee rules in the database', async () => {
    const id = randomUUID();
    await sale(id, 5n, FEE_BPS.POST_PURCHASE);
    const [row] = await rows(id);
    await expect(
      prisma.revenueLedgerEntry.update({ where: { id: row!.id }, data: { amountIdr: 1n } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.revenueLedgerEntry.delete({ where: { id: row!.id } })).rejects.toThrow(
      /append-only/,
    );
    const base = {
      creatorProfileId,
      account: 'CREATOR' as const,
      grossIdr: 1000n,
      feeBps: 0,
      sourceType: 'POST_PURCHASE' as const,
      accruesAt: new Date(),
    };
    await expect(
      prisma.revenueLedgerEntry.create({
        data: { ...base, sourceId: randomUUID(), kind: 'SALE', amountIdr: -5n },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.revenueLedgerEntry.create({
        data: { ...base, sourceId: randomUUID(), kind: 'REVERSAL', amountIdr: 5n },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.revenueLedgerEntry.create({
        data: { ...base, sourceId: randomUUID(), kind: 'SALE', amountIdr: 5n, feeBps: 10_001 },
      }),
    ).rejects.toThrow();
  });
});
