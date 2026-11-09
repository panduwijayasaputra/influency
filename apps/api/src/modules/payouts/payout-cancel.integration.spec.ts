import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { payoutPageSchema, payoutSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { payoutFixtures, type TestCreator } from '../../../test/payout-fixtures.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { WALLET_PAGE_SIZE } from '../wallets/wallets.service.js';
import { EarningsService } from './earnings.service.js';
import { PayoutsService } from './payouts.service.js';

const WEB_ORIGIN = 'http://localhost:3000';
const FEE = 2_500;
const UNKNOWN_ID = '0190a000-0000-7000-8000-00000000dead';

describe('payout history and cancel', () => {
  const prisma = createTestPrisma();
  const { newUser, newCreator, earn, addAccount } = payoutFixtures(prisma);
  let app: NestFastifyApplication;
  let payouts: PayoutsService;
  let earnings: EarningsService;
  // Sessions are created once, here: the auth spec counts sessions across a request.
  let http: TestCreator;
  let other: TestCreator;
  let guards: TestCreator;
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
    [http, other, guards] = await Promise.all([
      newCreator(true),
      newCreator(true),
      newCreator(true),
    ]);
    plain = await newUser(true);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  /** A creator with `available` matured rupiah and an active account. */
  async function funded(available = 250_000) {
    const creator = await newCreator();
    await earn(creator, available);
    const account = await addAccount(creator);
    return { creator, account };
  }
  /** A REQUESTED payout inserted directly (a few per test, in one statement order, newest last). */
  async function requested(creator: TestCreator, accountId: string, amountIdr: number) {
    return prisma.creatorPayout.create({
      data: {
        creatorProfileId: creator.creatorProfileId,
        payoutAccountId: accountId,
        bankCode: 'BCA',
        accountLast4: '4821',
        holderName: 'Nadia Kirana',
        amountIdr: BigInt(amountIdr),
        feeIdr: BigInt(FEE),
        netIdr: BigInt(amountIdr - FEE),
        feeIsPlaceholder: true,
        requestedByUserId: creator.userId,
      },
    });
  }
  const balanceOf = (c: TestCreator) => earnings.balance(c.creatorProfileId);
  const changes = (payoutId: string) =>
    prisma.creatorPayoutStatusChange.findMany({
      where: { payoutId },
      orderBy: { createdAt: 'asc' },
    });

  describe('list', () => {
    it('shows only my payouts, newest first, with the snapshot destination', async () => {
      const mine = await funded(1_000_000);
      const theirs = await funded(1_000_000);
      const first = await requested(mine.creator, mine.account.id, 100_000);
      await new Promise((r) => setTimeout(r, 5));
      const second = await requested(mine.creator, mine.account.id, 110_000);
      await requested(theirs.creator, theirs.account.id, 120_000);
      const page = payoutPageSchema.parse(await payouts.list(mine.creator.creatorProfileId));
      expect(page.items.map((p) => p.id)).toEqual([second.id, first.id]);
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]).toMatchObject({
        amountIdr: 110_000,
        feeIdr: FEE,
        netIdr: 110_000 - FEE,
        status: 'REQUESTED',
        destination: {
          bankCode: 'BCA',
          bankName: 'BCA',
          last4: '4821',
          holderName: 'Nadia Kirana',
        },
      });
      expect(JSON.stringify(page)).not.toContain(theirs.creator.creatorProfileId);
    });

    it(`pages ${WALLET_PAGE_SIZE} at a time without gaps or repeats`, async () => {
      const { creator, account } = await funded(10_000_000);
      for (let i = 0; i < WALLET_PAGE_SIZE + 5; i++) {
        await requested(creator, account.id, 100_000 + i * 1000);
      }
      const first = payoutPageSchema.parse(await payouts.list(creator.creatorProfileId));
      expect(first.items).toHaveLength(WALLET_PAGE_SIZE);
      expect(first.nextCursor).toMatch(/^\d+_[0-9a-f-]{36}$/);
      const second = payoutPageSchema.parse(
        await payouts.list(creator.creatorProfileId, first.nextCursor!),
      );
      expect(second.items).toHaveLength(5);
      expect(second.nextCursor).toBeNull();
      const all = [...first.items, ...second.items];
      expect(new Set(all.map((p) => p.id)).size).toBe(WALLET_PAGE_SIZE + 5);
      // Newest first across both pages.
      const times = all.map((p) => Date.parse(p.requestedAt));
      expect(times).toEqual([...times].sort((a, b) => b - a));
    });

    it('is empty for a creator with no payouts', async () => {
      const creator = await newCreator();
      expect(await payouts.list(creator.creatorProfileId)).toEqual({ items: [], nextCursor: null });
    });
  });

  describe('cancel', () => {
    it('cancels a REQUESTED payout, releases the reservation and records who did it', async () => {
      const { creator, account } = await funded(250_000);
      const { payout } = await payouts.request(
        creator.userId,
        creator.creatorProfileId,
        'cancel-key-0001',
        {
          amountIdr: 150_000,
          expectedFeeIdr: FEE,
        },
      );
      expect(await balanceOf(creator)).toMatchObject({
        availableIdr: 100_000,
        reservedIdr: 150_000,
      });
      const canceled = await payouts.cancel(creator.userId, creator.creatorProfileId, payout.id);
      expect(payoutSchema.parse(canceled)).toMatchObject({ id: payout.id, status: 'CANCELED' });
      expect(await balanceOf(creator)).toMatchObject({ availableIdr: 250_000, reservedIdr: 0 });
      const trail = await changes(payout.id);
      expect(trail.map((c) => [c.fromStatus, c.toStatus])).toEqual([
        [null, 'REQUESTED'],
        ['REQUESTED', 'CANCELED'],
      ]);
      expect(trail[1]!.actorUserId).toBe(creator.userId);
      expect(account.id).toBeTruthy();
    });

    it('makes the released amount requestable again', async () => {
      const { creator } = await funded(250_000);
      const first = await payouts.request(
        creator.userId,
        creator.creatorProfileId,
        'cancel-key-0002',
        {
          amountIdr: 250_000,
          expectedFeeIdr: FEE,
        },
      );
      await expect(
        payouts.request(creator.userId, creator.creatorProfileId, 'cancel-key-0003', {
          amountIdr: 100_000,
          expectedFeeIdr: FEE,
        }),
      ).rejects.toMatchObject({ code: 'PAYOUT_EXCEEDS_AVAILABLE' });
      await payouts.cancel(creator.userId, creator.creatorProfileId, first.payout.id);
      await expect(
        payouts.request(creator.userId, creator.creatorProfileId, 'cancel-key-0004', {
          amountIdr: 250_000,
          expectedFeeIdr: FEE,
        }),
      ).resolves.toMatchObject({ replay: false });
    });

    it('refuses a second cancel and releases the reservation only once', async () => {
      const { creator } = await funded(250_000);
      const { payout } = await payouts.request(
        creator.userId,
        creator.creatorProfileId,
        'cancel-key-0005',
        {
          amountIdr: 150_000,
          expectedFeeIdr: FEE,
        },
      );
      await payouts.cancel(creator.userId, creator.creatorProfileId, payout.id);
      await expect(
        payouts.cancel(creator.userId, creator.creatorProfileId, payout.id),
      ).rejects.toMatchObject({ code: 'PAYOUT_NOT_CANCELABLE' });
      expect(await changes(payout.id)).toHaveLength(2);
      expect(await balanceOf(creator)).toMatchObject({ availableIdr: 250_000, reservedIdr: 0 });
    });

    it('releases the reservation at most once when cancels race', async () => {
      const { creator } = await funded(250_000);
      const { payout } = await payouts.request(
        creator.userId,
        creator.creatorProfileId,
        'cancel-key-0006',
        {
          amountIdr: 150_000,
          expectedFeeIdr: FEE,
        },
      );
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          payouts.cancel(creator.userId, creator.creatorProfileId, payout.id),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      for (const r of results.filter((r) => r.status === 'rejected')) {
        expect(r.reason).toMatchObject({ code: 'PAYOUT_NOT_CANCELABLE' });
      }
      expect((await changes(payout.id)).filter((c) => c.toStatus === 'CANCELED')).toHaveLength(1);
      // Released once: the balance is the matured amount, not more.
      expect(await balanceOf(creator)).toMatchObject({ availableIdr: 250_000, reservedIdr: 0 });
    });

    it('stays consistent when a cancel races a new request for the same money', async () => {
      const { creator } = await funded(250_000);
      const { payout } = await payouts.request(
        creator.userId,
        creator.creatorProfileId,
        'cancel-key-0007',
        {
          amountIdr: 250_000,
          expectedFeeIdr: FEE,
        },
      );
      const [cancel, again] = await Promise.allSettled([
        payouts.cancel(creator.userId, creator.creatorProfileId, payout.id),
        payouts.request(creator.userId, creator.creatorProfileId, 'cancel-key-0008', {
          amountIdr: 250_000,
          expectedFeeIdr: FEE,
        }),
      ]);
      expect(cancel.status).toBe('fulfilled');
      // Either order is fine, but the money is never reserved twice.
      const balance = await balanceOf(creator);
      expect(balance.reservedIdr).toBeLessThanOrEqual(250_000);
      expect(balance.availableIdr + balance.reservedIdr).toBe(250_000);
      if (again.status === 'rejected') {
        expect(again.reason).toMatchObject({ code: 'PAYOUT_EXCEEDS_AVAILABLE' });
      }
    });

    it.each(['PAID_OUT', 'REJECTED'] as const)(
      'cannot cancel a payout that is already %s (decided by an admin)',
      async (final) => {
        const { creator, account } = await funded(250_000);
        const row = await requested(creator, account.id, 150_000);
        await prisma.creatorPayout.update({ where: { id: row.id }, data: { status: final } });
        await expect(
          payouts.cancel(creator.userId, creator.creatorProfileId, row.id),
        ).rejects.toMatchObject({ code: 'PAYOUT_NOT_CANCELABLE' });
        expect(
          (await prisma.creatorPayout.findUniqueOrThrow({ where: { id: row.id } })).status,
        ).toBe(final);
      },
    );

    it("404s another creator's payout and leaves it alone", async () => {
      const mine = await funded();
      const theirs = await funded();
      const row = await requested(theirs.creator, theirs.account.id, 100_000);
      await expect(
        payouts.cancel(mine.creator.userId, mine.creator.creatorProfileId, row.id),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect((await prisma.creatorPayout.findUniqueOrThrow({ where: { id: row.id } })).status).toBe(
        'REQUESTED',
      );
    });

    it('404s an unknown payout', async () => {
      const { creator } = await funded();
      await expect(
        payouts.cancel(creator.userId, creator.creatorProfileId, UNKNOWN_ID),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });
  });

  describe('HTTP', () => {
    const call = (
      who: TestCreator | undefined,
      method: 'GET' | 'POST',
      url: string,
      origin: string | null = WEB_ORIGIN,
    ) =>
      app.inject({
        method,
        url: `/api/v1/me/payouts${url}`,
        headers: origin && method !== 'GET' ? { origin } : {},
        cookies: who ? { influency_session: who.token } : {},
      });
    const errorCode = (res: { json: <T>() => T }) =>
      res.json<{ error: { code: string } }>().error.code;

    it('lists my payouts and cancels one, answering with the payout', async () => {
      await earn(http, 500_000);
      const account = await addAccount(http);
      const row = await requested(http, account.id, 100_000);

      const listed = await call(http, 'GET', '');
      expect(listed.statusCode).toBe(200);
      expect(listed.headers['cache-control']).toBe('no-store');
      expect(payoutPageSchema.parse(listed.json()).items.map((p) => p.id)).toContain(row.id);

      const canceled = await call(http, 'POST', `/${row.id}/cancel`);
      expect(canceled.statusCode).toBe(200);
      expect(canceled.headers['cache-control']).toBe('no-store');
      expect(payoutSchema.parse(canceled.json())).toMatchObject({ id: row.id, status: 'CANCELED' });

      const again = await call(http, 'POST', `/${row.id}/cancel`);
      expect(again.statusCode).toBe(409);
      expect(errorCode(again)).toBe('PAYOUT_NOT_CANCELABLE');
    });

    it("404s another creator's payout, 404s an unknown one and 400s a malformed id", async () => {
      const account = await addAccount(other);
      await earn(other, 500_000);
      const theirs = await requested(other, account.id, 100_000);
      expect((await call(http, 'POST', `/${theirs.id}/cancel`)).statusCode).toBe(404);
      expect((await call(http, 'POST', `/${UNKNOWN_ID}/cancel`)).statusCode).toBe(404);
      expect((await call(http, 'POST', '/nope/cancel')).statusCode).toBe(400);
      expect(
        (await prisma.creatorPayout.findUniqueOrThrow({ where: { id: theirs.id } })).status,
      ).toBe('REQUESTED');
    });

    it.each([
      ['a malformed cursor', '?cursor=nope'],
      ['a cursor with a bad id', '?cursor=123_not-a-uuid'],
      ['an empty cursor', '?cursor='],
    ])('400s %s', async (_label, query) => {
      const res = await call(guards, 'GET', query);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe('VALIDATION_FAILED');
    });

    it('401s a guest, 403s a non-creator, and 403s a cross-site or origin-less cancel', async () => {
      expect((await call(undefined, 'GET', '')).statusCode).toBe(401);
      expect((await call(undefined, 'POST', `/${UNKNOWN_ID}/cancel`)).statusCode).toBe(401);
      const nonCreator = await call(plain, 'GET', '');
      expect(nonCreator.statusCode).toBe(403);
      expect(errorCode(nonCreator)).toBe('CREATOR_NOT_APPROVED');
      expect(
        (await call(guards, 'POST', `/${UNKNOWN_ID}/cancel`, 'https://evil.example')).statusCode,
      ).toBe(403);
      expect((await call(guards, 'POST', `/${UNKNOWN_ID}/cancel`, null)).statusCode).toBe(403);
    });
  });
});
