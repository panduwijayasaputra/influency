import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  coinPackagesResponseSchema,
  SESSION_COOKIE,
  walletSchema,
  walletTransactionsPageSchema,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedCoinPackages } from '../../../prisma/seed/coin-packages.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { WalletsService } from './wallets.service.js';

// The ledger is append-only, so users and their wallets are never deleted: each test gets fresh users
// (the test database is dropped at the start of every run).
describe('koin wallet', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let wallets: WalletsService;
  let appPrisma: PrismaService;

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
    await seedCoinPackages(prisma);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newUser() {
    const user = await prisma.user.create({ data: { displayName: 'Wallet user' } });
    const token = `wallet-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return { id: user.id, cookies: { [SESSION_COOKIE]: token } };
  }
  const credit = (userId: string, coins: bigint, sourceId = randomUUID()) =>
    appPrisma.$transaction((tx) =>
      wallets.creditInTx(tx, {
        userId,
        coins,
        entryType: 'TOPUP_CREDIT',
        sourceType: 'TOPUP_ORDER',
        sourceId,
        basisIdr: coins * 1000n,
      }),
    );
  const get = (url: string, cookies: Record<string, string> = {}) =>
    app.inject({ method: 'GET', url: `/api/v1${url}`, cookies });
  /** balance_coins must equal the sum of the ledger. */
  const expectConsistent = async (userId: string) => {
    const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId } });
    const sum = await prisma.coinLedgerEntry.aggregate({
      where: { walletId: wallet.id },
      _sum: { amountCoins: true },
    });
    expect(wallet.balanceCoins).toBe(sum._sum.amountCoins ?? 0n);
  };

  it('reads 0 for a new user without creating a wallet row', async () => {
    const user = await newUser();
    const res = await get('/wallet', user.cookies);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(walletSchema.parse(res.json())).toEqual({ balanceCoins: 0 });
    expect(await prisma.coinWallet.count({ where: { userId: user.id } })).toBe(0);
    const tx = await get('/wallet/transactions', user.cookies);
    expect(walletTransactionsPageSchema.parse(tx.json())).toEqual({ items: [], nextCursor: null });
  });

  it('credits through the ledger: running balances, one lot per credit', async () => {
    const user = await newUser();
    await credit(user.id, 25n);
    await credit(user.id, 10n);
    const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceCoins).toBe(35n);
    const entries = await prisma.coinLedgerEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => [e.amountCoins, e.balanceAfterCoins])).toEqual([
      [25n, 25n],
      [10n, 35n],
    ]);
    const lots = await prisma.coinLot.findMany({ where: { walletId: wallet.id } });
    expect(lots).toHaveLength(2);
    expect(
      lots.every((l) => l.unspentCoins === l.issuedCoins && l.basisIdr === l.issuedCoins * 1000n),
    ).toBe(true);
    await expectConsistent(user.id);
    expect((await get('/wallet', user.cookies)).json()).toEqual({ balanceCoins: 35 });
  });

  it('rolls back the whole credit when the same source is posted twice', async () => {
    const user = await newUser();
    const sourceId = randomUUID();
    await credit(user.id, 10n, sourceId);
    await expect(credit(user.id, 10n, sourceId)).rejects.toThrow();
    const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceCoins).toBe(10n);
    expect(await prisma.coinLedgerEntry.count({ where: { walletId: wallet.id } })).toBe(1);
    expect(await prisma.coinLot.count({ where: { walletId: wallet.id } })).toBe(1);
  });

  it('rejects a non-positive credit', async () => {
    const user = await newUser();
    await expect(credit(user.id, 0n)).rejects.toThrow(/greater than 0/);
    expect(await prisma.coinWallet.count({ where: { userId: user.id } })).toBe(0);
  });

  it('serialises 10 parallel credits to a brand-new wallet', async () => {
    const user = await newUser();
    await Promise.all(Array.from({ length: 10 }, () => credit(user.id, 10n)));
    const wallet = await prisma.coinWallet.findUniqueOrThrow({ where: { userId: user.id } });
    expect(wallet.balanceCoins).toBe(100n);
    expect(await prisma.coinWallet.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.coinLedgerEntry.count({ where: { walletId: wallet.id } })).toBe(10);
    await expectConsistent(user.id);
  });

  it('pages the activity newest first without repeats, and rejects a bad cursor', async () => {
    const user = await newUser();
    for (let i = 1; i <= 25; i++) await credit(user.id, BigInt(i));
    const first = walletTransactionsPageSchema.parse(
      (await get('/wallet/transactions', user.cookies)).json(),
    );
    expect(first.items).toHaveLength(20);
    expect(first.items[0]!.amountCoins).toBe(25);
    expect(first.items[0]!.topupOrderId).not.toBeNull();
    const second = walletTransactionsPageSchema.parse(
      (
        await get(
          `/wallet/transactions?cursor=${encodeURIComponent(first.nextCursor!)}`,
          user.cookies,
        )
      ).json(),
    );
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(25);
    expect([...first.items, ...second.items].map((i) => i.amountCoins)).toEqual(
      Array.from({ length: 25 }, (_, i) => 25 - i),
    );
    const bad = await get('/wallet/transactions?cursor=nope', user.cookies);
    expect(bad.statusCode).toBe(400);
  });

  it('keeps wallets private: guests get 401 and users only see their own entries', async () => {
    const a = await newUser();
    const b = await newUser();
    await credit(a.id, 50n);
    expect((await get('/wallet')).statusCode).toBe(401);
    expect((await get('/wallet/transactions')).statusCode).toBe(401);
    expect((await get('/wallet', b.cookies)).json()).toEqual({ balanceCoins: 0 });
    const tx = walletTransactionsPageSchema.parse(
      (await get('/wallet/transactions', b.cookies)).json(),
    );
    expect(tx.items).toEqual([]);
  });

  it('lists the five active packages without a session, smallest first', async () => {
    const res = await get('/wallet/packages');
    expect(res.statusCode).toBe(200);
    const { items } = coinPackagesResponseSchema.parse(res.json());
    expect(items.map((p) => [p.coins, p.priceIdr])).toEqual([
      [10, 10000],
      [25, 25000],
      [50, 50000],
      [100, 100000],
      [250, 250000],
    ]);
  });
});
