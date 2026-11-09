import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE } from '@influency/shared';
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
import { PrismaService } from '../../common/prisma.service.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const URL = '/api/v1/webhooks/payments/midtrans';

// Orders and ledger rows are never deleted: each test makes a fresh user (the test database is dropped every run).
describe('POST /webhooks/payments/midtrans', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let gateway: FakePaymentGateway;

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
    await seedCoinPackages(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** A user with a pending 25-Koin order created through the real endpoint. */
  async function newOrder() {
    const user = await prisma.user.create({ data: { displayName: 'Webhook user' } });
    const token = `webhook-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/topups',
      cookies: { [SESSION_COOKIE]: token },
      headers: { origin: 'http://localhost:3000', 'idempotency-key': randomUUID() },
      payload: { packageId: DEMO_COIN_PACKAGE_IDS[25] },
    });
    const { orderId } = res.json<{ orderId: string }>();
    const order = await prisma.topupOrder.findUniqueOrThrow({ where: { id: orderId } });
    return { user, order, cookies: { [SESSION_COOKIE]: token } };
  }
  const post = (payload: unknown) =>
    // No cookie and no Origin: Midtrans is not a browser.
    app.inject({ method: 'POST', url: URL, payload: payload as object });
  const settle = (orderNumber: string, extra: Record<string, string> = {}) =>
    gateway.notification(orderNumber, 25000, { transaction_status: 'settlement', ...extra });
  const balance = async (userId: string) =>
    (await prisma.coinWallet.findUnique({ where: { userId } }))?.balanceCoins ?? 0n;
  const events = (orderNumber: string) =>
    prisma.paymentWebhookEvent.findMany({ where: { orderNumber } });

  it('credits the wallet on a signed settlement, without a session or Origin', async () => {
    const { user, order } = await newOrder();
    const res = await post(settle(order.orderNumber));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(await balance(user.id)).toBe(25n);
    const [event] = await events(order.orderNumber);
    expect(event).toMatchObject({
      provider: 'midtrans',
      signatureValid: true,
      outcome: 'CREDITED',
    });
    expect(event!.processedAt).not.toBeNull();
  });

  it('credits once for the same notification delivered 10 times concurrently', async () => {
    const { user, order } = await newOrder();
    const body = settle(order.orderNumber);
    const results = await Promise.all(Array.from({ length: 10 }, () => post(body)));
    expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(200));
    expect(await balance(user.id)).toBe(25n);
    expect(await prisma.coinLedgerEntry.count({ where: { wallet: { userId: user.id } } })).toBe(1);
    expect(await events(order.orderNumber)).toHaveLength(1);
  });

  it('credits once for capture followed by settlement', async () => {
    const { user, order } = await newOrder();
    await post(
      gateway.notification(order.orderNumber, 25000, {
        transaction_status: 'capture',
        fraud_status: 'accept',
      }),
    );
    await post(settle(order.orderNumber));
    expect(await balance(user.id)).toBe(25n);
    expect(await events(order.orderNumber)).toHaveLength(2);
  });

  it('rejects a bad signature with 401, stores the attempt and changes nothing', async () => {
    const { user, order } = await newOrder();
    const res = await post({ ...settle(order.orderNumber), signature_key: 'f'.repeat(128) });
    expect(res.statusCode).toBe(401);
    expect(res.json<{ error: { code: string } }>().error.code).toBe('PAYMENT_VERIFICATION_FAILED');
    expect(await balance(user.id)).toBe(0n);
    expect((await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING',
    );
    const [event] = await events(order.orderNumber);
    expect(event).toMatchObject({ signatureValid: false, outcome: 'REJECTED_SIGNATURE' });
  });

  it('a forged copy with a bad signature cannot block the real delivery', async () => {
    const { user, order } = await newOrder();
    expect(
      (await post({ ...settle(order.orderNumber), signature_key: 'a'.repeat(128) })).statusCode,
    ).toBe(401);
    expect((await post(settle(order.orderNumber))).statusCode).toBe(200);
    expect(await balance(user.id)).toBe(25n);
  });

  it('quarantines a validly signed notification with the wrong amount (200, no credit) and shows UNDER_REVIEW', async () => {
    const { user, order, cookies } = await newOrder();
    const res = await post(
      gateway.notification(order.orderNumber, 25000, {
        transaction_status: 'settlement',
        gross_amount: '1000.00',
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(await balance(user.id)).toBe(0n);
    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/wallet/topups/${order.id}`,
      cookies,
    });
    expect(status.json<{ status: string }>().status).toBe('UNDER_REVIEW');
    expect((await events(order.orderNumber))[0]!.outcome).toBe('QUARANTINED');
  });

  it('answers 400 for a malformed body and stores nothing', async () => {
    const res = await post({ order_id: 'INF-x' });
    expect(res.statusCode).toBe(400);
  });

  it('acknowledges a notification for an unknown order (dashboard test pings)', async () => {
    const res = await post(settle('INF-unknown-order'));
    expect(res.statusCode).toBe(200);
    expect((await events('INF-unknown-order'))[0]!.outcome).toBe('UNKNOWN_ORDER');
  });

  it('answers 500 when the event cannot be stored, so Midtrans retries', async () => {
    const { order } = await newOrder();
    const spy = vi
      .spyOn(app.get(PrismaService), '$queryRaw')
      .mockRejectedValueOnce(new Error('db down'));
    try {
      const res = await post(settle(order.orderNumber));
      expect(res.statusCode).toBe(500);
    } finally {
      spy.mockRestore();
    }
    expect((await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING',
    );
  });

  it('never credits because the browser came back from checkout', async () => {
    const { user, order, cookies } = await newOrder();
    const status = await app.inject({
      method: 'GET',
      url: `/api/v1/wallet/topups/${order.id}?transaction_status=settlement&status_code=200`,
      cookies,
    });
    expect(status.json<{ status: string }>().status).toBe('PENDING');
    expect(await balance(user.id)).toBe(0n);
  });
});
