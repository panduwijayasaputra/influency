import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedCoinPackages } from '../../../prisma/seed/coin-packages.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { DEMO_COIN_PACKAGE_IDS } from '../../common/demo-ids.js';
import type { FakePaymentGateway } from '../../common/fake-payment-gateway.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PAYMENT_GATEWAY } from '../../common/payment-gateway.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { TopupCreditService } from './topup-credit.service.js';
import { TopupsService } from './topups.service.js';

// Orders and ledger rows are never deleted: each test makes a fresh user (the test database is dropped every run).
describe('creditOnce (applyProviderStatus)', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let gateway: FakePaymentGateway;
  let topups: TopupsService;
  let credit: TopupCreditService;

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
    gateway = app.get<FakePaymentGateway>(PAYMENT_GATEWAY);
    topups = app.get(TopupsService);
    credit = app.get(TopupCreditService);
    await seedCoinPackages(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** A pending 25-Koin order for a fresh user. */
  async function newOrder(coins: 10 | 25 | 50 = 25) {
    const user = await prisma.user.create({ data: { displayName: 'Credit user' } });
    const { orderId } = await topups.create(user.id, DEMO_COIN_PACKAGE_IDS[coins], randomUUID());
    const order = await prisma.topupOrder.findUniqueOrThrow({ where: { id: orderId } });
    return { user, order, gross: coins * 1000 };
  }
  const note = (
    o: { orderNumber: string },
    gross: number,
    status: string,
    extra: Record<string, string> = {},
  ) => gateway.notification(o.orderNumber, gross, { transaction_status: status, ...extra });
  const wallet = (userId: string) => prisma.coinWallet.findUnique({ where: { userId } });
  const entries = (userId: string) =>
    prisma.coinLedgerEntry.count({ where: { wallet: { userId } } });

  it('credits exactly the ordered Koin on settlement, with ledger entry, lot and timestamps', async () => {
    const { user, order, gross } = await newOrder(25);
    expect(await credit.applyProviderStatus(note(order, gross, 'settlement'), 'NOTIFICATION')).toBe(
      'CREDITED',
    );
    expect((await wallet(user.id))?.balanceCoins).toBe(25n);
    const after = await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toMatchObject({ status: 'CREDITED', providerStatus: 'settlement' });
    expect(after.creditedAt).not.toBeNull();
    expect(after.paidAt).not.toBeNull();
    expect(after.providerTxRef).toBe(`fake-tx-${order.orderNumber}`);
    const lot = await prisma.coinLot.findFirstOrThrow({ where: { sourceId: order.id } });
    expect([lot.issuedCoins, lot.unspentCoins, lot.basisIdr]).toEqual([25n, 25n, 25000n]);
    expect(await entries(user.id)).toBe(1);
  });

  it('does nothing the second time', async () => {
    const { user, order, gross } = await newOrder();
    const n = note(order, gross, 'settlement');
    await credit.applyProviderStatus(n, 'NOTIFICATION');
    expect(await credit.applyProviderStatus(n, 'NOTIFICATION')).toBe('ALREADY_CREDITED');
    expect((await wallet(user.id))?.balanceCoins).toBe(25n);
    expect(await entries(user.id)).toBe(1);
  });

  it('credits once for capture then settlement', async () => {
    const { user, order, gross } = await newOrder();
    expect(
      await credit.applyProviderStatus(
        note(order, gross, 'capture', { fraud_status: 'accept' }),
        'NOTIFICATION',
      ),
    ).toBe('CREDITED');
    expect(await credit.applyProviderStatus(note(order, gross, 'settlement'), 'NOTIFICATION')).toBe(
      'ALREADY_CREDITED',
    );
    expect((await wallet(user.id))?.balanceCoins).toBe(25n);
  });

  it('credits once for 10 concurrent settlements', async () => {
    const { user, order, gross } = await newOrder();
    const n = note(order, gross, 'settlement');
    const results = await Promise.all(
      Array.from({ length: 10 }, () => credit.applyProviderStatus(n, 'NOTIFICATION')),
    );
    expect(results.filter((r) => r === 'CREDITED')).toHaveLength(1);
    expect(results.filter((r) => r === 'ALREADY_CREDITED')).toHaveLength(9);
    expect((await wallet(user.id))?.balanceCoins).toBe(25n);
    expect(await entries(user.id)).toBe(1);
    expect(await prisma.coinLot.count({ where: { sourceId: order.id } })).toBe(1);
  });

  it('keeps pending pending, and a challenged capture uncredited', async () => {
    const { user, order, gross } = await newOrder();
    expect(
      await credit.applyProviderStatus(
        note(order, gross, 'pending', { status_code: '201' }),
        'NOTIFICATION',
      ),
    ).toBe('STATUS_UPDATED');
    expect(
      await credit.applyProviderStatus(
        note(order, gross, 'capture', { fraud_status: 'challenge' }),
        'NOTIFICATION',
      ),
    ).toBe('STATUS_UPDATED');
    expect((await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'PENDING',
    );
    expect(await wallet(user.id)).toBeNull();
  });

  it.each([
    ['deny', 'FAILED'],
    ['expire', 'EXPIRED'],
    ['cancel', 'CANCELED'],
    ['failure', 'FAILED'],
  ] as const)('%s ends the order as %s and credits nothing', async (status, expected) => {
    const { user, order, gross } = await newOrder();
    expect(await credit.applyProviderStatus(note(order, gross, status), 'NOTIFICATION')).toBe(
      'STATUS_UPDATED',
    );
    expect((await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      expected,
    );
    expect(await wallet(user.id)).toBeNull();
  });

  it('never moves a terminal order back, and quarantines a payment that arrives after expiry', async () => {
    const { user, order, gross } = await newOrder();
    await credit.applyProviderStatus(note(order, gross, 'expire'), 'NOTIFICATION');
    expect(await credit.applyProviderStatus(note(order, gross, 'pending'), 'NOTIFICATION')).toBe(
      'NO_CHANGE',
    );
    expect(await credit.applyProviderStatus(note(order, gross, 'settlement'), 'NOTIFICATION')).toBe(
      'QUARANTINED',
    );
    const after = await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect([after.status, after.quarantineReason]).toEqual(['EXPIRED', 'PAID_AFTER_TERMINAL']);
    expect(await wallet(user.id)).toBeNull();
  });

  it('quarantines a mismatched amount, currency or merchant without crediting', async () => {
    for (const bad of [
      (o: { orderNumber: string }, gross: number) =>
        note(o, gross, 'settlement', { gross_amount: '999000.00' }),
      (o: { orderNumber: string }, gross: number) =>
        note(o, gross, 'settlement', { gross_amount: `${gross}.50` }),
      (o: { orderNumber: string }, gross: number) =>
        note(o, gross, 'settlement', { currency: 'USD' }),
      (o: { orderNumber: string }, gross: number) =>
        note(o, gross, 'settlement', { merchant_id: 'SOMEONE-ELSE' }),
    ]) {
      const { user, order, gross } = await newOrder(10);
      expect(await credit.applyProviderStatus(bad(order, gross), 'NOTIFICATION')).toBe(
        'QUARANTINED',
      );
      const after = await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } });
      expect(after.status).toBe('PENDING');
      expect(after.quarantinedAt).not.toBeNull();
      expect(await wallet(user.id)).toBeNull();
    }
  });

  it('does not credit a quarantined order from a later correct message', async () => {
    const { user, order, gross } = await newOrder();
    await credit.applyProviderStatus(
      note(order, gross, 'settlement', { gross_amount: '1000.00' }),
      'NOTIFICATION',
    );
    expect(await credit.applyProviderStatus(note(order, gross, 'settlement'), 'NOTIFICATION')).toBe(
      'QUARANTINED',
    );
    expect(await wallet(user.id)).toBeNull();
  });

  it('quarantines refund and chargeback on a credited order without touching the balance', async () => {
    const { user, order, gross } = await newOrder();
    await credit.applyProviderStatus(note(order, gross, 'settlement'), 'NOTIFICATION');
    expect(await credit.applyProviderStatus(note(order, gross, 'refund'), 'NOTIFICATION')).toBe(
      'QUARANTINED',
    );
    expect(await credit.applyProviderStatus(note(order, gross, 'deny'), 'NOTIFICATION')).toBe(
      'NO_CHANGE',
    );
    expect((await wallet(user.id))?.balanceCoins).toBe(25n);
    expect((await prisma.topupOrder.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(
      'CREDITED',
    );
  });

  it('rejects a provider transaction id already used by another order', async () => {
    const a = await newOrder();
    const b = await newOrder();
    await credit.applyProviderStatus(
      note(a.order, a.gross, 'pending', { transaction_id: 'shared-tx' }),
      'NOTIFICATION',
    );
    expect(
      await credit.applyProviderStatus(
        note(b.order, b.gross, 'settlement', { transaction_id: 'shared-tx' }),
        'NOTIFICATION',
      ),
    ).toBe('QUARANTINED');
    expect(await wallet(b.user.id)).toBeNull();
  });

  it('reports an unknown order', async () => {
    expect(
      await credit.applyProviderStatus(
        note({ orderNumber: 'INF-nope' }, 10000, 'settlement'),
        'NOTIFICATION',
      ),
    ).toBe('UNKNOWN_ORDER');
  });
});
