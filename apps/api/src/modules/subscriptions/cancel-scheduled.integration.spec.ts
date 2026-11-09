import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  cancelScheduledResponseSchema,
  creatorSubscriptionStateSchema,
  SESSION_COOKIE,
  subscribeResponseSchema,
  walletTransactionsPageSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { WalletsService } from '../wallets/wallets.service.js';

const WEB_ORIGIN = 'http://localhost:3000';
const RUN = randomUUID().slice(0, 8);
const DAY = 86_400_000;

// Periods, ledgers and creators are append-only or referenced, so nothing is deleted: fresh rows per test.
describe('POST /subscription-periods/:id/cancel-scheduled', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let wallets: WalletsService;
  let appPrisma: PrismaService;
  let n = 0;

  beforeAll(async () => {
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    wallets = app.get(WalletsService);
    appPrisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newCreator() {
    const user = await prisma.user.create({ data: { displayName: 'Cancel creator' } });
    const slug = `cnl-${RUN}-${++n}`;
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Cancel'),
      },
    });
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: profile.id, version: 1, priceCoins: 75n, active: true },
    });
    return { profileId: profile.id, slug, planId: plan.id };
  }
  type Creator = Awaited<ReturnType<typeof newCreator>>;
  async function newFan(coins = 0n) {
    const user = await prisma.user.create({ data: { displayName: 'Canceller' } });
    const token = `cnl-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    // Two top-ups = two lots, so a refund has to restore more than one of them.
    if (coins > 0n) {
      await topUp(user.id, coins / 2n);
      await topUp(user.id, coins - coins / 2n);
    }
    return { id: user.id, token };
  }
  type Fan = Awaited<ReturnType<typeof newFan>>;
  const topUp = (userId: string, coins: bigint) =>
    appPrisma.$transaction((tx) =>
      wallets.creditInTx(tx, {
        userId,
        coins,
        entryType: 'TOPUP_CREDIT',
        sourceType: 'TOPUP_ORDER',
        sourceId: randomUUID(),
        basisIdr: coins * 1000n,
      }),
    );
  const cookies = (fan: Fan | undefined): Record<string, string> =>
    fan ? { [SESSION_COOKIE]: fan.token } : {};
  const subscribe = async (fan: Fan, creator: Creator) =>
    subscribeResponseSchema.parse(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/creators/${creator.slug}/subscribe`,
          cookies: cookies(fan),
          headers: { origin: WEB_ORIGIN, 'idempotency-key': randomUUID() },
          payload: { expectedPriceCoins: 75 },
        })
      ).json(),
    );
  const cancel = (fan: Fan | undefined, periodId: string, origin = WEB_ORIGIN) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/subscription-periods/${periodId}/cancel-scheduled`,
      cookies: cookies(fan),
      headers: { origin },
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const wallet = (userId: string) => prisma.coinWallet.findUniqueOrThrow({ where: { userId } });
  const lots = async (userId: string) =>
    (
      await prisma.coinLot.findMany({
        where: { wallet: { userId } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      })
    ).map((l) => l.unspentCoins);
  const entries = (
    userId: string,
    entryType: 'SUBSCRIPTION_DEBIT' | 'SUBSCRIPTION_REFUND_CREDIT',
  ) => prisma.coinLedgerEntry.count({ where: { wallet: { userId }, entryType } });

  it('cancels a prepaid renewal: full Koin back, lots restored, revenue reversed, active period untouched', async () => {
    const creator = await newCreator();
    const fan = await newFan(500n);
    const first = await subscribe(fan, creator);
    const lotsAfterFirst = await lots(fan.id);
    const renewal = await subscribe(fan, creator);
    expect(renewal.scheduled).toBe(true);
    expect((await wallet(fan.id)).balanceCoins).toBe(350n);

    const res = await cancel(fan, renewal.periodId);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(cancelScheduledResponseSchema.parse(res.json())).toEqual({
      periodId: renewal.periodId,
      refundedCoins: 75,
      balanceCoins: 425,
    });

    const period = await prisma.subscriptionPeriod.findUniqueOrThrow({
      where: { id: renewal.periodId },
    });
    expect(period.canceledAt).not.toBeNull();
    // The Koin went back to exactly the lots they came from.
    expect(await lots(fan.id)).toEqual(lotsAfterFirst);
    const credit = await prisma.coinLedgerEntry.findFirstOrThrow({
      where: { wallet: { userId: fan.id }, entryType: 'SUBSCRIPTION_REFUND_CREDIT' },
    });
    expect(credit).toMatchObject({
      amountCoins: 75n,
      balanceAfterCoins: 425n,
      sourceType: 'SUBSCRIPTION_PERIOD',
      sourceId: renewal.periodId,
    });
    // The original debit was never touched.
    expect(await entries(fan.id, 'SUBSCRIPTION_DEBIT')).toBe(2);

    const revenue = await prisma.revenueLedgerEntry.findMany({
      where: { sourceId: renewal.periodId },
    });
    const net = (account: string) =>
      revenue.filter((r) => r.account === account).reduce((sum, r) => sum + r.amountIdr, 0n);
    expect(revenue).toHaveLength(4);
    expect([net('CREATOR'), net('PLATFORM')]).toEqual([0n, 0n]);
    expect(
      revenue
        .filter((r) => r.kind === 'REVERSAL')
        .map((r) => Number(r.amountIdr))
        .sort((a, b) => a - b),
    ).toEqual([-63_750, -11_250]);

    // The active period is unchanged, and the viewer no longer has a scheduled one.
    const state = creatorSubscriptionStateSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/v1/creators/${creator.slug}/subscription`,
          cookies: cookies(fan),
        })
      ).json(),
    );
    expect(state.viewer?.current?.periodId).toBe(first.periodId);
    expect(state.viewer?.scheduled).toBeNull();
    // Lots still add up to the balance.
    expect((await lots(fan.id)).reduce((a, b) => a + b, 0n)).toBe(
      (await wallet(fan.id)).balanceCoins,
    );
  });

  it('returns the Koin once, however often or how many at the same time it is cancelled', async () => {
    const creator = await newCreator();
    const fan = await newFan(500n);
    await subscribe(fan, creator);
    const renewal = await subscribe(fan, creator);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => cancel(fan, renewal.periodId)),
    );
    expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(200));
    for (const r of results) {
      expect(r.json()).toMatchObject({ refundedCoins: 75, balanceCoins: 425 });
    }
    expect(await entries(fan.id, 'SUBSCRIPTION_REFUND_CREDIT')).toBe(1);
    expect((await wallet(fan.id)).balanceCoins).toBe(425n);
    const again = await cancel(fan, renewal.periodId);
    expect(again.json()).toMatchObject({ refundedCoins: 75, balanceCoins: 425 });
    expect(await entries(fan.id, 'SUBSCRIPTION_REFUND_CREDIT')).toBe(1);
  });

  it('rejects cancelling a period that already started or ended, without any credit', async () => {
    const creator = await newCreator();
    const fan = await newFan(500n);
    const active = await subscribe(fan, creator);
    const res = await cancel(fan, active.periodId);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('RENEWAL_ALREADY_STARTED');

    const startsAt = new Date(Date.now() - 100); // started a moment ago
    const justStarted = await prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: creator.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt: new Date(startsAt.getTime() - 60 * DAY),
        endsAt: new Date(startsAt.getTime() - 30 * DAY),
      },
    });
    expect(errorCode(await cancel(fan, justStarted.id))).toBe('RENEWAL_ALREADY_STARTED'); // ended
    expect(await entries(fan.id, 'SUBSCRIPTION_REFUND_CREDIT')).toBe(0);
    expect((await wallet(fan.id)).balanceCoins).toBe(425n);
    const live = await prisma.subscriptionPeriod.findUniqueOrThrow({
      where: { id: active.periodId },
    });
    expect(live.canceledAt).toBeNull();
  });

  it("answers 404 for someone else's, unknown and malformed ids, 401 for guests and 403 cross-origin", async () => {
    const creator = await newCreator();
    const [owner, other] = [await newFan(500n), await newFan(500n)];
    await subscribe(owner, creator);
    const renewal = await subscribe(owner, creator);
    expect((await cancel(other, renewal.periodId)).statusCode).toBe(404);
    expect((await cancel(owner, randomUUID())).statusCode).toBe(404);
    expect((await cancel(owner, 'not-a-uuid')).statusCode).toBe(404);
    expect((await cancel(undefined, renewal.periodId)).statusCode).toBe(401);
    expect((await cancel(owner, renewal.periodId, 'https://evil.example')).statusCode).toBe(403);
    const untouched = await prisma.subscriptionPeriod.findUniqueOrThrow({
      where: { id: renewal.periodId },
    });
    expect(untouched.canceledAt).toBeNull();
    expect(await entries(owner.id, 'SUBSCRIPTION_REFUND_CREDIT')).toBe(0);
    expect((await wallet(other.id)).balanceCoins).toBe(500n);
  });

  it('lets the user prepay a renewal again after cancelling one', async () => {
    const creator = await newCreator();
    const fan = await newFan(500n);
    const first = await subscribe(fan, creator);
    const renewal = await subscribe(fan, creator);
    await cancel(fan, renewal.periodId);
    const again = await subscribe(fan, creator);
    expect(again.scheduled).toBe(true);
    expect(again.startsAt).toBe(first.endsAt);
    expect(again.periodId).not.toBe(renewal.periodId);
    expect((await wallet(fan.id)).balanceCoins).toBe(350n);
  });

  it('posts a refund credit only once per source in the database', async () => {
    const creator = await newCreator();
    const fan = await newFan(500n);
    await subscribe(fan, creator);
    const renewal = await subscribe(fan, creator);
    await cancel(fan, renewal.periodId);
    await expect(
      appPrisma.$transaction((tx) =>
        wallets.refundSpendInTx(tx, {
          userId: fan.id,
          debit: {
            sourceType: 'SUBSCRIPTION_PERIOD',
            sourceId: renewal.periodId,
            entryType: 'SUBSCRIPTION_DEBIT',
          },
          creditEntryType: 'SUBSCRIPTION_REFUND_CREDIT',
        }),
      ),
    ).rejects.toThrow();
    expect((await wallet(fan.id)).balanceCoins).toBe(425n);
    expect((await lots(fan.id)).reduce((a, b) => a + b, 0n)).toBe(425n);
  });

  it('shows the refund in the wallet activity with the creator and a link', async () => {
    const creator = await newCreator();
    const fan = await newFan(500n);
    await subscribe(fan, creator);
    const renewal = await subscribe(fan, creator);
    await cancel(fan, renewal.periodId);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/transactions',
      cookies: cookies(fan),
    });
    const items = walletTransactionsPageSchema.parse(res.json()).items;
    expect(items[0]).toMatchObject({
      type: 'SUBSCRIPTION_REFUND_CREDIT',
      amountCoins: 75,
      detail: 'Cancel',
      href: `/${creator.slug}`,
    });
    expect(items[1]).toMatchObject({ type: 'SUBSCRIPTION_DEBIT', amountCoins: -75 });
  });
});
