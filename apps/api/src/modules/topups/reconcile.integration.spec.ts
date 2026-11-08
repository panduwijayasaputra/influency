import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE, topupOrderSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { seedCoinPackages } from '../../../prisma/seed/coin-packages.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { DEMO_COIN_PACKAGE_IDS } from '../../common/demo-ids.js';
import type { FakePaymentGateway } from '../../common/fake-payment-gateway.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PAYMENT_GATEWAY } from '../../common/payment-gateway.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { TopupCreditService } from './topup-credit.service.js';
import { TopupReconcileService } from './topup-reconcile.service.js';
import { TopupsService } from './topups.service.js';

// Specs pass an explicit `now` to reconcileOne; the one reconcileDue test uses the real clock so it cannot expire
// orders that other spec files create in parallel in the same database.
describe('top-up reconciliation', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let gateway: FakePaymentGateway;
  let topups: TopupsService;
  let credit: TopupCreditService;
  let reconcile: TopupReconcileService;

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
    gateway = app.get<FakePaymentGateway>(PAYMENT_GATEWAY);
    topups = app.get(TopupsService);
    credit = app.get(TopupCreditService);
    reconcile = app.get(TopupReconcileService);
    await seedCoinPackages(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newOrder() {
    const user = await prisma.user.create({ data: { displayName: 'Reconcile user' } });
    const token = `reconcile-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const { orderId } = await topups.create(user.id, DEMO_COIN_PACKAGE_IDS[25], randomUUID());
    const order = await prisma.topupOrder.findUniqueOrThrow({ where: { id: orderId } });
    return { user, order, cookies: { [SESSION_COOKIE]: token } };
  }
  const reload = (id: string) => prisma.topupOrder.findUniqueOrThrow({ where: { id } });
  const balance = async (userId: string) =>
    (await prisma.coinWallet.findUnique({ where: { userId } }))?.balanceCoins ?? 0n;
  const settled = (orderNumber: string, extra: Record<string, string> = {}) =>
    gateway.notification(orderNumber, 25000, { transaction_status: 'settlement', ...extra });
  const minutes = (n: number) => n * 60_000;

  it('credits a paid order whose notification never arrived, once', async () => {
    const { user, order } = await newOrder();
    gateway.setStatus(order.orderNumber, settled(order.orderNumber));
    await reconcile.reconcileOne(order.id);
    expect(await balance(user.id)).toBe(25n);
    expect((await reload(order.id)).status).toBe('CREDITED');
    await reconcile.reconcileOne(order.id);
    expect(await balance(user.id)).toBe(25n);
    expect(await prisma.coinLedgerEntry.count({ where: { wallet: { userId: user.id } } })).toBe(1);
    const events = await prisma.paymentWebhookEvent.findMany({
      where: { orderNumber: order.orderNumber },
    });
    expect(events.map((e) => [e.provider, e.outcome])).toEqual([['midtrans_status', 'CREDITED']]);
  });

  it('reconcileDue checks due orders only', async () => {
    const due = await newOrder();
    const notDue = await newOrder();
    await prisma.topupOrder.update({
      where: { id: due.order.id },
      data: { nextCheckAt: new Date(Date.now() - 1000) },
    });
    gateway.setStatus(due.order.orderNumber, settled(due.order.orderNumber));
    gateway.setStatus(notDue.order.orderNumber, settled(notDue.order.orderNumber));
    expect(await reconcile.reconcileDue()).toBeGreaterThanOrEqual(1);
    expect(await balance(due.user.id)).toBe(25n);
    expect(await balance(notDue.user.id)).toBe(0n); // next check is still a minute away
  });

  it('credits once when a status check races a late notification', async () => {
    const { user, order } = await newOrder();
    const n = settled(order.orderNumber);
    gateway.setStatus(order.orderNumber, n);
    await Promise.all([
      reconcile.reconcileOne(order.id),
      credit.handleNotification(n),
      credit.handleNotification(n),
      reconcile.reconcileOne(order.id),
    ]);
    expect(await balance(user.id)).toBe(25n);
    expect(await prisma.coinLedgerEntry.count({ where: { wallet: { userId: user.id } } })).toBe(1);
  });

  it('keeps an order pending when Midtrans has no transaction yet, with a growing backoff', async () => {
    const { order } = await newOrder();
    const t0 = new Date();
    await reconcile.reconcileOne(order.id, t0);
    const first = await reload(order.id);
    expect(first).toMatchObject({ status: 'PENDING', checkAttempts: 1 });
    expect(first.nextCheckAt!.getTime() - t0.getTime()).toBe(60_000);
    await reconcile.reconcileOne(order.id, t0);
    expect((await reload(order.id)).nextCheckAt!.getTime() - t0.getTime()).toBe(120_000);
  });

  it('waits out the grace period, then expires an unpaid order without crediting', async () => {
    const { user, order } = await newOrder();
    await reconcile.reconcileOne(order.id, new Date(order.expiresAt!.getTime() + minutes(5)));
    expect((await reload(order.id)).status).toBe('PENDING');
    await reconcile.reconcileOne(order.id, new Date(order.expiresAt!.getTime() + minutes(11)));
    expect(await reload(order.id)).toMatchObject({
      status: 'EXPIRED',
      failureReason: 'NOT_PAID_IN_TIME',
    });
    expect(await balance(user.id)).toBe(0n);
    // A payment that shows up after that is flagged for a person, not credited.
    expect(await credit.applyProviderStatus(settled(order.orderNumber), 'NOTIFICATION')).toBe(
      'QUARANTINED',
    );
    expect(await balance(user.id)).toBe(0n);
  });

  it('expires a CREATED order that never got a checkout, without asking Midtrans', async () => {
    const { order } = await newOrder();
    await prisma.topupOrder.update({
      where: { id: order.id },
      data: { status: 'CREATED', expiresAt: null, redirectUrl: null },
    });
    const calls = gateway.statusCalls;
    await reconcile.reconcileOne(order.id, new Date(order.createdAt.getTime() + minutes(60 + 11)));
    expect((await reload(order.id)).status).toBe('EXPIRED');
    expect(gateway.statusCalls).toBe(calls);
  });

  it('leaves the order unchanged (except backoff) when Midtrans fails', async () => {
    const { user, order } = await newOrder();
    const spy = vi.spyOn(gateway, 'getStatus').mockRejectedValueOnce(new Error('Midtrans is down'));
    try {
      await reconcile.reconcileOne(order.id);
    } finally {
      spy.mockRestore();
    }
    expect(await reload(order.id)).toMatchObject({ status: 'PENDING', checkAttempts: 1 });
    expect(await balance(user.id)).toBe(0n);
  });

  it('quarantines a status answer with a bad signature and stops checking that order', async () => {
    const { user, order } = await newOrder();
    gateway.setStatus(
      order.orderNumber,
      settled(order.orderNumber, { signature_key: 'e'.repeat(128) }),
    );
    await reconcile.reconcileOne(order.id);
    expect(await reload(order.id)).toMatchObject({
      status: 'PENDING',
      quarantineReason: 'STATUS_SIGNATURE_INVALID',
    });
    expect(await balance(user.id)).toBe(0n);
    const calls = gateway.statusCalls;
    await reconcile.reconcileOne(order.id);
    expect(gateway.statusCalls).toBe(calls);
  });

  it('quarantines a status answer with the wrong amount', async () => {
    const { user, order } = await newOrder();
    gateway.setStatus(order.orderNumber, settled(order.orderNumber, { gross_amount: '1000.00' }));
    await reconcile.reconcileOne(order.id);
    expect((await reload(order.id)).quarantineReason).toBe('AMOUNT_MISMATCH');
    expect(await balance(user.id)).toBe(0n);
  });

  describe('opening the status page', () => {
    const read = (cookies: Record<string, string>, id: string) =>
      app.inject({ method: 'GET', url: `/api/v1/wallet/topups/${id}`, cookies });

    it('credits a paid order and shows the new balance', async () => {
      const { order, cookies } = await newOrder();
      gateway.setStatus(order.orderNumber, settled(order.orderNumber));
      const body = topupOrderSchema.parse((await read(cookies, order.id)).json());
      expect(body).toMatchObject({ status: 'CREDITED', balanceCoins: 25, redirectUrl: null });
    });

    it('asks Midtrans at most once per 10 seconds', async () => {
      const { order, cookies } = await newOrder();
      const before = gateway.statusCalls;
      expect(topupOrderSchema.parse((await read(cookies, order.id)).json()).status).toBe('PENDING');
      expect(gateway.statusCalls).toBe(before + 1);
      await read(cookies, order.id);
      expect(gateway.statusCalls).toBe(before + 1);
    });

    it("does not ask for another user's order", async () => {
      const mine = await newOrder();
      const other = await newOrder();
      const before = gateway.statusCalls;
      expect((await read(other.cookies, mine.order.id)).statusCode).toBe(404);
      expect(gateway.statusCalls).toBe(before);
    });
  });
});
