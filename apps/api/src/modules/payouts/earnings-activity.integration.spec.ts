import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  type EarningsActivityPage,
  earningsActivityPageSchema,
  type EarningsActivityType,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { dbNow } from '../../common/db-time.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { RevenueLedgerService } from '../financial-ledger/revenue-ledger.service.js';
import { WALLET_PAGE_SIZE } from '../wallets/wallets.service.js';
import { EarningsService } from './earnings.service.js';

const DAY = 86_400_000;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type Creator = { userId: string; creatorProfileId: string; token: string };

// Source rows, ledger rows and payouts are append-only (and their creator is referenced), so nothing is deleted: a
// fresh creator per test, with LEFTOVER_CREATED_AT so the leftovers sink in ranked lists.
describe('GET /api/v1/me/earnings/activity', () => {
  const prisma = createTestPrisma();
  const revenue = new RevenueLedgerService();
  let app: NestFastifyApplication;
  let earnings: EarningsService;
  // Sessions are created once, here: the auth spec counts sessions across a request.
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
  ): Promise<Creator> {
    const user = await prisma.user.create({ data: { displayName: 'Activity spec' } });
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug: `act-${randomUUID().slice(0, 10)}`,
        status,
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Activity'),
      },
    });
    const token = `activity-spec-${randomUUID()}`;
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

  const buyer = (name: string) => prisma.user.create({ data: { displayName: name } });
  const post = (creator: Creator, caption: string) =>
    prisma.post.create({
      data: {
        creatorProfileId: creator.creatorProfileId,
        visibility: 'PREMIUM',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        caption,
      },
    });
  const postSale = (
    creator: Creator,
    sourceType: 'POST_PURCHASE' | 'SUBSCRIPTION_PERIOD' | 'TIP',
    sourceId: string,
    coins: bigint,
    feeBps: number,
    accruesAt: Date,
  ) =>
    prisma.$transaction((tx) =>
      revenue.postSaleInTx(tx, {
        creatorProfileId: creator.creatorProfileId,
        sourceType,
        sourceId,
        coins,
        feeBps,
        accruesAt,
      }),
    );

  /** A real post purchase (source row) and its ledger sale. */
  async function unlock(
    creator: Creator,
    opts: { buyer: string; caption?: string; coins?: bigint; accruesAt?: Date },
  ) {
    const coins = opts.coins ?? 25n;
    const user = await buyer(opts.buyer);
    const p = await post(creator, opts.caption ?? 'Rain-day roll');
    const offer = await prisma.postOffer.create({
      data: { postId: p.id, version: 1, priceCoins: coins },
    });
    const purchase = await prisma.postPurchase.create({
      data: {
        userId: user.id,
        postId: p.id,
        postOfferId: offer.id,
        priceCoins: coins,
        feeBps: 2000,
      },
    });
    await postSale(
      creator,
      'POST_PURCHASE',
      purchase.id,
      coins,
      2000,
      opts.accruesAt ?? new Date(),
    );
    return { purchaseId: purchase.id, buyerId: user.id };
  }

  /** A real 30-day subscription period and its ledger sale. */
  async function subscribe(
    creator: Creator,
    opts: { buyer: string; coins?: bigint; startsAt?: Date },
  ) {
    const coins = opts.coins ?? 150n;
    const user = await buyer(opts.buyer);
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: {
        creatorProfileId: creator.creatorProfileId,
        version: 1,
        priceCoins: coins,
        active: true,
      },
    });
    const startsAt = opts.startsAt ?? new Date();
    const period = await prisma.subscriptionPeriod.create({
      data: {
        userId: user.id,
        creatorProfileId: creator.creatorProfileId,
        planId: plan.id,
        priceCoins: coins,
        feeBps: 1500,
        durationDays: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * DAY),
      },
    });
    await postSale(creator, 'SUBSCRIPTION_PERIOD', period.id, coins, 1500, startsAt);
    return { periodId: period.id };
  }

  /** A real tip on a post (or on the creator when `caption` is undefined) and its ledger sale. */
  async function tip(creator: Creator, opts: { buyer: string; coins?: bigint; caption?: string }) {
    const coins = opts.coins ?? 10n;
    const user = await buyer(opts.buyer);
    const p = opts.caption === undefined ? null : await post(creator, opts.caption);
    const row = await prisma.tip.create({
      data: {
        userId: user.id,
        creatorProfileId: creator.creatorProfileId,
        postId: p?.id ?? null,
        amountCoins: coins,
      },
    });
    await postSale(creator, 'TIP', row.id, coins, 0, new Date());
    return { tipId: row.id };
  }

  const activity = async (
    creator: Creator,
    type: EarningsActivityType = 'all',
    cursor?: string,
  ): Promise<EarningsActivityPage> =>
    earningsActivityPageSchema.parse(
      await earnings.activity(creator.creatorProfileId, { type, cursor }),
    );
  const get = (creator: Creator | undefined, query = '') =>
    app.inject({
      method: 'GET',
      url: `/api/v1/me/earnings/activity${query}`,
      cookies: creator ? { influency_session: creator.token } : {},
    });

  describe('rows', () => {
    it('describes an unlock: buyer, post caption, Koin, 20% fee, the creator share', async () => {
      const creator = await newCreator();
      await unlock(creator, { buyer: 'Tari', caption: 'Rain-day roll\nsecond line', coins: 25n });
      const { items, nextCursor } = await activity(creator);
      expect(nextCursor).toBeNull();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        type: 'unlock',
        kind: 'SALE',
        buyerName: 'Tari',
        postCaption: 'Rain-day roll',
        grossKoin: 25,
        feeBps: 2000,
        netIdr: 20_000,
        status: 'PENDING',
      });
      // Posted just now, by the database clock.
      expect(
        Math.abs(Date.parse(items[0]!.occurredAt) - (await dbNow(prisma)).getTime()),
      ).toBeLessThan(60_000);
    });

    it('describes a subscription: 15% fee, no post', async () => {
      const creator = await newCreator();
      await subscribe(creator, { buyer: 'Yoga', coins: 150n });
      expect((await activity(creator)).items[0]).toMatchObject({
        type: 'subscription',
        kind: 'SALE',
        buyerName: 'Yoga',
        postCaption: null,
        grossKoin: 150,
        feeBps: 1500,
        netIdr: 127_500,
      });
    });

    it('describes a tip on a post and a tip on the creator: 0% fee', async () => {
      const creator = await newCreator();
      await tip(creator, { buyer: 'Bima', coins: 10n, caption: 'Pasar pagi' });
      await tip(creator, { buyer: 'Arief', coins: 5n });
      const items = (await activity(creator)).items;
      expect(
        items.map((i) => [i.buyerName, i.postCaption, i.grossKoin, i.feeBps, i.netIdr]),
      ).toEqual([
        ['Arief', null, 5, 0, 5_000],
        ['Bima', 'Pasar pagi', 10, 0, 10_000],
      ]);
      expect(items.every((i) => i.type === 'tip')).toBe(true);
    });

    it('shows a cancelled scheduled renewal as a sale and a negative reversal', async () => {
      const creator = await newCreator();
      const { periodId } = await subscribe(creator, {
        buyer: 'Dewi',
        startsAt: new Date(Date.now() + 5 * DAY),
      });
      await pause(5);
      await prisma.$transaction((tx) =>
        revenue.reverseSaleInTx(tx, { sourceType: 'SUBSCRIPTION_PERIOD', sourceId: periodId }),
      );
      const items = (await activity(creator)).items;
      expect(items.map((i) => [i.kind, i.netIdr, i.buyerName])).toEqual([
        ['REVERSAL', -127_500, 'Dewi'],
        ['SALE', 127_500, 'Dewi'],
      ]);
    });

    it('cuts a long caption at 60 characters', async () => {
      const creator = await newCreator();
      await unlock(creator, { buyer: 'Sari', caption: 'x'.repeat(100) });
      expect((await activity(creator)).items[0]!.postCaption).toBe(`${'x'.repeat(60)}…`);
    });

    it('never hides a sale whose source row is missing: it shows a generic buyer', async () => {
      const creator = await newCreator();
      await postSale(creator, 'TIP', randomUUID(), 10n, 0, new Date());
      const items = (await activity(creator)).items;
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({ buyerName: 'Pengguna', postCaption: null, netIdr: 10_000 });
    });
  });

  describe('type filter', () => {
    it.each<[EarningsActivityType, string[]]>([
      ['all', ['tip', 'subscription', 'unlock']],
      ['unlock', ['unlock']],
      ['subscription', ['subscription']],
      ['tip', ['tip']],
    ])('%s returns %j', async (type, expected) => {
      const creator = await newCreator();
      await unlock(creator, { buyer: 'A' });
      await pause(5);
      await subscribe(creator, { buyer: 'B' });
      await pause(5);
      await tip(creator, { buyer: 'C' });
      expect((await activity(creator, type)).items.map((i) => i.type)).toEqual(expected);
    });
  });

  describe('status', () => {
    it('is AVAILABLE once accrues_at + 14 days has passed by the database clock, with availableAt', async () => {
      const creator = await newCreator();
      const now = (await dbNow(prisma)).getTime();
      const old = new Date(now - 15 * DAY);
      const recent = new Date(now - 1 * DAY);
      await unlock(creator, { buyer: 'Old', accruesAt: old });
      await pause(5);
      await unlock(creator, { buyer: 'Recent', accruesAt: recent });
      const byBuyer = Object.fromEntries(
        (await activity(creator)).items.map((i) => [i.buyerName, i]),
      );
      expect(byBuyer.Old).toMatchObject({
        status: 'AVAILABLE',
        availableAt: new Date(old.getTime() + 14 * DAY).toISOString(),
      });
      expect(byBuyer.Recent).toMatchObject({
        status: 'PENDING',
        availableAt: new Date(recent.getTime() + 14 * DAY).toISOString(),
      });
    });

    it('a scheduled period is pending until 14 days after it starts', async () => {
      const creator = await newCreator();
      const startsAt = new Date(Date.now() + 10 * DAY);
      await subscribe(creator, { buyer: 'Later', startsAt });
      expect((await activity(creator)).items[0]).toMatchObject({
        status: 'PENDING',
        availableAt: new Date(startsAt.getTime() + 14 * DAY).toISOString(),
      });
    });
  });

  describe('pagination', () => {
    // One transaction, so every row has the same created_at: the (created_at, id) tiebreak has to hold the pages together.
    async function seedTied(creator: Creator, count: number) {
      await prisma.$transaction(async (tx) => {
        for (let i = 0; i < count; i++) {
          await revenue.postSaleInTx(tx, {
            creatorProfileId: creator.creatorProfileId,
            sourceType: 'TIP',
            sourceId: randomUUID(),
            coins: BigInt(i + 1),
            feeBps: 0,
            accruesAt: new Date(),
          });
        }
      });
    }

    it(`pages ${WALLET_PAGE_SIZE} at a time without gaps or repeats, even with equal timestamps`, async () => {
      const creator = await newCreator();
      await seedTied(creator, WALLET_PAGE_SIZE + 5);
      const first = await activity(creator);
      expect(first.items).toHaveLength(WALLET_PAGE_SIZE);
      expect(first.nextCursor).toMatch(/^\d+_[0-9a-f-]{36}$/);
      const second = await activity(creator, 'all', first.nextCursor!);
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      const ids = [...first.items, ...second.items].map((i) => i.id);
      expect(new Set(ids).size).toBe(WALLET_PAGE_SIZE + 5);
      // Every sale shows up exactly once: the Koin amounts 1..25 are all present.
      expect(
        [...first.items, ...second.items].map((i) => i.grossKoin).sort((a, b) => a - b),
      ).toEqual(Array.from({ length: WALLET_PAGE_SIZE + 5 }, (_, i) => i + 1));
    });

    it('has no next page at exactly one page of rows', async () => {
      const creator = await newCreator();
      await seedTied(creator, WALLET_PAGE_SIZE);
      const page = await activity(creator);
      expect(page.items).toHaveLength(WALLET_PAGE_SIZE);
      expect(page.nextCursor).toBeNull();
    });

    it('keeps paging stable when a new sale arrives between pages', async () => {
      const creator = await newCreator();
      await seedTied(creator, WALLET_PAGE_SIZE + 3);
      const first = await activity(creator);
      await pause(5);
      await tip(creator, { buyer: 'Newcomer' });
      const second = await activity(creator, 'all', first.nextCursor!);
      expect(second.items).toHaveLength(3);
      expect(second.items.some((i) => i.buyerName === 'Newcomer')).toBe(false);
    });

    it('filters and pages together', async () => {
      const creator = await newCreator();
      await seedTied(creator, WALLET_PAGE_SIZE + 2); // tips
      await unlock(creator, { buyer: 'Only unlock' });
      const page = await activity(creator, 'unlock');
      expect(page.items.map((i) => i.buyerName)).toEqual(['Only unlock']);
      expect(page.nextCursor).toBeNull();
    });
  });

  describe('privacy and isolation', () => {
    it("never returns another creator's rows", async () => {
      const mine = await newCreator();
      const other = await newCreator();
      await unlock(other, { buyer: 'Stranger' });
      await tip(other, { buyer: 'Stranger 2' });
      expect((await activity(mine)).items).toEqual([]);
    });

    it('exposes only the contract fields: no buyer id, username or source id', async () => {
      const creator = await newCreator();
      const { buyerId, purchaseId } = await unlock(creator, { buyer: 'Tari' });
      const [item] = (await activity(creator)).items;
      expect(Object.keys(item!).sort()).toEqual(
        [
          'availableAt',
          'buyerName',
          'feeBps',
          'grossKoin',
          'id',
          'kind',
          'netIdr',
          'occurredAt',
          'postCaption',
          'status',
          'type',
        ].sort(),
      );
      const json = JSON.stringify(item);
      expect(json).not.toContain(buyerId);
      expect(json).not.toContain(purchaseId);
    });

    it('uses the stored creator amount, not a recomputation', async () => {
      const creator = await newCreator();
      // 1 Koin at 15%: gross Rp1.000, platform Rp150 (half-up), creator Rp850 — read back as stored.
      await postSale(creator, 'TIP', randomUUID(), 1n, 1500, new Date());
      expect((await activity(creator)).items[0]!.netIdr).toBe(850);
    });
  });

  describe('HTTP', () => {
    it('serves a page, uncached', async () => {
      await unlock(http, { buyer: 'Http buyer' });
      const res = await get(http, '?type=unlock');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const page = earningsActivityPageSchema.parse(res.json());
      expect(page.items.some((i) => i.buyerName === 'Http buyer')).toBe(true);
      expect(page.items.every((i) => i.type === 'unlock')).toBe(true);
    });

    it.each([
      ['an unknown type', '?type=refund'],
      ['a malformed cursor', '?cursor=nope'],
      ['a cursor with a bad id', '?cursor=123_not-a-uuid'],
      ['an empty cursor', '?cursor='],
    ])('400s %s', async (_label, query) => {
      const res = await get(http, query);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
    });

    it('401s a guest and 403s an unapproved creator', async () => {
      expect((await get(undefined)).statusCode).toBe(401);
      const res = await get(pending);
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('CREATOR_NOT_APPROVED');
    });
  });
});
