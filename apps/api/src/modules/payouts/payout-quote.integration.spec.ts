import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { payoutQuoteSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { payoutFixtures, type TestCreator } from '../../../test/payout-fixtures.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { PayoutsService } from './payouts.service.js';

// Tests run with the default fee config: Rp2.500, not confirmed (PAYOUT_TRANSFER_FEE_* are not set in vitest.config.ts).
const FEE = 2_500;

describe('GET /api/v1/me/payouts/quote', () => {
  const prisma = createTestPrisma();
  const { newUser, newCreator, earn, addAccount } = payoutFixtures(prisma);
  let app: NestFastifyApplication;
  let payouts: PayoutsService;
  // Sessions are created once, here: the auth spec counts sessions across a request.
  let http: TestCreator;
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
    http = await newCreator(true);
    plain = await newUser(true);
    await earn(http, 250_000);
    await addAccount(http);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const get = (who: TestCreator | undefined, query: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/me/payouts/quote${query}`,
      cookies: who ? { influency_session: who.token } : {},
    });
  /** A creator with Rp250.000 available and one active account. */
  async function funded(available = 250_000) {
    const creator = await newCreator();
    await earn(creator, available);
    await addAccount(creator);
    return creator;
  }

  describe('service', () => {
    it('quotes the configured fee, the net amount and the masked destination', async () => {
      const creator = await funded();
      const quote = payoutQuoteSchema.parse(await payouts.quote(creator.creatorProfileId, 120_000));
      expect(quote).toEqual({
        amountIdr: 120_000,
        feeIdr: FEE,
        netIdr: 120_000 - FEE,
        feeIsPlaceholder: true,
        availableIdr: 250_000,
        destination: {
          bankCode: 'BCA',
          bankName: 'BCA',
          last4: '4821',
          holderName: 'Nadia Kirana',
        },
      });
    });

    it('allows exactly the available amount and refuses one rupiah more, naming the balance', async () => {
      const creator = await funded();
      await expect(payouts.quote(creator.creatorProfileId, 250_000)).resolves.toMatchObject({
        netIdr: 250_000 - FEE,
      });
      await expect(payouts.quote(creator.creatorProfileId, 250_001)).rejects.toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
        details: { availableIdr: 250_000 },
      });
    });

    it('needs an active account', async () => {
      const creator = await newCreator();
      await earn(creator, 250_000);
      await expect(payouts.quote(creator.creatorProfileId, 120_000)).rejects.toMatchObject({
        code: 'PAYOUT_ACCOUNT_REQUIRED',
      });
      await addAccount(creator, { active: false });
      await expect(payouts.quote(creator.creatorProfileId, 120_000)).rejects.toMatchObject({
        code: 'PAYOUT_ACCOUNT_REQUIRED',
      });
    });

    it('does not count pending earnings as available', async () => {
      const creator = await newCreator();
      await earn(creator, 250_000, 1); // accrued yesterday: pending for another 13 days
      await addAccount(creator);
      await expect(payouts.quote(creator.creatorProfileId, 100_000)).rejects.toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
        details: { availableIdr: 0 },
      });
    });

    it('is a preview: it reserves nothing and writes nothing', async () => {
      const creator = await funded();
      await payouts.quote(creator.creatorProfileId, 120_000);
      expect(
        await prisma.creatorPayout.count({ where: { creatorProfileId: creator.creatorProfileId } }),
      ).toBe(0);
      await expect(payouts.quote(creator.creatorProfileId, 250_000)).resolves.toBeDefined();
    });

    it("takes another creator's reservations out of nothing: each creator has their own balance", async () => {
      const mine = await funded(100_000);
      const theirs = await funded(250_000);
      await expect(payouts.quote(mine.creatorProfileId, 250_000)).rejects.toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
      });
      await expect(payouts.quote(theirs.creatorProfileId, 250_000)).resolves.toBeDefined();
    });

    it('subtracts what an earlier payout already reserved', async () => {
      const creator = await funded();
      const account = await prisma.creatorPayoutAccount.findFirstOrThrow({
        where: { creatorProfileId: creator.creatorProfileId },
      });
      await prisma.creatorPayout.create({
        data: {
          creatorProfileId: creator.creatorProfileId,
          payoutAccountId: account.id,
          bankCode: 'BCA',
          accountLast4: '4821',
          holderName: 'Nadia Kirana',
          amountIdr: 150_000n,
          feeIdr: 2_500n,
          netIdr: 147_500n,
          feeIsPlaceholder: true,
          requestedByUserId: creator.userId,
        },
      });
      await expect(payouts.quote(creator.creatorProfileId, 100_001)).rejects.toMatchObject({
        details: { availableIdr: 100_000 },
      });
      await expect(payouts.quote(creator.creatorProfileId, 100_000)).resolves.toBeDefined();
    });
  });

  describe('HTTP', () => {
    it('answers the quote, uncached', async () => {
      const res = await get(http, '?amountIdr=120000');
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(payoutQuoteSchema.parse(res.json())).toMatchObject({
        amountIdr: 120_000,
        feeIdr: FEE,
        netIdr: 117_500,
        feeIsPlaceholder: true,
      });
    });

    it('never takes the fee from the client', async () => {
      const res = await get(http, '?amountIdr=120000&feeIdr=0&netIdr=120000');
      expect(res.statusCode).toBe(200);
      expect(res.json<{ feeIdr: number }>().feeIdr).toBe(FEE);
    });

    it.each([
      ['below the minimum', '?amountIdr=99999'],
      ['a fraction', '?amountIdr=150000.5'],
      ['not a number', '?amountIdr=abc'],
      ['missing', ''],
      ['empty', '?amountIdr='],
      ['negative', '?amountIdr=-100000'],
    ])('400s an amount that is %s', async (_label, query) => {
      const res = await get(http, query);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
    });

    it('409s an amount above the balance, with the balance in the details', async () => {
      const res = await get(http, '?amountIdr=250001');
      expect(res.statusCode).toBe(409);
      expect(
        res.json<{ error: { code: string; details: { availableIdr: number } } }>().error,
      ).toMatchObject({
        code: 'PAYOUT_EXCEEDS_AVAILABLE',
        details: { availableIdr: 250_000 },
      });
    });

    it('401s a guest and 403s a non-creator', async () => {
      expect((await get(undefined, '?amountIdr=120000')).statusCode).toBe(401);
      const res = await get(plain, '?amountIdr=120000');
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('CREATOR_NOT_APPROVED');
    });
  });
});
