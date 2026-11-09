import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { createTopupResponseSchema, SESSION_COOKIE, topupOrderSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedCoinPackages } from '../../../prisma/seed/coin-packages.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import type { FakePaymentGateway } from '../../common/fake-payment-gateway.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PAYMENT_GATEWAY } from '../../common/payment-gateway.js';
import { DEMO_COIN_PACKAGE_IDS } from '../../common/demo-ids.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const WEB_ORIGIN = 'http://localhost:3000';
const PKG25 = DEMO_COIN_PACKAGE_IDS[25];
const PKG50 = DEMO_COIN_PACKAGE_IDS[50];

// Orders and ledger rows are never deleted: each test makes fresh users (the test database is dropped every run).
describe('POST /wallet/topups and GET /wallet/topups/:id', () => {
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

  async function newUser() {
    const user = await prisma.user.create({ data: { displayName: 'Top-up user' } });
    const token = `topup-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return { id: user.id, cookies: { [SESSION_COOKIE]: token } };
  }
  type User = Awaited<ReturnType<typeof newUser>>;
  const create = (user: User | null, payload: unknown, key: string | null = randomUUID()) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/wallet/topups',
      cookies: user?.cookies ?? {},
      headers: { origin: WEB_ORIGIN, ...(key ? { 'idempotency-key': key } : {}) },
      payload: payload as object,
    });
  const read = (user: User | null, path: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/wallet/topups${path}`,
      cookies: user?.cookies ?? {},
    });
  const code = (res: { json: <T>() => T }) => res.json<{ error: { code: string } }>().error.code;

  it('creates a pending order priced from the package, ignoring a client price', async () => {
    const user = await newUser();
    const res = await create(user, { packageId: PKG25, priceIdr: 1, coins: 9999, amount: 1 });
    expect(res.statusCode).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    const { orderId, redirectUrl } = createTopupResponseSchema.parse(res.json());
    expect(redirectUrl).toBe(`${WEB_ORIGIN}/wallet/topups/${orderId}`);
    const order = await prisma.topupOrder.findUniqueOrThrow({ where: { id: orderId } });
    expect(order).toMatchObject({
      userId: user.id,
      coins: 25n,
      priceIdr: 25000n,
      feeIdr: 0n,
      totalIdr: 25000n,
      currency: 'IDR',
      status: 'PENDING',
      redirectUrl,
    });
    expect(order.orderNumber).toBe(`INF-${orderId.replaceAll('-', '')}`);
    expect(order.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(gateway.created.at(-1)).toMatchObject({
      orderNumber: order.orderNumber,
      grossIdr: 25000,
    });
    // Nothing is credited by creating an order.
    expect(await prisma.coinWallet.count({ where: { userId: user.id } })).toBe(0);
  });

  it('rejects an unknown or inactive package', async () => {
    const user = await newUser();
    const unknown = await create(user, { packageId: randomUUID() });
    expect([unknown.statusCode, code(unknown)]).toEqual([404, 'PACKAGE_NOT_AVAILABLE']);
    // An inactive package of its own, so the shared seeded packages (read by other specs in parallel) stay untouched.
    const inactive = await prisma.coinPackage.upsert({
      where: { coins: 7 },
      create: { coins: 7, priceIdr: 7000, active: false },
      update: { active: false },
    });
    expect(code(await create(user, { packageId: inactive.id }))).toBe('PACKAGE_NOT_AVAILABLE');
    expect(await prisma.topupOrder.count({ where: { userId: user.id } })).toBe(0);
  });

  it('needs a well-formed Idempotency-Key and a valid body', async () => {
    const user = await newUser();
    expect((await create(user, { packageId: PKG25 }, null)).statusCode).toBe(400);
    expect((await create(user, { packageId: PKG25 }, 'short')).statusCode).toBe(400);
    expect((await create(user, { packageId: 'not-a-uuid' })).statusCode).toBe(400);
  });

  it('replays the same order for the same key and payload, and rejects a different payload', async () => {
    const user = await newUser();
    const key = randomUUID();
    const first = createTopupResponseSchema.parse(
      (await create(user, { packageId: PKG25 }, key)).json(),
    );
    const again = await create(user, { packageId: PKG25 }, key);
    expect(again.statusCode).toBe(201);
    expect(createTopupResponseSchema.parse(again.json())).toEqual(first);
    const other = await create(user, { packageId: PKG50 }, key);
    expect([other.statusCode, code(other)]).toEqual([409, 'DUPLICATE_REQUEST']);
    expect(await prisma.topupOrder.count({ where: { userId: user.id } })).toBe(1);
  });

  it('creates one order for 5 concurrent identical requests', async () => {
    const user = await newUser();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () => create(user, { packageId: PKG25 }, key)),
    );
    expect(await prisma.topupOrder.count({ where: { userId: user.id } })).toBe(1);
    // The rest see the committed order: 201 once the checkout exists, 409 REQUEST_IN_PROGRESS before that.
    for (const r of results) {
      expect(
        r.statusCode === 201 || (r.statusCode === 409 && code(r) === 'REQUEST_IN_PROGRESS'),
      ).toBe(true);
    }
    expect(results.some((r) => r.statusCode === 201)).toBe(true);
  });

  it('marks the order FAILED when the gateway fails, and a replay fails the same way', async () => {
    const user = await newUser();
    const key = randomUUID();
    gateway.failNextCreate();
    const res = await create(user, { packageId: PKG25 }, key);
    expect([res.statusCode, code(res)]).toEqual([502, 'PAYMENT_GATEWAY_UNAVAILABLE']);
    const order = await prisma.topupOrder.findFirstOrThrow({ where: { userId: user.id } });
    expect(order).toMatchObject({ status: 'FAILED', failureReason: 'GATEWAY_CREATE_FAILED' });
    expect(code(await create(user, { packageId: PKG25 }, key))).toBe('PAYMENT_GATEWAY_UNAVAILABLE');
    // A new key starts a fresh attempt.
    expect((await create(user, { packageId: PKG25 })).statusCode).toBe(201);
  });

  it('replays REQUEST_IN_PROGRESS while the first call has not reached the gateway', async () => {
    const user = await newUser();
    const key = randomUUID();
    await create(user, { packageId: PKG25 }, key);
    await prisma.topupOrder.updateMany({
      where: { userId: user.id },
      data: { status: 'CREATED', redirectUrl: null },
    });
    expect(code(await create(user, { packageId: PKG25 }, key))).toBe('REQUEST_IN_PROGRESS');
  });

  it('shows the order to its owner only', async () => {
    const owner = await newUser();
    const other = await newUser();
    const { orderId } = createTopupResponseSchema.parse(
      (await create(owner, { packageId: PKG25 })).json(),
    );
    const mine = await read(owner, `/${orderId}`);
    expect(mine.statusCode).toBe(200);
    expect(topupOrderSchema.parse(mine.json())).toMatchObject({
      id: orderId,
      status: 'PENDING',
      coins: 25,
      totalIdr: 25000,
      balanceCoins: null,
    });
    const foreign = await read(other, `/${orderId}`);
    expect([foreign.statusCode, code(foreign)]).toEqual([404, 'TOPUP_NOT_FOUND']);
    expect((await read(owner, '/not-a-uuid')).statusCode).toBe(404);
    expect((await read(owner, `/${randomUUID()}`)).statusCode).toBe(404);
  });

  it("lists only the caller's pending orders", async () => {
    const a = await newUser();
    const b = await newUser();
    await create(a, { packageId: PKG25 });
    expect((await read(a, '')).json<{ items: unknown[] }>().items).toHaveLength(1);
    expect((await read(b, '')).json<{ items: unknown[] }>().items).toHaveLength(0);
  });

  it('shows a quarantined order as UNDER_REVIEW with no pay link', async () => {
    const user = await newUser();
    const { orderId } = createTopupResponseSchema.parse(
      (await create(user, { packageId: PKG25 })).json(),
    );
    await prisma.topupOrder.update({
      where: { id: orderId },
      data: { quarantinedAt: new Date(), quarantineReason: 'AMOUNT_MISMATCH' },
    });
    const body = topupOrderSchema.parse((await read(user, `/${orderId}`)).json());
    expect([body.status, body.redirectUrl]).toEqual(['UNDER_REVIEW', null]);
  });

  it('requires a session', async () => {
    expect((await create(null, { packageId: PKG25 })).statusCode).toBe(401);
    expect((await read(null, '')).statusCode).toBe(401);
    expect((await read(null, `/${randomUUID()}`)).statusCode).toBe(401);
  });

  it('rejects a cross-origin create (CSRF guard)', async () => {
    const user = await newUser();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/wallet/topups',
      cookies: user.cookies,
      headers: { origin: 'https://evil.example', 'idempotency-key': randomUUID() },
      payload: { packageId: PKG25 },
    });
    expect(res.statusCode).toBe(403);
  });
});
