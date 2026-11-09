import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  creatorSubscriptionStateSchema,
  SESSION_COOKIE,
  subscribeResponseSchema,
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

// Periods, plans, ledgers and creators are append-only or referenced, so nothing is deleted: fresh rows per test.
describe('POST /creators/:slug/subscribe', () => {
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

  async function newCreator(
    price: bigint | null = 75n,
    status: 'APPROVED' | 'PENDING_REVIEW' = 'APPROVED',
  ) {
    const user = await prisma.user.create({ data: { displayName: 'Sub creator' } });
    const slug = `sub-${RUN}-${++n}`;
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug,
        status,
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Sub'),
      },
    });
    const plan =
      price === null
        ? null
        : await prisma.creatorSubscriptionPlan.create({
            data: { creatorProfileId: profile.id, version: 1, priceCoins: price, active: true },
          });
    return { userId: user.id, profileId: profile.id, slug, plan };
  }
  async function newFan(coins = 0n) {
    const user = await prisma.user.create({ data: { displayName: 'Subscriber' } });
    const token = `sub-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    if (coins > 0n) await topUp(user.id, coins);
    return { id: user.id, token };
  }
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
  const subscribe = (
    fan: { token: string } | undefined,
    slug: string,
    expectedPriceCoins: unknown,
    key: string | null = randomUUID(),
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/creators/${slug}/subscribe`,
      cookies: fan ? { [SESSION_COOKIE]: fan.token } : {},
      headers: { origin, ...(key ? { 'idempotency-key': key } : {}) },
      payload: { expectedPriceCoins } as object,
    });
  const state = (fan: { token: string } | undefined, slug: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/creators/${slug}/subscription`,
      cookies: fan ? { [SESSION_COOKIE]: fan.token } : {},
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const balance = async (userId: string) =>
    (await prisma.coinWallet.findUnique({ where: { userId } }))?.balanceCoins ?? 0n;
  const periods = (userId: string, creatorProfileId: string) =>
    prisma.subscriptionPeriod.findMany({
      where: { userId, creatorProfileId },
      orderBy: { startsAt: 'asc' },
    });
  const debits = (userId: string) =>
    prisma.coinLedgerEntry.count({
      where: { wallet: { userId }, entryType: 'SUBSCRIPTION_DEBIT' },
    });

  it('subscribes for 30 days from now, debits the plan price and splits the revenue 85/15', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(500n);
    const before = Date.now();
    const res = await subscribe(fan, creator.slug, 75);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = subscribeResponseSchema.parse(res.json());
    expect(body).toMatchObject({ priceCoins: 75, scheduled: false, balanceCoins: 425 });
    const startsAt = new Date(body.startsAt).getTime();
    expect(startsAt).toBeGreaterThanOrEqual(before - 1000);
    expect(startsAt).toBeLessThanOrEqual(Date.now() + 1000);
    expect(new Date(body.endsAt).getTime() - startsAt).toBe(30 * DAY);

    const [period] = await periods(fan.id, creator.profileId);
    expect(period).toMatchObject({
      id: body.periodId,
      planId: creator.plan!.id,
      priceCoins: 75n,
      feeBps: 1500,
      durationDays: 30,
      canceledAt: null,
    });
    const entry = await prisma.coinLedgerEntry.findFirstOrThrow({
      where: { wallet: { userId: fan.id }, entryType: 'SUBSCRIPTION_DEBIT' },
    });
    expect(entry).toMatchObject({
      amountCoins: -75n,
      sourceType: 'SUBSCRIPTION_PERIOD',
      sourceId: body.periodId,
    });
    const revenue = await prisma.revenueLedgerEntry.findMany({
      where: { sourceId: body.periodId },
      orderBy: { account: 'asc' },
    });
    expect(revenue.map((r) => [r.account, Number(r.amountIdr), r.feeBps])).toEqual([
      ['CREATOR', 63_750, 1500],
      ['PLATFORM', 11_250, 1500],
    ]);
    expect(revenue.every((r) => r.accruesAt.getTime() === period!.startsAt.getTime())).toBe(true);
  });

  it('prepays one early renewal that starts exactly when the current period ends', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(500n);
    const first = subscribeResponseSchema.parse((await subscribe(fan, creator.slug, 75)).json());
    const second = subscribeResponseSchema.parse((await subscribe(fan, creator.slug, 75)).json());
    expect(second.scheduled).toBe(true);
    expect(second.startsAt).toBe(first.endsAt); // no overlap, no gap
    expect(new Date(second.endsAt).getTime() - new Date(second.startsAt).getTime()).toBe(30 * DAY);
    expect(second.balanceCoins).toBe(350);

    // The 14-day earning clock of a prepaid period starts at its own start, not at the purchase.
    const revenue = await prisma.revenueLedgerEntry.findMany({
      where: { sourceId: second.periodId },
    });
    expect(revenue.every((r) => r.accruesAt.toISOString() === second.startsAt)).toBe(true);

    const viewer = creatorSubscriptionStateSchema.parse(
      (await state(fan, creator.slug)).json(),
    ).viewer!;
    expect(viewer.current?.periodId).toBe(first.periodId);
    expect(viewer.scheduled?.periodId).toBe(second.periodId);
  });

  it('rejects a second scheduled renewal without charging', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(500n);
    await subscribe(fan, creator.slug, 75);
    await subscribe(fan, creator.slug, 75);
    const third = await subscribe(fan, creator.slug, 75);
    expect(third.statusCode).toBe(409);
    expect(errorCode(third)).toBe('RENEWAL_ALREADY_SCHEDULED');
    expect(await balance(fan.id)).toBe(350n);
    expect(await debits(fan.id)).toBe(2);
  });

  it('serialises simultaneous requests: one active + one scheduled period at most', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(1000n);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => subscribe(fan, creator.slug, 75)),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(2);
    const failed = results.filter((r) => r.statusCode !== 200);
    expect(failed.map(errorCode)).toEqual(Array(3).fill('RENEWAL_ALREADY_SCHEDULED'));
    const all = await periods(fan.id, creator.profileId);
    expect(all).toHaveLength(2);
    expect(all[1]!.startsAt.getTime()).toBe(all[0]!.endsAt.getTime());
    expect(await balance(fan.id)).toBe(850n);
  });

  it('starts a new period now after the last one expired', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(500n);
    const startsAt = new Date(Date.now() - 40 * DAY);
    await prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: creator.plan!.id,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * DAY),
      },
    });
    const body = subscribeResponseSchema.parse((await subscribe(fan, creator.slug, 75)).json());
    expect(body.scheduled).toBe(false);
    expect(new Date(body.startsAt).getTime()).toBeGreaterThan(Date.now() - 5000);
    expect(await periods(fan.id, creator.profileId)).toHaveLength(2);
  });

  it('keeps the bought price when the plan changes, and asks again on a stale price', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(500n);
    const first = subscribeResponseSchema.parse((await subscribe(fan, creator.slug, 75)).json());
    await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: creator.profileId, version: 2, priceCoins: 100n, active: true },
    });
    const stale = await subscribe(fan, creator.slug, 75);
    expect(stale.statusCode).toBe(409);
    expect(errorCode(stale)).toBe('OFFER_CHANGED');
    expect(stale.json<{ error: { details: unknown } }>().error.details).toEqual({
      priceCoins: 100,
    });
    const renewal = await subscribe(fan, creator.slug, 100);
    expect(renewal.json()).toMatchObject({ priceCoins: 100, scheduled: true });

    const [a, b] = await periods(fan.id, creator.profileId);
    expect([a!.id, a!.priceCoins, a!.planId]).toEqual([first.periodId, 75n, creator.plan!.id]);
    expect([b!.priceCoins, b!.planId === creator.plan!.id]).toEqual([100n, false]);
  });

  it('replays the same key without a second charge, and rejects it with another payload', async () => {
    const creator = await newCreator(75n);
    const fan = await newFan(500n);
    const key = randomUUID();
    const first = await subscribe(fan, creator.slug, 75, key);
    const again = await subscribe(fan, creator.slug, 75, key);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({
      periodId: first.json<{ periodId: string }>().periodId,
      balanceCoins: 425,
    });
    expect(await debits(fan.id)).toBe(1);
    const other = await subscribe(fan, creator.slug, 80, key);
    expect(other.statusCode).toBe(409);
    expect(errorCode(other)).toBe('DUPLICATE_REQUEST');
  });

  it('rejects what cannot be bought, with no ledger row and no period', async () => {
    const fan = await newFan(500n);
    const noPlan = await newCreator(null);
    const inactive = await newCreator(75n);
    await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: inactive.profileId, version: 2, priceCoins: 75n, active: false },
    });
    const pending = await newCreator(75n, 'PENDING_REVIEW');
    const suspended = await newCreator(75n);
    await prisma.user.update({ where: { id: suspended.userId }, data: { status: 'SUSPENDED' } });
    const cases: [string, string, number, string][] = [
      ['no plan', noPlan.slug, 404, 'PLAN_NOT_AVAILABLE'],
      ['inactive plan', inactive.slug, 404, 'PLAN_NOT_AVAILABLE'],
      ['not approved', pending.slug, 404, 'NOT_FOUND'],
      ['suspended', suspended.slug, 404, 'NOT_FOUND'],
      ['unknown', `nope-${RUN}`, 404, 'NOT_FOUND'],
    ];
    for (const [label, slug, status, code] of cases) {
      const res = await subscribe(fan, slug, 75);
      expect([label, res.statusCode, errorCode(res)]).toEqual([label, status, code]);
    }
    expect(await balance(fan.id)).toBe(500n);
    expect(await debits(fan.id)).toBe(0);
  });

  it('rejects subscribing to yourself, a low balance, and a bad request', async () => {
    const creator = await newCreator(75n);
    const ownToken = `sub-spec-owner-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: creator.userId,
        tokenHash: sha256hex(ownToken),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const own = await subscribe({ token: ownToken }, creator.slug, 75);
    expect(own.statusCode).toBe(400);
    expect(errorCode(own)).toBe('CANNOT_PURCHASE_OWN');

    const poor = await newFan(50n);
    const low = await subscribe(poor, creator.slug, 75);
    expect(low.statusCode).toBe(402);
    expect(low.json<{ error: { details: unknown } }>().error.details).toEqual({
      required: 75,
      available: 50,
    });
    expect(await periods(poor.id, creator.profileId)).toHaveLength(0);

    const fan = await newFan(500n);
    expect((await subscribe(undefined, creator.slug, 75)).statusCode).toBe(401);
    expect((await subscribe(fan, creator.slug, 75, null)).statusCode).toBe(400);
    expect((await subscribe(fan, creator.slug, 9)).statusCode).toBe(400);
    expect((await subscribe(fan, creator.slug, 75.5)).statusCode).toBe(400);
    expect(
      (await subscribe(fan, creator.slug, 75, randomUUID(), 'https://evil.example')).statusCode,
    ).toBe(403);
    expect(await balance(fan.id)).toBe(500n);
  });

  it("does not let one user's period show up for another user or creator", async () => {
    const [c1, c2] = [await newCreator(75n), await newCreator(75n)];
    const [a, b] = [await newFan(500n), await newFan(500n)];
    await subscribe(a, c1.slug, 75);
    const other = creatorSubscriptionStateSchema.parse((await state(b, c1.slug)).json());
    expect(other.viewer).toEqual({ current: null, scheduled: null, canTip: false });
    const elsewhere = creatorSubscriptionStateSchema.parse((await state(a, c2.slug)).json());
    expect(elsewhere.viewer?.current).toBeNull();
  });

  describe('database rules', () => {
    async function insertPeriod(over: Record<string, unknown> = {}) {
      const creator = await newCreator(75n);
      const fan = await newFan();
      const startsAt = new Date(Date.now() + DAY);
      const data = {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: creator.plan!.id,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * DAY),
        ...over,
      };
      return { data, row: await prisma.subscriptionPeriod.create({ data }) };
    }

    it('keeps the LOCKED price, fee and 30-day length', async () => {
      const ok = await insertPeriod();
      for (const bad of [
        { priceCoins: 9n },
        { priceCoins: 5001n },
        { feeBps: 2000 },
        { durationDays: 31 },
        { endsAt: new Date(ok.data.startsAt.getTime() + 31 * DAY) },
      ]) {
        await expect(
          prisma.subscriptionPeriod.create({ data: { ...ok.data, ...bad } }),
        ).rejects.toThrow();
      }
    });

    it('allows a second live period at the same start for nobody', async () => {
      const { data } = await insertPeriod();
      await expect(prisma.subscriptionPeriod.create({ data })).rejects.toThrow();
    });

    it('allows only cancelling a live period, once, and never deleting', async () => {
      const { row } = await insertPeriod();
      await expect(
        prisma.subscriptionPeriod.update({ where: { id: row.id }, data: { priceCoins: 1n } }),
      ).rejects.toThrow(/only cancelling/);
      await expect(prisma.subscriptionPeriod.delete({ where: { id: row.id } })).rejects.toThrow(
        /never deleted/,
      );
      await prisma.subscriptionPeriod.update({
        where: { id: row.id },
        data: { canceledAt: new Date() },
      });
      await expect(
        prisma.subscriptionPeriod.update({
          where: { id: row.id },
          data: { canceledAt: new Date() },
        }),
      ).rejects.toThrow(/only cancelling/);
    });
  });
});
