import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  creatorSubscriptionStateSchema,
  publicPostDetailSchema,
  SESSION_COOKIE,
  tipResponseSchema,
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
import type { PostStatus, PostVisibility } from '../../generated/prisma/client.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { WalletsService } from '../wallets/wallets.service.js';

const WEB_ORIGIN = 'http://localhost:3000';
const RUN = randomUUID().slice(0, 8);
const DAY = 86_400_000;

// Tips, ledgers, periods and creators are append-only or referenced, so nothing is deleted: fresh rows per test.
describe('POST /creators/:slug/tips and /posts/:id/tips', () => {
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

  type Person = { id: string; token: string };
  async function newPerson(label: string, coins = 0n): Promise<Person> {
    const user = await prisma.user.create({ data: { displayName: label } });
    const token = `tip-spec-${randomUUID()}`;
    await prisma.session.create({
      data: { userId: user.id, tokenHash: sha256hex(token), expiresAt: new Date(Date.now() + DAY) },
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
  async function newCreator() {
    const owner = await newPerson('Tip creator');
    const slug = `tip-${RUN}-${++n}`;
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: owner.id,
        slug,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Tip'),
      },
    });
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: profile.id, version: 1, priceCoins: 75n, active: true },
    });
    return { owner, profileId: profile.id, slug, planId: plan.id };
  }
  type Creator = Awaited<ReturnType<typeof newCreator>>;
  async function newPost(
    creator: Creator,
    over: { status?: PostStatus; visibility?: PostVisibility } = {},
  ) {
    const post = await prisma.post.create({
      data: {
        creatorProfileId: creator.profileId,
        visibility: over.visibility ?? 'PREMIUM',
        status: over.status ?? 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    await prisma.postOffer.create({ data: { postId: post.id, version: 1, priceCoins: 25n } });
    return post.id;
  }
  /** Makes `fan` a subscriber of `creator` (a period running now). */
  const period = (startsAt: Date) => ({
    startsAt,
    endsAt: new Date(startsAt.getTime() + 30 * DAY),
  });
  const subscribeNow = (fan: Person, creator: Creator) =>
    prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: creator.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        ...period(new Date(Date.now() - DAY)),
      },
    });
  /** Makes `fan` a buyer of `postId`. */
  const buyPost = async (fan: Person, postId: string) =>
    prisma.postPurchase.create({
      data: {
        userId: fan.id,
        postId,
        postOfferId: (await prisma.postOffer.findFirstOrThrow({ where: { postId } })).id,
        priceCoins: 25n,
        feeBps: 2000,
      },
    });

  const cookies = (p: Person | undefined): Record<string, string> =>
    p ? { [SESSION_COOKIE]: p.token } : {};
  const send = (
    url: string,
    p: Person | undefined,
    amountCoins: unknown,
    key: string | null = randomUUID(),
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1${url}`,
      cookies: cookies(p),
      headers: { origin, ...(key ? { 'idempotency-key': key } : {}) },
      payload: { amountCoins } as object,
    });
  const tipCreator = (p: Person | undefined, c: Creator, amount: unknown, key?: string | null) =>
    send(`/creators/${c.slug}/tips`, p, amount, key);
  const tipPost = (p: Person | undefined, postId: string, amount: unknown, key?: string | null) =>
    send(`/posts/${postId}/tips`, p, amount, key);
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const balance = async (userId: string) =>
    (await prisma.coinWallet.findUnique({ where: { userId } }))?.balanceCoins ?? 0n;
  const tipDebits = (userId: string) =>
    prisma.coinLedgerEntry.count({ where: { wallet: { userId }, entryType: 'TIP_DEBIT' } });

  it('lets a subscriber tip the creator: debit, tip row, 100% to the creator, no access change', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Subscriber', 100n);
    await subscribeNow(fan, creator);
    const periodsBefore = await prisma.subscriptionPeriod.count({ where: { userId: fan.id } });

    const res = await tipCreator(fan, creator, 20);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = tipResponseSchema.parse(res.json());
    expect(body).toMatchObject({ amountCoins: 20, balanceCoins: 80 });

    expect(await balance(fan.id)).toBe(80n);
    const tip = await prisma.tip.findUniqueOrThrow({ where: { id: body.tipId } });
    expect(tip).toMatchObject({
      userId: fan.id,
      creatorProfileId: creator.profileId,
      postId: null,
      amountCoins: 20n,
    });
    const entry = await prisma.coinLedgerEntry.findFirstOrThrow({
      where: { wallet: { userId: fan.id }, entryType: 'TIP_DEBIT' },
    });
    expect(entry).toMatchObject({ amountCoins: -20n, sourceType: 'TIP', sourceId: body.tipId });
    expect(await prisma.coinSpendAllocation.count({ where: { ledgerEntryId: entry.id } })).toBe(1);

    const revenue = await prisma.revenueLedgerEntry.findMany({ where: { sourceId: body.tipId } });
    expect(revenue.map((r) => [r.account, r.kind, Number(r.amountIdr), r.feeBps])).toEqual([
      ['CREATOR', 'SALE', 20_000, 0],
    ]);
    // A tip grants nothing: no new period, no purchase.
    expect(await prisma.subscriptionPeriod.count({ where: { userId: fan.id } })).toBe(
      periodsBefore,
    );
    expect(await prisma.postPurchase.count({ where: { userId: fan.id } })).toBe(0);
  });

  it('lets a buyer tip the creator and the bought post, but not another premium post', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Buyer', 200n);
    const [bought, other] = [await newPost(creator), await newPost(creator)];
    await buyPost(fan, bought);

    expect((await tipCreator(fan, creator, 10)).statusCode).toBe(200);
    const post = await tipPost(fan, bought, 15);
    expect(post.statusCode).toBe(200);
    const tip = await prisma.tip.findUniqueOrThrow({
      where: { id: post.json<{ tipId: string }>().tipId },
    });
    expect(tip.postId).toBe(bought);

    const denied = await tipPost(fan, other, 15);
    expect(denied.statusCode).toBe(403);
    expect(errorCode(denied)).toBe('TIP_NOT_ALLOWED');
    expect(await balance(fan.id)).toBe(175n);
  });

  it('lets a subscriber tip any published premium post of the creator, not another creator', async () => {
    const [a, b] = [await newCreator(), await newCreator()];
    const fan = await newPerson('Subscriber', 100n);
    await subscribeNow(fan, a);
    expect((await tipPost(fan, await newPost(a), 5)).statusCode).toBe(200);
    expect((await tipPost(fan, await newPost(b), 5)).statusCode).toBe(403);
    expect((await tipCreator(fan, b, 5)).statusCode).toBe(403);
    expect(await tipDebits(fan.id)).toBe(1);
  });

  it('refuses everyone who does not support the creator, without a ledger row', async () => {
    const creator = await newCreator();
    const nobody = await newPerson('Nobody', 100n);
    const expired = await newPerson('Expired', 100n);
    await prisma.subscriptionPeriod.create({
      data: {
        userId: expired.id,
        creatorProfileId: creator.profileId,
        planId: creator.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        ...period(new Date(Date.now() - 40 * DAY)),
      },
    });
    const postId = await newPost(creator);
    for (const p of [nobody, expired]) {
      const res = await tipCreator(p, creator, 10);
      expect(res.statusCode).toBe(403);
      expect(errorCode(res)).toBe('TIP_NOT_ALLOWED');
      expect((await tipPost(p, postId, 10)).statusCode).toBe(403);
      expect(await balance(p.id)).toBe(100n);
      expect(await tipDebits(p.id)).toBe(0);
    }
  });

  it('refuses a self-tip even when the creator somehow holds a period of their own', async () => {
    const creator = await newCreator();
    await topUp(creator.owner.id, 50n);
    await subscribeNow(creator.owner, creator);
    const res = await tipCreator(creator.owner, creator, 10);
    expect(res.statusCode).toBe(403);
    expect(await tipDebits(creator.owner.id)).toBe(0);
  });

  it('only accepts 1–1,000 whole Koin', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Subscriber', 2000n);
    await subscribeNow(fan, creator);
    for (const bad of [0, -5, 1001, 2.5, '10', null]) {
      expect((await tipCreator(fan, creator, bad)).statusCode).toBe(400);
    }
    expect((await tipCreator(fan, creator, 1)).statusCode).toBe(200);
    expect((await tipCreator(fan, creator, 1000)).statusCode).toBe(200);
    expect(await balance(fan.id)).toBe(999n);
  });

  it('refuses a tip on a free, archived, unpublished or removed post, and an unknown one', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Subscriber', 100n);
    await subscribeNow(fan, creator);
    const cases: [string, string, number, string][] = [
      ['free', await newPost(creator, { visibility: 'FREE' }), 403, 'TIP_NOT_ALLOWED'],
      ['archived', await newPost(creator, { status: 'ARCHIVED' }), 403, 'TIP_NOT_ALLOWED'],
      ['draft', await newPost(creator, { status: 'DRAFT' }), 404, 'NOT_FOUND'],
      ['removed', await newPost(creator, { status: 'REMOVED' }), 404, 'NOT_FOUND'],
      ['unknown', randomUUID(), 404, 'NOT_FOUND'],
      ['malformed', 'not-a-uuid', 404, 'NOT_FOUND'],
    ];
    for (const [label, id, status, code] of cases) {
      const res = await tipPost(fan, id, 5);
      expect([label, res.statusCode, errorCode(res)]).toEqual([label, status, code]);
    }
    expect(await balance(fan.id)).toBe(100n);
  });

  it('replays the same key once, rejects another amount for it, and survives a race', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Subscriber', 25n);
    await subscribeNow(fan, creator);
    const key = randomUUID();
    const first = await tipCreator(fan, creator, 10, key);
    const again = await tipCreator(fan, creator, 10, key);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({
      tipId: first.json<{ tipId: string }>().tipId,
      balanceCoins: 15,
    });
    expect(await tipDebits(fan.id)).toBe(1);
    const other = await tipCreator(fan, creator, 12, key);
    expect(other.statusCode).toBe(409);
    expect(errorCode(other)).toBe('DUPLICATE_REQUEST');

    // 15 Koin left: five simultaneous 10-Koin tips with different keys → exactly one succeeds.
    const results = await Promise.all(
      Array.from({ length: 5 }, () => tipCreator(fan, creator, 10)),
    );
    expect(results.filter((r) => r.statusCode === 200)).toHaveLength(1);
    expect(results.filter((r) => r.statusCode === 402).map(errorCode)).toEqual(
      Array(4).fill('INSUFFICIENT_COINS'),
    );
    expect(await balance(fan.id)).toBe(5n);
    expect(await tipDebits(fan.id)).toBe(2);
  });

  it('reports the shortfall and writes nothing when the balance is too low', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Poor subscriber', 4n);
    await subscribeNow(fan, creator);
    const res = await tipCreator(fan, creator, 10);
    expect(res.statusCode).toBe(402);
    expect(res.json<{ error: { details: unknown } }>().error.details).toEqual({
      required: 10,
      available: 4,
    });
    expect(await prisma.tip.count({ where: { userId: fan.id } })).toBe(0);
  });

  it('needs a session, an Idempotency-Key and a same-origin request', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Subscriber', 100n);
    await subscribeNow(fan, creator);
    expect((await tipCreator(undefined, creator, 5)).statusCode).toBe(401);
    expect((await tipCreator(fan, creator, 5, null)).statusCode).toBe(400);
    expect(
      (await send(`/creators/${creator.slug}/tips`, fan, 5, randomUUID(), 'https://evil.example'))
        .statusCode,
    ).toBe(403);
    expect((await tipCreator(fan, { ...creator, slug: `nope-${RUN}` }, 5)).statusCode).toBe(404);
    expect(await balance(fan.id)).toBe(100n);
  });

  it('shows the tip in the wallet activity with the creator and a link to the post', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Buyer', 100n);
    const postId = await newPost(creator);
    await buyPost(fan, postId);
    await tipPost(fan, postId, 10);
    await tipCreator(fan, creator, 5);
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/wallet/transactions',
      cookies: cookies(fan),
    });
    const items = walletTransactionsPageSchema.parse(res.json()).items;
    expect(items[0]).toMatchObject({
      type: 'TIP_DEBIT',
      amountCoins: -5,
      detail: 'Tip',
      href: `/${creator.slug}`,
    });
    expect(items[1]).toMatchObject({ type: 'TIP_DEBIT', href: `/${creator.slug}/posts/${postId}` });
  });

  describe('where the UI offers the tip (viewer.canTip)', () => {
    const detail = async (p: Person | undefined, creator: Creator, postId: string) =>
      publicPostDetailSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/creators/${creator.slug}/posts/${postId}`,
            cookies: cookies(p),
          })
        ).json(),
      );
    const profileTip = async (p: Person | undefined, creator: Creator) =>
      creatorSubscriptionStateSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/creators/${creator.slug}/subscription`,
            cookies: cookies(p),
          })
        ).json(),
      ).viewer?.canTip;

    it('is true for a payer, false for everyone else on the same post', async () => {
      const creator = await newCreator();
      const [buyer, subscriber, other, admin] = [
        await newPerson('Buyer'),
        await newPerson('Subscriber'),
        await newPerson('Other'),
        await newPerson('Admin'),
      ];
      await prisma.userRole.create({ data: { userId: admin.id, role: 'ADMIN' } });
      const postId = await newPost(creator);
      await buyPost(buyer, postId);
      await subscribeNow(subscriber, creator);

      expect((await detail(buyer, creator, postId)).viewer?.canTip).toBe(true);
      expect((await detail(subscriber, creator, postId)).viewer?.canTip).toBe(true);
      expect((await detail(other, creator, postId)).viewer?.canTip).toBe(false);
      // Free access (owner, admin) is not paid access, and nobody tips their own post.
      expect((await detail(creator.owner, creator, postId)).viewer?.canTip).toBe(false);
      expect((await detail(admin, creator, postId)).access).toBe('full');
      expect((await detail(admin, creator, postId)).viewer?.canTip).toBe(false);
      expect((await detail(undefined, creator, postId)).viewer).toBeNull();
    });

    it('is false on a free post even for a subscriber', async () => {
      const creator = await newCreator();
      const subscriber = await newPerson('Subscriber');
      await subscribeNow(subscriber, creator);
      const free = await newPost(creator, { visibility: 'FREE' });
      expect((await detail(subscriber, creator, free)).viewer?.canTip).toBe(false);
    });

    it('is true on the profile for supporters, false for others, the owner and guests', async () => {
      const creator = await newCreator();
      const [subscriber, buyer, other] = [
        await newPerson('Subscriber'),
        await newPerson('Buyer'),
        await newPerson('Other'),
      ];
      await subscribeNow(subscriber, creator);
      await buyPost(buyer, await newPost(creator));
      expect(await profileTip(subscriber, creator)).toBe(true);
      expect(await profileTip(buyer, creator)).toBe(true);
      expect(await profileTip(other, creator)).toBe(false);
      expect(await profileTip(creator.owner, creator)).toBe(false);
      expect(await profileTip(undefined, creator)).toBeUndefined(); // guests have no viewer
    });
  });

  it('keeps the amount rule and the append-only rule in the database', async () => {
    const creator = await newCreator();
    const fan = await newPerson('Subscriber', 10n);
    const base = { userId: fan.id, creatorProfileId: creator.profileId };
    await expect(prisma.tip.create({ data: { ...base, amountCoins: 0n } })).rejects.toThrow();
    await expect(prisma.tip.create({ data: { ...base, amountCoins: 1001n } })).rejects.toThrow();
    const row = await prisma.tip.create({ data: { ...base, amountCoins: 1n } });
    await expect(
      prisma.tip.update({ where: { id: row.id }, data: { amountCoins: 2n } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.tip.delete({ where: { id: row.id } })).rejects.toThrow(/append-only/);
  });
});
