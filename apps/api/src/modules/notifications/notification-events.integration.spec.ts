import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedCoinPackages } from '../../../prisma/seed/coin-packages.js';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { DEMO_COIN_PACKAGE_IDS } from '../../common/demo-ids.js';
import { ENV, parseEnv } from '../../common/env.js';
import type { FakePaymentGateway } from '../../common/fake-payment-gateway.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PAYMENT_GATEWAY } from '../../common/payment-gateway.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { PostVisibility } from '../../generated/prisma/client.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { TopupCreditService } from '../topups/topup-credit.service.js';
import { TopupsService } from '../topups/topups.service.js';
import { WalletsService } from '../wallets/wallets.service.js';
import { NotificationProducer } from './notification-producer.service.js';

const WEB_ORIGIN = 'http://localhost:3000';
const RUN = randomUUID().slice(0, 8);
const DAY = 86_400_000;
const MISSING = '0190a000-0000-7000-8000-0000007300ff';

async function boot(env: Record<string, string> = {}) {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, ...env }))
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

// Ledgers, purchases, periods and tips are append-only: fresh rows per test, nothing deleted (the DB is reset per run).
describe('notification events (US-072)', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let n = 0;

  beforeAll(async () => {
    // Lets a user without access comment on a locked post, to check they aren't told about replies there.
    app = await boot({ PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS: 'true' });
    await seedCoinPackages(prisma);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  type Person = { id: string; token: string };
  async function person(label: string, coins = 0n): Promise<Person> {
    const user = await prisma.user.create({ data: { displayName: label } });
    const token = `notif-events-${randomUUID()}`;
    await prisma.session.create({
      data: { userId: user.id, tokenHash: sha256hex(token), expiresAt: new Date(Date.now() + DAY) },
    });
    if (coins > 0n) {
      const db = app.get(PrismaService);
      await db.$transaction((tx) =>
        app.get(WalletsService).creditInTx(tx, {
          userId: user.id,
          coins,
          entryType: 'TOPUP_CREDIT',
          sourceType: 'TOPUP_ORDER',
          sourceId: randomUUID(),
          basisIdr: coins * 1000n,
        }),
      );
    }
    return { id: user.id, token };
  }
  async function creator() {
    const owner = await person('Event creator');
    const slug = `notif-ev-${RUN}-${++n}`;
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: owner.id,
        slug,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Event creator'),
      },
    });
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: profile.id, version: 1, priceCoins: 75n, active: true },
    });
    return { owner, profileId: profile.id, slug, planId: plan.id };
  }
  type Creator = Awaited<ReturnType<typeof creator>>;
  async function post(c: Creator, visibility: PostVisibility = 'PREMIUM') {
    const row = await prisma.post.create({
      data: {
        creatorProfileId: c.profileId,
        visibility,
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
    if (visibility === 'PREMIUM') {
      await prisma.postOffer.create({ data: { postId: row.id, version: 1, priceCoins: 25n } });
    }
    return row.id;
  }
  const send = (
    who: Person,
    method: 'POST' | 'DELETE',
    url: string,
    payload?: object,
    key?: string,
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      cookies: { [SESSION_COOKIE]: who.token },
      headers: { origin: WEB_ORIGIN, ...(key ? { 'idempotency-key': key } : {}) },
      ...(payload ? { payload } : {}),
    });
  const inbox = (userId: string) =>
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  const optIn = (userId: string) =>
    prisma.notificationPreference.create({ data: { userId, optOutTypes: [] } });

  describe('top-up', () => {
    let gateway: FakePaymentGateway;
    let credit: TopupCreditService;
    beforeAll(() => {
      gateway = app.get<FakePaymentGateway>(PAYMENT_GATEWAY);
      credit = app.get(TopupCreditService);
    });
    async function order() {
      const user = await person('Top-up user');
      const { orderId } = await app
        .get(TopupsService)
        .create(user.id, DEMO_COIN_PACKAGE_IDS[25], randomUUID());
      return { user, order: await prisma.topupOrder.findUniqueOrThrow({ where: { id: orderId } }) };
    }

    it('notifies once per credited order, whatever the webhooks do', async () => {
      const { user, order: o } = await order();
      const capture = gateway.notification(o.orderNumber, 25_000, {
        transaction_status: 'capture',
        fraud_status: 'accept',
      });
      const settle = gateway.notification(o.orderNumber, 25_000, {
        transaction_status: 'settlement',
      });
      await credit.applyProviderStatus(capture, 'NOTIFICATION');
      await Promise.all(
        Array.from({ length: 10 }, () => credit.applyProviderStatus(settle, 'NOTIFICATION')),
      );
      const rows = await inbox(user.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'TOPUP_CREDITED',
        coins: 25n,
        sourceId: o.id,
        dedupeKey: `topup:${o.id}`,
      });
    });

    it('does not notify a quarantined (wrong amount) order', async () => {
      const { user, order: o } = await order();
      await credit.applyProviderStatus(
        gateway.notification(o.orderNumber, 26_000, { transaction_status: 'settlement' }),
        'NOTIFICATION',
      );
      expect(await inbox(user.id)).toEqual([]);
    });
  });

  describe('unlock', () => {
    it('tells the creator once, with the buyer and price; a replay adds nothing', async () => {
      const c = await creator();
      const postId = await post(c);
      const fan = await person('Buyer', 100n);
      const key = randomUUID();
      expect(
        (await send(fan, 'POST', `/posts/${postId}/purchase`, { expectedPriceCoins: 25 }, key))
          .statusCode,
      ).toBe(200);
      expect(
        (await send(fan, 'POST', `/posts/${postId}/purchase`, { expectedPriceCoins: 25 }, key))
          .statusCode,
      ).toBe(200);
      const rows = await inbox(c.owner.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'POST_UNLOCKED',
        actorUserId: fan.id,
        postId,
        creatorProfileId: c.profileId,
        coins: 25n,
      });
    });

    it('does not notify when the purchase fails', async () => {
      const c = await creator();
      const postId = await post(c);
      const broke = await person('Broke', 5n);
      const res = await send(
        broke,
        'POST',
        `/posts/${postId}/purchase`,
        { expectedPriceCoins: 25 },
        randomUUID(),
      );
      expect(res.statusCode).toBe(402);
      expect(await inbox(c.owner.id)).toEqual([]);
    });

    it('keeps the purchase when writing the notification fails', async () => {
      const c = await creator();
      const postId = await post(c);
      const fan = await person('Buyer', 100n);
      const producer = app.get(NotificationProducer);
      const original = producer.notifyInTx.bind(producer);
      const spy = vi
        .spyOn(producer, 'notifyInTx')
        .mockImplementation((tx, input) => original(tx, { ...input, postId: MISSING })); // FK violation
      try {
        const res = await send(
          fan,
          'POST',
          `/posts/${postId}/purchase`,
          { expectedPriceCoins: 25 },
          randomUUID(),
        );
        expect(res.statusCode).toBe(200);
      } finally {
        spy.mockRestore();
      }
      expect(await prisma.postPurchase.count({ where: { userId: fan.id, postId } })).toBe(1);
      expect(
        (await prisma.coinWallet.findUniqueOrThrow({ where: { userId: fan.id } })).balanceCoins,
      ).toBe(75n);
      expect(
        await prisma.revenueLedgerEntry.count({
          where: { sourceType: 'POST_PURCHASE', creatorProfileId: c.profileId },
        }),
      ).toBeGreaterThan(0);
      expect(await inbox(c.owner.id)).toEqual([]);
    });
  });

  it('tells the creator about a new subscriber', async () => {
    const c = await creator();
    const fan = await person('Subscriber', 100n);
    const res = await send(
      fan,
      'POST',
      `/creators/${c.slug}/subscribe`,
      { expectedPriceCoins: 75 },
      randomUUID(),
    );
    expect(res.statusCode).toBe(200);
    const rows = await inbox(c.owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'NEW_SUBSCRIBER', actorUserId: fan.id, coins: 75n });
  });

  it('tells the creator about a tip', async () => {
    const c = await creator();
    const fan = await person('Tipper', 100n);
    await prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: c.profileId,
        planId: c.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 29 * DAY),
      },
    });
    const res = await send(
      fan,
      'POST',
      `/creators/${c.slug}/tips`,
      { amountCoins: 7 },
      randomUUID(),
    );
    expect(res.statusCode).toBe(200);
    const rows = await inbox(c.owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'TIP_RECEIVED', actorUserId: fan.id, coins: 7n });
  });

  describe('comments', () => {
    const comment = async (who: Person, postId: string, body: string, parentId?: string) => {
      const res = await send(who, 'POST', `/posts/${postId}/comments`, {
        body,
        ...(parentId ? { parentId } : {}),
      });
      expect(res.statusCode).toBe(201);
      return res.json<{ id: string }>().id;
    };

    it('tells the author of the answered comment, never themselves', async () => {
      const c = await creator();
      const postId = await post(c, 'FREE');
      const ana = await person('Ana');
      const budi = await person('Budi');
      const top = await comment(ana, postId, 'halo');
      const reply = await comment(budi, postId, 'SECRET-REPLY-TEXT', top);
      await comment(ana, postId, 'balas sendiri', top);
      const rows = await inbox(ana.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: 'COMMENT_REPLY',
        actorUserId: budi.id,
        commentId: reply,
        postId,
      });
      // A reply to a reply notifies that reply's author.
      await comment(ana, postId, 'ke budi', reply);
      expect((await inbox(budi.id)).map((r) => r.type)).toEqual(['COMMENT_REPLY']);
    });

    it('does not notify an author who cannot open the locked post', async () => {
      const c = await creator();
      const postId = await post(c); // premium
      const outsider = await person('No access');
      const buyer = await person('Buyer', 100n);
      const top = await comment(outsider, postId, 'tanpa akses');
      await send(
        buyer,
        'POST',
        `/posts/${postId}/purchase`,
        { expectedPriceCoins: 25 },
        randomUUID(),
      );
      await comment(buyer, postId, 'balasan', top);
      expect(await inbox(outsider.id)).toEqual([]);
    });

    it('notifies a like once the author opts in, once per liker', async () => {
      const c = await creator();
      const postId = await post(c, 'FREE');
      const ana = await person('Ana');
      const budi = await person('Budi');
      const top = await comment(ana, postId, 'suka?');
      const like = (who: Person, method: 'POST' | 'DELETE' = 'POST') =>
        send(who, method, `/posts/${postId}/comments/${top}/likes`);
      await like(budi); // default: likes on comments are off
      expect(await inbox(ana.id)).toEqual([]);
      await like(budi, 'DELETE');
      await optIn(ana.id);
      await like(budi);
      await like(budi, 'DELETE');
      await like(budi);
      await like(ana); // own comment
      const rows = await inbox(ana.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'COMMENT_LIKE', actorUserId: budi.id, commentId: top });
    });
  });

  describe('publish', () => {
    async function draftWithMedia(c: Creator) {
      const row = await prisma.post.create({
        data: { creatorProfileId: c.profileId, visibility: 'FREE', status: 'DRAFT' },
      });
      await prisma.mediaAsset.create({
        data: {
          postId: row.id,
          kind: 'IMAGE',
          status: 'READY',
          objectKey: `post-media/notif-events-${randomUUID()}`,
          contentType: 'image/jpeg',
          byteSize: 10,
          uploadExpiresAt: new Date(),
        },
      });
      return row.id;
    }
    async function followers(c: Creator) {
      const fan = await person('Follower');
      await prisma.creatorFollow.create({
        data: { userId: fan.id, creatorProfileId: c.profileId },
      });
      return fan;
    }

    it('tells followers about a first publish', async () => {
      const c = await creator();
      const fan = await followers(c);
      const postId = await draftWithMedia(c);
      const res = await send(c.owner, 'POST', `/creators/me/posts/${postId}/publish`);
      expect(res.statusCode).toBe(200);
      const rows = await inbox(fan.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ type: 'NEW_POST', actorUserId: c.owner.id, postId });
      expect(await inbox(c.owner.id)).toEqual([]);
    });

    it('stays quiet while posts need moderation', async () => {
      const moderated = await boot({ POST_MODERATION_REQUIRED: 'true' });
      try {
        const c = await creator();
        const fan = await followers(c);
        const postId = await draftWithMedia(c);
        const res = await moderated.inject({
          method: 'POST',
          url: `/api/v1/creators/me/posts/${postId}/publish`,
          cookies: { [SESSION_COOKIE]: c.owner.token },
          headers: { origin: WEB_ORIGIN },
        });
        expect(res.statusCode).toBe(200);
        expect(await inbox(fan.id)).toEqual([]);
      } finally {
        await moderated.close();
      }
    });
  });
});
