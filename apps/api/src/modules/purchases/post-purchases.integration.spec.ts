import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  publicPostDetailSchema,
  publicPostListSchema,
  purchasePostResponseSchema,
  SESSION_COOKIE,
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

// Purchases, ledgers and creators are append-only or referenced, so nothing is deleted: fresh rows per test.
describe('POST /posts/:id/purchase', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let wallets: WalletsService;
  let appPrisma: PrismaService;
  let creatorUserId: string;
  let creatorProfileId: string;

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

    creatorUserId = (await prisma.user.create({ data: { displayName: 'Buy creator' } })).id;
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: creatorUserId,
          slug: `buy-${RUN}`,
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('Buy'),
        },
      })
    ).id;
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newFan(coins = 0n) {
    const user = await prisma.user.create({ data: { displayName: 'Buyer' } });
    const token = `buy-spec-${randomUUID()}`;
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
  async function newPost(
    over: {
      price?: bigint | null;
      status?: PostStatus;
      visibility?: PostVisibility;
      creatorProfileId?: string;
    } = {},
  ) {
    const post = await prisma.post.create({
      data: {
        creatorProfileId: over.creatorProfileId ?? creatorProfileId,
        visibility: over.visibility ?? 'PREMIUM',
        status: over.status ?? 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    const price = over.price === undefined ? 25n : over.price;
    if (price !== null) {
      await prisma.postOffer.create({ data: { postId: post.id, version: 1, priceCoins: price } });
    }
    return post.id;
  }
  const buy = (
    fan: { token: string } | undefined,
    postId: string,
    expectedPriceCoins: unknown,
    key: string | null = randomUUID(),
    origin = WEB_ORIGIN,
  ) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/purchase`,
      cookies: fan ? { [SESSION_COOKIE]: fan.token } : {},
      headers: { origin, ...(key ? { 'idempotency-key': key } : {}) },
      payload: { expectedPriceCoins } as object,
    });
  const errorCode = (res: { json: <T>() => T }) =>
    res.json<{ error: { code: string } }>().error.code;
  const ledger = (userId: string) =>
    prisma.coinLedgerEntry.findMany({
      where: { wallet: { userId } },
      orderBy: { createdAt: 'asc' },
    });
  const balance = async (userId: string) =>
    (await prisma.coinWallet.findUnique({ where: { userId } }))?.balanceCoins ?? 0n;

  it('unlocks: debits the price, records the purchase and splits the revenue', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    const res = await buy(fan, postId, 25);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = purchasePostResponseSchema.parse(res.json());
    expect(body).toMatchObject({ postId, priceCoins: 25, balanceCoins: 75, alreadyOwned: false });

    expect(await balance(fan.id)).toBe(75n);
    const debits = (await ledger(fan.id)).filter((e) => e.entryType === 'POST_PURCHASE_DEBIT');
    expect(debits).toHaveLength(1);
    expect(debits[0]).toMatchObject({
      amountCoins: -25n,
      balanceAfterCoins: 75n,
      sourceType: 'POST_PURCHASE',
      sourceId: body.purchaseId,
    });
    expect(
      await prisma.coinSpendAllocation.count({ where: { ledgerEntryId: debits[0]!.id } }),
    ).toBe(1);

    const offer = await prisma.postOffer.findFirstOrThrow({ where: { postId } });
    const purchase = await prisma.postPurchase.findUniqueOrThrow({
      where: { id: body.purchaseId },
    });
    expect(purchase).toMatchObject({
      userId: fan.id,
      postId,
      postOfferId: offer.id,
      priceCoins: 25n,
      feeBps: 2000,
    });
    const revenue = await prisma.revenueLedgerEntry.findMany({
      where: { sourceId: body.purchaseId },
      orderBy: { account: 'asc' },
    });
    expect(revenue.map((r) => [r.account, Number(r.amountIdr), r.creatorProfileId])).toEqual([
      ['CREATOR', 20_000, creatorProfileId],
      ['PLATFORM', 5_000, creatorProfileId],
    ]);
  });

  it('replays the same key and payload without charging again', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    const key = randomUUID();
    const first = await buy(fan, postId, 25, key);
    const again = await buy(fan, postId, 25, key);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({
      purchaseId: first.json<{ purchaseId: string }>().purchaseId,
    });
    expect(await balance(fan.id)).toBe(75n);
    expect(
      (await ledger(fan.id)).filter((e) => e.entryType === 'POST_PURCHASE_DEBIT'),
    ).toHaveLength(1);
  });

  it('rejects the same key with a different payload', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    const key = randomUUID();
    await buy(fan, postId, 25, key);
    const res = await buy(fan, postId, 30, key);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('DUPLICATE_REQUEST');
    expect(await balance(fan.id)).toBe(75n);
  });

  it('returns the existing purchase for a new key, and for an archived post, without a debit', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    const first = await buy(fan, postId, 25);
    await prisma.post.update({ where: { id: postId }, data: { status: 'ARCHIVED' } });
    const second = await buy(fan, postId, 25);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      purchaseId: first.json<{ purchaseId: string }>().purchaseId,
      alreadyOwned: true,
      balanceCoins: 75,
    });
    expect(await balance(fan.id)).toBe(75n);
  });

  it('charges once when several requests with different keys race for one post', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    const results = await Promise.all(Array.from({ length: 5 }, () => buy(fan, postId, 25)));
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(results.filter((r) => !r.json<{ alreadyOwned: boolean }>().alreadyOwned)).toHaveLength(
      1,
    );
    expect(await balance(fan.id)).toBe(75n);
    expect(await prisma.postPurchase.count({ where: { userId: fan.id } })).toBe(1);
    expect(
      await prisma.revenueLedgerEntry.count({
        where: {
          creatorProfileId,
          sourceId: results[0]!.json<{ purchaseId: string }>().purchaseId,
        },
      }),
    ).toBe(2);
  });

  it('cannot overspend: two posts at once with Koin for only one', async () => {
    const fan = await newFan(30n);
    const [a, b] = [await newPost(), await newPost()];
    const results = await Promise.all([buy(fan, a, 25), buy(fan, b, 25)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 402]);
    const failed = results.find((r) => r.statusCode === 402)!;
    expect(errorCode(failed)).toBe('INSUFFICIENT_COINS');
    expect(failed.json<{ error: { details: unknown } }>().error.details).toEqual({
      required: 25,
      available: 5,
    });
    expect(await balance(fan.id)).toBe(5n);
    expect(await prisma.postPurchase.count({ where: { userId: fan.id } })).toBe(1);
  });

  it('writes nothing when the balance is too low, and the same key works after a top-up', async () => {
    const fan = await newFan(10n);
    const postId = await newPost();
    const key = randomUUID();
    const res = await buy(fan, postId, 25, key);
    expect(res.statusCode).toBe(402);
    expect(await prisma.postPurchase.count({ where: { userId: fan.id } })).toBe(0);
    expect(
      (await ledger(fan.id)).filter((e) => e.entryType === 'POST_PURCHASE_DEBIT'),
    ).toHaveLength(0);
    await topUp(fan.id, 50n);
    const retry = await buy(fan, postId, 25, key);
    expect(retry.statusCode).toBe(200);
    expect(await balance(fan.id)).toBe(35n);
  });

  it('answers OFFER_CHANGED with the new price and does not charge', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    await prisma.postOffer.create({ data: { postId, version: 2, priceCoins: 40n } });
    const res = await buy(fan, postId, 25);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('OFFER_CHANGED');
    expect(res.json<{ error: { details: unknown } }>().error.details).toEqual({ priceCoins: 40 });
    expect(await balance(fan.id)).toBe(100n);
    const ok = await buy(fan, postId, 40);
    expect(ok.json()).toMatchObject({ priceCoins: 40, balanceCoins: 60 });
  });

  it('keeps the bought offer in the snapshot when the price changes later', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    const res = await buy(fan, postId, 25);
    await prisma.postOffer.create({ data: { postId, version: 2, priceCoins: 90n } });
    const purchase = await prisma.postPurchase.findUniqueOrThrow({
      where: { id: res.json<{ purchaseId: string }>().purchaseId },
      include: { offer: true },
    });
    expect([purchase.priceCoins, purchase.offer.version]).toEqual([25n, 1]);
  });

  it('rejects what cannot be bought, without any ledger row', async () => {
    const fan = await newFan(100n);
    const other = await prisma.user.create({ data: { displayName: 'Suspended creator' } });
    const suspendedProfile = await prisma.creatorProfile.create({
      data: {
        userId: other.id,
        slug: `buy-s-${RUN}`,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('S'),
      },
    });
    const cases: [string, string, number, string][] = [
      ['free post', await newPost({ visibility: 'FREE', price: null }), 404, 'POST_NOT_AVAILABLE'],
      ['premium without an offer', await newPost({ price: null }), 404, 'POST_NOT_AVAILABLE'],
      ['draft', await newPost({ status: 'DRAFT' }), 404, 'NOT_FOUND'],
      ['archived', await newPost({ status: 'ARCHIVED' }), 404, 'POST_NOT_AVAILABLE'],
      ['removed', await newPost({ status: 'REMOVED' }), 404, 'NOT_FOUND'],
      ['unknown id', randomUUID(), 404, 'NOT_FOUND'],
      ['malformed id', 'not-a-uuid', 404, 'NOT_FOUND'],
    ];
    const suspendedPost = await newPost({ creatorProfileId: suspendedProfile.id });
    await prisma.user.update({ where: { id: other.id }, data: { status: 'SUSPENDED' } });
    cases.push(['suspended creator', suspendedPost, 404, 'NOT_FOUND']);
    for (const [label, id, status, code] of cases) {
      const res = await buy(fan, id, 25);
      expect([label, res.statusCode, errorCode(res)]).toEqual([label, status, code]);
    }
    expect(await balance(fan.id)).toBe(100n);
    expect(await prisma.postPurchase.count({ where: { userId: fan.id } })).toBe(0);
  });

  it('rejects the creator buying their own post', async () => {
    const token = `buy-spec-owner-${RUN}`;
    await prisma.session.create({
      data: {
        userId: creatorUserId,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await buy({ token }, await newPost(), 25);
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('CANNOT_PURCHASE_OWN');
  });

  it('needs a session, an Idempotency-Key, a valid body and a same-origin request', async () => {
    const fan = await newFan(100n);
    const postId = await newPost();
    expect((await buy(undefined, postId, 25)).statusCode).toBe(401);
    expect((await buy(fan, postId, 25, null)).statusCode).toBe(400);
    expect((await buy(fan, postId, 4)).statusCode).toBe(400);
    expect((await buy(fan, postId, 25.5)).statusCode).toBe(400);
    const cross = await buy(fan, postId, 25, randomUUID(), 'https://evil.example');
    expect(cross.statusCode).toBe(403);
    expect(await balance(fan.id)).toBe(100n);
  });

  it("one user's purchase does not give another user a purchase", async () => {
    const [a, b] = [await newFan(100n), await newFan(100n)];
    const postId = await newPost();
    await buy(a, postId, 25);
    expect(await prisma.postPurchase.count({ where: { userId: b.id } })).toBe(0);
    expect((await buy(b, postId, 25)).json()).toMatchObject({ alreadyOwned: false });
    expect(await balance(b.id)).toBe(75n);
  });

  describe('paid access after a purchase', () => {
    const SLUG = `buy-${RUN}`;
    const as = (fan: { token: string } | undefined): Record<string, string> =>
      fan ? { [SESSION_COOKIE]: fan.token } : {};
    const detail = (fan: { token: string } | undefined, postId: string) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/creators/${SLUG}/posts/${postId}`,
        cookies: as(fan),
      });
    const mediaAccess = (fan: { token: string } | undefined, postId: string) =>
      app.inject({ method: 'GET', url: `/api/v1/posts/${postId}/media-access`, cookies: as(fan) });

    it('opens the post for the buyer only: detail, list and media access', async () => {
      const [buyer, other] = [await newFan(100n), await newFan(100n)];
      const postId = await newPost();
      expect(publicPostDetailSchema.parse((await detail(buyer, postId)).json()).access).toBe(
        'locked',
      );
      await buy(buyer, postId, 25);

      expect(publicPostDetailSchema.parse((await detail(buyer, postId)).json()).access).toBe(
        'full',
      );
      expect(publicPostDetailSchema.parse((await detail(other, postId)).json()).access).toBe(
        'locked',
      );
      expect(publicPostDetailSchema.parse((await detail(undefined, postId)).json()).access).toBe(
        'locked',
      );

      const list = (fan: { token: string } | undefined) =>
        app.inject({ method: 'GET', url: `/api/v1/creators/${SLUG}/posts`, cookies: as(fan) });
      const listed = publicPostListSchema.parse((await list(buyer)).json()).posts;
      expect(listed.find((p) => p.id === postId)?.access).toBe('full');
      const others = publicPostListSchema.parse((await list(other)).json()).posts;
      expect(others.find((p) => p.id === postId)?.access).toBe('locked');

      expect((await mediaAccess(buyer, postId)).statusCode).toBe(200);
      expect((await mediaAccess(other, postId)).statusCode).toBe(403);
      expect((await mediaAccess(undefined, postId)).statusCode).toBe(403);
    });

    it('keeps an archived post private to the buyer', async () => {
      const [buyer, other] = [await newFan(100n), await newFan(100n)];
      const postId = await newPost();
      await buy(buyer, postId, 25);
      await prisma.post.update({ where: { id: postId }, data: { status: 'ARCHIVED' } });

      const mine = await detail(buyer, postId);
      expect(mine.statusCode).toBe(200);
      expect(publicPostDetailSchema.parse(mine.json()).access).toBe('full');
      expect((await mediaAccess(buyer, postId)).statusCode).toBe(200);
      expect((await detail(other, postId)).statusCode).toBe(404);
      expect((await mediaAccess(other, postId)).statusCode).toBe(404);
      const listed = publicPostListSchema.parse(
        (
          await app.inject({
            method: 'GET',
            url: `/api/v1/creators/${SLUG}/posts`,
            cookies: as(buyer),
          })
        ).json(),
      ).posts;
      expect(listed.some((p) => p.id === postId)).toBe(false); // gone from public listings
    });

    it('never opens a removed post, even for the buyer', async () => {
      const buyer = await newFan(100n);
      const postId = await newPost();
      await buy(buyer, postId, 25);
      await prisma.post.update({ where: { id: postId }, data: { status: 'REMOVED' } });
      expect((await detail(buyer, postId)).statusCode).toBe(404);
      expect((await mediaAccess(buyer, postId)).statusCode).toBe(404);
      expect((await buy(buyer, postId, 25)).statusCode).toBe(404);
    });

    it('lists the debit in the wallet activity with the creator and a link to the post', async () => {
      const buyer = await newFan(100n);
      const postId = await newPost();
      await buy(buyer, postId, 25);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/wallet/transactions',
        cookies: as(buyer),
      });
      const items = walletTransactionsPageSchema.parse(res.json()).items;
      expect(items[0]).toMatchObject({
        type: 'POST_PURCHASE_DEBIT',
        amountCoins: -25,
        topupOrderId: null,
        detail: 'Buy',
        href: `/${SLUG}/posts/${postId}`,
      });
      expect(items[1]).toMatchObject({ type: 'TOPUP_CREDIT', detail: null, href: null });
    });
  });
});
