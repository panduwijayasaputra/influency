import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { earningsBalanceSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { dbNow } from '../../common/db-time.js';
import { RevenueLedgerService } from '../financial-ledger/revenue-ledger.service.js';
import { EarningsService } from './earnings.service.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const DAY = 86_400_000;
const PENDING_DAYS = 14;

// Revenue rows and payouts are append-only (and their creator is referenced), so nothing is deleted: a fresh creator
// per test, with LEFTOVER_CREATED_AT so the leftovers sink in ranked lists.
type Creator = { userId: string; creatorProfileId: string; token: string };

describe('GET /api/v1/me/earnings', () => {
  const prisma = createTestPrisma();
  const revenue = new RevenueLedgerService();
  let app: NestFastifyApplication;
  let earnings: EarningsService;
  // Sessions are created once, here: the auth spec counts sessions across a request, so a spec must not create them
  // while its tests run.
  let http: Creator;
  let pending: Creator;

  beforeAll(async () => {
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    earnings = app.get(EarningsService);
    http = await newCreator('APPROVED', true);
    pending = await newCreator('PENDING_REVIEW', true);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newCreator(
    status: 'APPROVED' | 'PENDING_REVIEW' = 'APPROVED',
    withSession = false,
  ) {
    const user = await prisma.user.create({ data: { displayName: 'Earnings spec' } });
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug: `earn-${randomUUID().slice(0, 10)}`,
        status,
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Earnings'),
      },
    });
    const token = `earnings-spec-${randomUUID()}`;
    if (withSession) {
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256hex(token),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    return { userId: user.id, creatorProfileId: profile.id, token };
  }

  /** A sale posted through the real ledger service (a CREATOR row and, when there is a fee, a PLATFORM row). */
  const sale = (
    creator: Creator,
    opts: {
      coins: bigint;
      feeBps: number;
      accruesAt: Date;
      type?: 'POST_PURCHASE' | 'SUBSCRIPTION_PERIOD' | 'TIP';
      sourceId?: string;
    },
  ) => {
    const sourceId = opts.sourceId ?? randomUUID();
    return prisma
      .$transaction((tx) =>
        revenue.postSaleInTx(tx, {
          creatorProfileId: creator.creatorProfileId,
          sourceType: opts.type ?? 'POST_PURCHASE',
          sourceId,
          coins: opts.coins,
          feeBps: opts.feeBps,
          accruesAt: opts.accruesAt,
        }),
      )
      .then(() => sourceId);
  };
  const daysFromNow = async (days: number) =>
    new Date((await dbNow(prisma)).getTime() + days * DAY);

  async function payout(
    creator: Creator,
    amountIdr: bigint,
    status: 'REQUESTED' | 'CANCELED' | 'PAID_OUT' = 'REQUESTED',
  ) {
    const account = await prisma.creatorPayoutAccount.create({
      data: {
        creatorProfileId: creator.creatorProfileId,
        bankCode: 'BCA',
        accountNumberEnc: 'v1:test',
        last4: '4821',
        holderName: 'Spec',
      },
    });
    const row = await prisma.creatorPayout.create({
      data: {
        creatorProfileId: creator.creatorProfileId,
        payoutAccountId: account.id,
        bankCode: 'BCA',
        accountLast4: '4821',
        holderName: 'Spec',
        amountIdr,
        feeIdr: 2_500n,
        netIdr: amountIdr - 2_500n,
        feeIsPlaceholder: true,
        requestedByUserId: creator.userId,
      },
    });
    if (status !== 'REQUESTED') {
      await prisma.creatorPayout.update({ where: { id: row.id }, data: { status } });
    }
  }

  const get = (creator?: Creator) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/me/earnings',
      cookies: creator ? { influency_session: creator.token } : {},
    });
  const balanceOf = async (creator: Creator) =>
    earningsBalanceSchema.parse(await earnings.balance(creator.creatorProfileId));

  it('is all zero for a creator with no sales', async () => {
    const creator = await newCreator();
    expect(await balanceOf(creator)).toEqual({
      pendingIdr: 0,
      availableIdr: 0,
      reservedIdr: 0,
      paidOutIdr: 0,
      nextMaturityAt: null,
      nextMaturityIdr: 0,
    });
  });

  it('splits matured from pending by 14 days, counting only the creator share', async () => {
    const creator = await newCreator();
    // 25 Koin unlock: creator Rp20.000 (the PLATFORM Rp5.000 row must not count).
    await sale(creator, { coins: 25n, feeBps: 2000, accruesAt: await daysFromNow(-15) });
    // 10 Koin tip, 13 days ago: still pending for another day.
    const tipAccrues = await daysFromNow(-13);
    await sale(creator, { coins: 10n, feeBps: 0, accruesAt: tipAccrues, type: 'TIP' });
    const balance = await balanceOf(creator);
    expect(balance).toMatchObject({ availableIdr: 20_000, pendingIdr: 10_000, reservedIdr: 0 });
    expect(balance.nextMaturityAt).toBe(
      new Date(tipAccrues.getTime() + PENDING_DAYS * DAY).toISOString(),
    );
    expect(balance.nextMaturityIdr).toBe(10_000);
  });

  it('moves a row from pending to available exactly when its 14 days pass', async () => {
    const creator = await newCreator();
    // Matures 2 seconds from now.
    const accruesAt = new Date((await dbNow(prisma)).getTime() - PENDING_DAYS * DAY + 2_000);
    await sale(creator, { coins: 10n, feeBps: 0, accruesAt, type: 'TIP' });
    expect(await balanceOf(creator)).toMatchObject({ pendingIdr: 10_000, availableIdr: 0 });
    await new Promise((resolve) => setTimeout(resolve, 2_400));
    expect(await balanceOf(creator)).toMatchObject({
      pendingIdr: 0,
      availableIdr: 10_000,
      nextMaturityAt: null,
    });
  });

  it('keeps a scheduled period pending until 14 days after it starts', async () => {
    const creator = await newCreator();
    // A prepaid renewal that starts in 10 days: 150 Koin, 15% fee -> Rp127.500.
    const startsAt = await daysFromNow(10);
    await sale(creator, {
      coins: 150n,
      feeBps: 1500,
      accruesAt: startsAt,
      type: 'SUBSCRIPTION_PERIOD',
    });
    const balance = await balanceOf(creator);
    expect(balance).toMatchObject({
      pendingIdr: 127_500,
      availableIdr: 0,
      nextMaturityIdr: 127_500,
    });
    expect(balance.nextMaturityAt).toBe(
      new Date(startsAt.getTime() + PENDING_DAYS * DAY).toISOString(),
    );
  });

  it('a cancelled scheduled renewal never becomes available and is not the next maturity', async () => {
    const creator = await newCreator();
    const cancelled = await sale(creator, {
      coins: 150n,
      feeBps: 1500,
      accruesAt: await daysFromNow(5),
      type: 'SUBSCRIPTION_PERIOD',
    });
    await prisma.$transaction((tx) =>
      revenue.reverseSaleInTx(tx, { sourceType: 'SUBSCRIPTION_PERIOD', sourceId: cancelled }),
    );
    // A real sale that matures later than the cancelled one would have.
    const kept = await daysFromNow(8);
    await sale(creator, { coins: 50n, feeBps: 1500, accruesAt: kept, type: 'SUBSCRIPTION_PERIOD' });
    const balance = await balanceOf(creator);
    expect(balance).toMatchObject({ pendingIdr: 42_500, availableIdr: 0, nextMaturityIdr: 42_500 });
    expect(balance.nextMaturityAt).toBe(
      new Date(kept.getTime() + PENDING_DAYS * DAY).toISOString(),
    );
  });

  it('nets a reversed sale to zero even after its 14 days', async () => {
    const creator = await newCreator();
    const id = await sale(creator, { coins: 25n, feeBps: 2000, accruesAt: await daysFromNow(-20) });
    await prisma.$transaction((tx) =>
      revenue.reverseSaleInTx(tx, { sourceType: 'POST_PURCHASE', sourceId: id }),
    );
    expect(await balanceOf(creator)).toMatchObject({ availableIdr: 0, pendingIdr: 0 });
  });

  it('subtracts reserved and paid payouts and ignores cancelled ones', async () => {
    const creator = await newCreator();
    await sale(creator, { coins: 1000n, feeBps: 2000, accruesAt: await daysFromNow(-30) }); // Rp800.000
    await payout(creator, 150_000n, 'REQUESTED');
    await payout(creator, 100_000n, 'PAID_OUT');
    await payout(creator, 120_000n, 'CANCELED');
    expect(await balanceOf(creator)).toMatchObject({
      availableIdr: 800_000 - 150_000 - 100_000,
      reservedIdr: 150_000,
      paidOutIdr: 100_000,
    });
  });

  it('never goes negative: it reports 0 and logs the inconsistency', async () => {
    const creator = await newCreator();
    await sale(creator, { coins: 125n, feeBps: 2000, accruesAt: await daysFromNow(-20) }); // Rp100.000
    await payout(creator, 150_000n, 'REQUESTED');
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      expect(await balanceOf(creator)).toMatchObject({ availableIdr: 0, reservedIdr: 150_000 });
      expect(logged).toHaveBeenCalledWith(expect.stringContaining(creator.creatorProfileId));
    } finally {
      logged.mockRestore();
    }
  });

  it('sums the next maturity by Jakarta calendar day, not UTC day', async () => {
    const creator = await newCreator();
    const now = new Date();
    const [y, m, d] = [now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 3];
    // Matures at 03:00 WIB and 20:00 WIB on day D (UTC: D-1 20:00 and D 13:00), and 01:00 WIB on D+1 (UTC: D 18:00).
    const matures = [Date.UTC(y, m, d, -4), Date.UTC(y, m, d, 13), Date.UTC(y, m, d, 18)];
    const coins = [10n, 20n, 40n];
    for (const [i, at] of matures.entries()) {
      await sale(creator, {
        coins: coins[i]!,
        feeBps: 0,
        accruesAt: new Date(at - PENDING_DAYS * DAY),
        type: 'TIP',
      });
    }
    const balance = await balanceOf(creator);
    expect(balance.pendingIdr).toBe(70_000);
    expect(balance.nextMaturityAt).toBe(new Date(matures[0]!).toISOString());
    // Only the first two fall on the same Jakarta day as the earliest.
    expect(balance.nextMaturityIdr).toBe(30_000);
  });

  it('handles amounts beyond 32 bits', async () => {
    const creator = await newCreator();
    await sale(creator, {
      coins: 5_000_000n,
      feeBps: 0,
      accruesAt: await daysFromNow(-20),
      type: 'TIP',
    });
    expect((await balanceOf(creator)).availableIdr).toBe(5_000_000_000);
  });

  it("never mixes in another creator's sales or payouts", async () => {
    const mine = await newCreator();
    const other = await newCreator();
    await sale(other, { coins: 100n, feeBps: 0, accruesAt: await daysFromNow(-20), type: 'TIP' });
    await payout(other, 100_000n, 'PAID_OUT');
    expect(await balanceOf(mine)).toMatchObject({
      availableIdr: 0,
      pendingIdr: 0,
      reservedIdr: 0,
      paidOutIdr: 0,
    });
  });

  it('serves the same balance over HTTP, with exactly the balance fields, uncached', async () => {
    await sale(http, { coins: 25n, feeBps: 2000, accruesAt: await daysFromNow(-15) });
    const res = await get(http);
    expect(res.statusCode).toBe(200);
    expect(earningsBalanceSchema.parse(res.json())).toEqual(await balanceOf(http));
    expect(res.json<{ availableIdr: number }>().availableIdr).toBeGreaterThanOrEqual(20_000);
    expect(Object.keys(res.json<object>()).sort()).toEqual(
      [
        'availableIdr',
        'nextMaturityAt',
        'nextMaturityIdr',
        'paidOutIdr',
        'pendingIdr',
        'reservedIdr',
      ].sort(),
    );
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('401s a guest and 403s a user whose creator profile is not approved', async () => {
    expect((await get()).statusCode).toBe(401);
    const res = await get(pending);
    expect(res.statusCode).toBe(403);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('CREATOR_NOT_APPROVED');
  });
});
