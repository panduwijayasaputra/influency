import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  creatorApplicationResponseSchema,
  errorResponseSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const ORIGIN = 'http://localhost:3000';
const RUN = randomUUID().slice(0, 6);

// Plans are append-only and creators referenced by them can't be deleted, so every test uses fresh rows.
describe('creator application: subscription price and the plan on approval', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let admin: { id: string; token: string };
  let n = 0;

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
    admin = await newUser('Plan spec admin');
    await prisma.userRole.create({ data: { userId: admin.id, role: 'ADMIN' } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newUser(displayName = 'Plan spec applicant') {
    const user = await prisma.user.create({ data: { displayName } });
    const token = `plan-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + 864e5),
      },
    });
    return { id: user.id, token };
  }
  const apply = (token: string, payload: object) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/creators/apply',
      cookies: { [SESSION_COOKIE]: token },
      headers: { origin: ORIGIN },
      payload,
    });
  const body = (price?: number) => ({
    displayName: 'Plan Creator',
    slug: `plan-${RUN}-${++n}`,
    acceptAgreement: true,
    ...(price === undefined ? {} : { subscriptionPriceCoins: price }),
  });
  const decide = (profileId: string, action: 'approve' | 'reject', payload?: object) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/admin/creators/${profileId}/${action}`,
      cookies: { [SESSION_COOKIE]: admin.token },
      headers: { origin: ORIGIN },
      ...(payload && { payload }),
    });
  const profileOf = (userId: string) =>
    prisma.creatorProfile.findUniqueOrThrow({ where: { userId } });
  const plans = (profileId: string) =>
    prisma.creatorSubscriptionPlan.findMany({ where: { creatorProfileId: profileId } });
  /** Applies, then pushes the profile to the far past so ranked public lists in other specs are unaffected. */
  async function applicant(price?: number) {
    const u = await newUser();
    const res = await apply(u.token, body(price));
    expect(res.statusCode).toBe(201);
    const profile = await profileOf(u.id);
    await prisma.creatorProfile.update({
      where: { id: profile.id },
      data: { createdAt: LEFTOVER_CREATED_AT },
    });
    return { ...u, profileId: profile.id, slug: profile.slug, res };
  }

  it.each([9, 5001, 10.5, 0])('rejects a price of %s with 400 on the field', async (price) => {
    const u = await newUser();
    const res = await apply(u.token, body(price));
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(errorResponseSchema.parse(res.json()).error.details)).toContain(
      'subscriptionPriceCoins',
    );
    expect(await prisma.creatorProfile.count({ where: { userId: u.id } })).toBe(0);
  });

  it.each([10, 5000])('stores and returns a price of %i', async (price) => {
    const a = await applicant(price);
    expect(creatorApplicationResponseSchema.parse(a.res.json()).subscriptionPriceCoins).toBe(price);
    expect((await profileOf(a.id)).requestedPlanPriceCoins).toBe(BigInt(price));
    const mine = await app.inject({
      method: 'GET',
      url: '/api/v1/creators/me/application',
      cookies: { [SESSION_COOKIE]: a.token },
    });
    expect(
      mine.json<{ application: { subscriptionPriceCoins: number } }>().application
        .subscriptionPriceCoins,
    ).toBe(price);
  });

  it('stores null when no price is sent', async () => {
    const a = await applicant();
    expect(
      a.res.json<{ subscriptionPriceCoins: number | null }>().subscriptionPriceCoins,
    ).toBeNull();
  });

  it('the database refuses a price outside 10–5000 even without the API', async () => {
    const a = await applicant(50);
    await expect(
      prisma.$executeRaw`UPDATE creator_profiles SET requested_plan_price_coins = 9 WHERE id = ${a.profileId}::uuid`,
    ).rejects.toThrow();
  });

  it('creates no plan while pending, and nobody can subscribe to a pending applicant', async () => {
    const a = await applicant(80);
    expect(await plans(a.profileId)).toHaveLength(0);
    const state = await app.inject({
      method: 'GET',
      url: `/api/v1/creators/${a.slug}/subscription`,
    });
    expect(state.statusCode).toBe(404);
  });

  it('creates exactly one active version-1 plan at the chosen price on approval', async () => {
    const a = await applicant(80);
    expect((await decide(a.profileId, 'approve')).statusCode).toBe(200);
    const rows = await plans(a.profileId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ version: 1, priceCoins: 80n, active: true });
    const state = await app.inject({
      method: 'GET',
      url: `/api/v1/creators/${a.slug}/subscription`,
    });
    expect(state.json<{ plan: unknown }>().plan).toEqual({ priceCoins: 80, durationDays: 30 });
  });

  it('approves without a price and creates no plan', async () => {
    const a = await applicant();
    expect((await decide(a.profileId, 'approve')).statusCode).toBe(200);
    expect(await plans(a.profileId)).toHaveLength(0);
  });

  it('a second approval is refused and still leaves one plan', async () => {
    const a = await applicant(60);
    await decide(a.profileId, 'approve');
    const again = await decide(a.profileId, 'approve');
    expect(again.statusCode).toBe(409);
    expect(await plans(a.profileId)).toHaveLength(1);
  });

  it('concurrent approvals: one wins, one plan', async () => {
    const a = await applicant(90);
    const results = await Promise.all([
      decide(a.profileId, 'approve'),
      decide(a.profileId, 'approve'),
    ]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    expect(await plans(a.profileId)).toHaveLength(1);
  });

  it('rejection creates no plan; a resubmit changes the price; approval uses the latest', async () => {
    const a = await applicant(40);
    expect((await decide(a.profileId, 'reject', { reason: 'Perbaiki' })).statusCode).toBe(200);
    expect(await plans(a.profileId)).toHaveLength(0);
    const again = await apply(a.token, { ...body(150), slug: a.slug });
    expect(again.statusCode).toBe(201);
    expect(again.json<{ subscriptionPriceCoins: number }>().subscriptionPriceCoins).toBe(150);
    await decide(a.profileId, 'approve');
    expect((await plans(a.profileId))[0]!.priceCoins).toBe(150n);
  });

  it('later price changes by the creator add a version without touching version 1', async () => {
    const a = await applicant(70);
    await decide(a.profileId, 'approve');
    const put = await app.inject({
      method: 'PUT',
      url: '/api/v1/creators/me/subscription-plan',
      cookies: { [SESSION_COOKIE]: a.token },
      headers: { origin: ORIGIN },
      payload: { priceCoins: 100, active: true },
    });
    expect(put.statusCode).toBe(200);
    const rows = (await plans(a.profileId)).sort((x, y) => x.version - y.version);
    expect(rows.map((r) => [r.version, r.priceCoins])).toEqual([
      [1, 70n],
      [2, 100n],
    ]);
  });
});
