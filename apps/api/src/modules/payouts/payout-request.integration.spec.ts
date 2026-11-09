import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { type CreatePayoutInput, payoutSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { payoutFixtures, type TestCreator } from '../../../test/payout-fixtures.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { EarningsService } from './earnings.service.js';
import { PayoutsService } from './payouts.service.js';

const WEB_ORIGIN = 'http://localhost:3000';
// Default fee config in tests: Rp2.500, not confirmed.
const FEE = 2_500;
const ask = (amountIdr: number, expectedFeeIdr = FEE): CreatePayoutInput => ({
  amountIdr,
  expectedFeeIdr,
});
const newKey = () => `key-${randomUUID()}`;

describe('POST /api/v1/me/payouts', () => {
  const prisma = createTestPrisma();
  const { newUser, newCreator, earn, addAccount } = payoutFixtures(prisma);
  let app: NestFastifyApplication;
  let payouts: PayoutsService;
  let earnings: EarningsService;
  // Sessions are created once, here: the auth spec counts sessions across a request.
  let http: TestCreator;
  let limited: TestCreator;
  let guards: TestCreator;
  let invalid: TestCreator[];
  let plain: TestCreator;

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
    payouts = app.get(PayoutsService);
    earnings = app.get(EarningsService);
    [http, limited, guards] = await Promise.all([
      newCreator(true),
      newCreator(true),
      newCreator(true),
    ]);
    invalid = await Promise.all([newCreator(true), newCreator(true)]);
    plain = await newUser(true);
    await earn(http, 1_000_000);
    await addAccount(http);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** A creator with `available` rupiah matured and one active account. */
  async function funded(available = 250_000) {
    const creator = await newCreator();
    await earn(creator, available);
    const account = await addAccount(creator);
    return { creator, account };
  }
  const request = (c: TestCreator, key: string, body: CreatePayoutInput) =>
    payouts.request(c.userId, c.creatorProfileId, key, body);
  const balanceOf = (c: TestCreator) => earnings.balance(c.creatorProfileId);
  const rows = (c: TestCreator) =>
    prisma.creatorPayout.findMany({ where: { creatorProfileId: c.creatorProfileId } });
  const reservedSum = async (c: TestCreator) =>
    (await rows(c))
      .filter((r) => r.status === 'REQUESTED')
      .reduce((sum, r) => sum + r.amountIdr, 0n);

  describe('a request', () => {
    it('creates a REQUESTED payout that snapshots the amount, fee and destination, and reserves the amount', async () => {
      const { creator, account } = await funded();
      const { payout, replay } = await request(creator, newKey(), ask(150_000));
      expect(replay).toBe(false);
      expect(payoutSchema.parse(payout)).toMatchObject({
        amountIdr: 150_000,
        feeIdr: FEE,
        netIdr: 150_000 - FEE,
        feeIsPlaceholder: true,
        status: 'REQUESTED',
        destination: {
          bankCode: 'BCA',
          bankName: 'BCA',
          last4: '4821',
          holderName: 'Nadia Kirana',
        },
      });
      const row = await prisma.creatorPayout.findUniqueOrThrow({ where: { id: payout.id } });
      expect(row).toMatchObject({
        payoutAccountId: account.id,
        requestedByUserId: creator.userId,
        amountIdr: 150_000n,
      });
      expect(await balanceOf(creator)).toMatchObject({
        availableIdr: 100_000,
        reservedIdr: 150_000,
      });
    });

    it('writes the first status change: null -> REQUESTED by the requester', async () => {
      const { creator } = await funded();
      const { payout } = await request(creator, newKey(), ask(100_000));
      const changes = await prisma.creatorPayoutStatusChange.findMany({
        where: { payoutId: payout.id },
      });
      expect(changes).toHaveLength(1);
      expect(changes[0]).toMatchObject({
        fromStatus: null,
        toStatus: 'REQUESTED',
        actorUserId: creator.userId,
      });
    });

    it('keeps the destination it snapshotted when the account changes afterwards', async () => {
      const { creator, account } = await funded();
      const { payout } = await request(creator, newKey(), ask(100_000));
      const other = await addAccount(creator, { active: false, last4: '9999', bankCode: 'BNI' });
      await prisma.creatorPayoutAccount.update({
        where: { id: account.id },
        data: { active: false },
      });
      await prisma.creatorPayoutAccount.update({ where: { id: other.id }, data: { active: true } });
      const row = await prisma.creatorPayout.findUniqueOrThrow({ where: { id: payout.id } });
      expect(row).toMatchObject({
        bankCode: 'BCA',
        accountLast4: '4821',
        payoutAccountId: account.id,
      });
    });

    it('allows exactly the available amount and refuses one rupiah more', async () => {
      const { creator } = await funded(250_000);
      await expect(request(creator, newKey(), ask(250_001))).rejects.toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
        details: { availableIdr: 250_000 },
      });
      await request(creator, newKey(), ask(250_000));
      expect(await balanceOf(creator)).toMatchObject({ availableIdr: 0, reservedIdr: 250_000 });
    });

    it('accepts the Rp100.000 minimum and refuses less, measured before the fee', async () => {
      const { creator } = await funded();
      await expect(request(creator, newKey(), ask(99_999))).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(request(creator, newKey(), ask(100_000))).resolves.toBeDefined();
    });

    it('does not let pending earnings be requested', async () => {
      const creator = await newCreator();
      await earn(creator, 250_000, 1);
      await addAccount(creator);
      await expect(request(creator, newKey(), ask(100_000))).rejects.toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
        details: { availableIdr: 0 },
      });
      expect(await rows(creator)).toHaveLength(0);
    });

    it('needs an active account', async () => {
      const creator = await newCreator();
      await earn(creator, 250_000);
      await expect(request(creator, newKey(), ask(100_000))).rejects.toMatchObject({
        code: 'PAYOUT_ACCOUNT_REQUIRED',
      });
      await addAccount(creator, { active: false });
      await expect(request(creator, newKey(), ask(100_000))).rejects.toMatchObject({
        code: 'PAYOUT_ACCOUNT_REQUIRED',
      });
      expect(await rows(creator)).toHaveLength(0);
    });

    it('catches a fee that is not the one shown, and tells the real one', async () => {
      const { creator } = await funded();
      await expect(request(creator, newKey(), ask(100_000, 0))).rejects.toMatchObject({
        code: 'PAYOUT_FEE_CHANGED',
        details: { feeIdr: FEE },
      });
      expect(await rows(creator)).toHaveLength(0);
    });

    it('handles amounts beyond 32 bits', async () => {
      const { creator } = await funded(5_001_000_000);
      const { payout } = await request(creator, newKey(), ask(5_000_000_000));
      expect(payout).toMatchObject({ amountIdr: 5_000_000_000, netIdr: 5_000_000_000 - FEE });
    });

    it("is unaffected by another creator's balance and payouts", async () => {
      const mine = await funded(100_000);
      const theirs = await funded(250_000);
      await request(theirs.creator, newKey(), ask(250_000));
      await expect(request(mine.creator, newKey(), ask(250_000))).rejects.toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
      });
      expect(await balanceOf(mine.creator)).toMatchObject({
        availableIdr: 100_000,
        reservedIdr: 0,
      });
    });
  });

  describe('idempotency', () => {
    it('replays the same key with the same payload: the same payout, reserved once', async () => {
      const { creator } = await funded();
      const key = newKey();
      const first = await request(creator, key, ask(150_000));
      const second = await request(creator, key, ask(150_000));
      expect(second.replay).toBe(true);
      expect(second.payout).toEqual(first.payout);
      expect(await rows(creator)).toHaveLength(1);
      expect(
        await prisma.creatorPayoutStatusChange.count({ where: { payoutId: first.payout.id } }),
      ).toBe(1);
      expect(await balanceOf(creator)).toMatchObject({
        availableIdr: 100_000,
        reservedIdr: 150_000,
      });
    });

    it('refuses the same key with a different payload and changes nothing', async () => {
      const { creator } = await funded();
      const key = newKey();
      await request(creator, key, ask(150_000));
      await expect(request(creator, key, ask(120_000))).rejects.toMatchObject({
        code: 'DUPLICATE_REQUEST',
      });
      expect(await rows(creator)).toHaveLength(1);
    });

    it('does not burn the key when a check fails: the corrected retry with the same key succeeds', async () => {
      const { creator } = await funded();
      const key = newKey();
      await expect(request(creator, key, ask(100_000, 0))).rejects.toMatchObject({
        code: 'PAYOUT_FEE_CHANGED',
      });
      await expect(request(creator, key, ask(100_000))).resolves.toMatchObject({ replay: false });
      expect(await rows(creator)).toHaveLength(1);
    });

    it('keys are per user: the same key text by two creators makes two payouts', async () => {
      const a = await funded();
      const b = await funded();
      const key = newKey();
      const first = await request(a.creator, key, ask(100_000));
      const second = await request(b.creator, key, ask(100_000));
      expect(second.replay).toBe(false);
      expect(second.payout.id).not.toBe(first.payout.id);
    });
  });

  describe('concurrency', () => {
    it('never reserves more than is available when requests race with different keys', async () => {
      const { creator } = await funded(250_000);
      const results = await Promise.allSettled(
        Array.from({ length: 6 }, () => request(creator, newKey(), ask(100_000))),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
      for (const r of results.filter((r) => r.status === 'rejected')) {
        expect(r.reason).toMatchObject({ code: 'PAYOUT_EXCEEDS_AVAILABLE' });
      }
      expect(await reservedSum(creator)).toBe(200_000n);
      expect(await balanceOf(creator)).toMatchObject({
        availableIdr: 50_000,
        reservedIdr: 200_000,
      });
      expect(
        await prisma.creatorPayoutStatusChange.count({
          where: { payout: { creatorProfileId: creator.creatorProfileId } },
        }),
      ).toBe(2);
    });

    it('lets only one of two requests that each fit alone but not together', async () => {
      const { creator } = await funded(250_000);
      const results = await Promise.allSettled([
        request(creator, newKey(), ask(150_000)),
        request(creator, newKey(), ask(150_000)),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(await reservedSum(creator)).toBe(150_000n);
    });

    it('makes one payout when the same request is sent many times at once', async () => {
      const { creator } = await funded();
      const key = newKey();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => request(creator, key, ask(150_000))),
      );
      expect(new Set(results.map((r) => r.payout.id)).size).toBe(1);
      expect(results.filter((r) => !r.replay)).toHaveLength(1);
      expect(await rows(creator)).toHaveLength(1);
      expect(await balanceOf(creator)).toMatchObject({
        reservedIdr: 150_000,
        availableIdr: 100_000,
      });
    });
  });

  describe('HTTP', () => {
    // The limit is 5 requests per minute per creator, so each group of tests has its own creator.
    const post = (
      who: TestCreator | undefined,
      body: unknown,
      headers: Record<string, string> = { 'idempotency-key': newKey() },
      origin: string | null = WEB_ORIGIN,
    ) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/me/payouts',
        headers: { ...(origin ? { origin } : {}), ...headers },
        cookies: who ? { influency_session: who.token } : {},
        payload: body as object,
      });
    const errorCode = (res: { json: <T>() => T }) =>
      res.json<{ error: { code: string } }>().error.code;

    it('answers 201 with the payout, then 200 with the same one for a replay', async () => {
      const key = newKey();
      const created = await post(http, ask(100_000), { 'idempotency-key': key });
      expect(created.statusCode).toBe(201);
      expect(created.headers['cache-control']).toBe('no-store');
      const payout = payoutSchema.parse(created.json());
      expect(payout).toMatchObject({
        status: 'REQUESTED',
        amountIdr: 100_000,
        netIdr: 100_000 - FEE,
      });
      const replay = await post(http, ask(100_000), { 'idempotency-key': key });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toEqual(created.json());
    });

    it('409s the same key with a different payload', async () => {
      const key = newKey();
      await post(http, ask(100_000), { 'idempotency-key': key });
      const res = await post(http, ask(110_000), { 'idempotency-key': key });
      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe('DUPLICATE_REQUEST');
    });

    it('409s a fee that is not the shown one', async () => {
      const res = await post(http, ask(100_000, 1));
      expect(res.statusCode).toBe(409);
      expect(errorCode(res)).toBe('PAYOUT_FEE_CHANGED');
    });

    it('400s every malformed request and creates nothing', async () => {
      const cases: [string, unknown, Record<string, string> | undefined][] = [
        ['no Idempotency-Key', ask(100_000), {}],
        ['a malformed Idempotency-Key', ask(100_000), { 'idempotency-key': 'x' }],
        ['an amount below the minimum', { amountIdr: 99_999, expectedFeeIdr: FEE }, undefined],
        ['a fractional amount', { amountIdr: 100_000.5, expectedFeeIdr: FEE }, undefined],
        ['no fee', { amountIdr: 100_000 }, undefined],
        [
          'a client-chosen net',
          { amountIdr: 100_000, expectedFeeIdr: FEE, netIdr: 100_000 },
          undefined,
        ],
        [
          'a client-chosen status',
          { amountIdr: 100_000, expectedFeeIdr: FEE, status: 'PAID_OUT' },
          undefined,
        ],
        ['a string amount', { amountIdr: '100000', expectedFeeIdr: FEE }, undefined],
      ];
      for (const [i, [label, body, headers]] of cases.entries()) {
        // Alternate creators: 4 requests each, under the limit.
        const who = invalid[i % invalid.length]!;
        const res = await post(who, body, headers);
        expect(res.statusCode, label).toBe(400);
        expect(errorCode(res), label).toBe('VALIDATION_FAILED');
      }
      for (const who of invalid) expect(await rows(who)).toHaveLength(0);
    });

    it('401s a guest, 403s a non-creator and a cross-site or origin-less write', async () => {
      expect((await post(undefined, ask(100_000))).statusCode).toBe(401);
      const nonCreator = await post(plain, ask(100_000));
      expect(nonCreator.statusCode).toBe(403);
      expect(errorCode(nonCreator)).toBe('CREATOR_NOT_APPROVED');
      expect((await post(guards, ask(100_000), undefined, 'https://evil.example')).statusCode).toBe(
        403,
      );
      expect((await post(guards, ask(100_000), undefined, null)).statusCode).toBe(403);
      expect(await rows(guards)).toHaveLength(0);
    });

    it('rate-limits requests per creator', async () => {
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) codes.push((await post(limited, {}, {})).statusCode);
      expect(codes.slice(0, 5).every((c) => c === 400)).toBe(true);
      expect(codes.slice(5)).toEqual([429, 429]);
    });
  });
});
