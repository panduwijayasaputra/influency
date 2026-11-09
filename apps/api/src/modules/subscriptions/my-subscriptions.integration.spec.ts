import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  type MySubscriptionList,
  mySubscriptionListSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';

const RUN = randomUUID().slice(0, 8);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

// Periods and creators are append-only or referenced, so nothing is deleted: fresh rows per test.
describe('GET /me/subscriptions', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let n = 0;

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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function newCreator(over: { status?: 'APPROVED' | 'PENDING_REVIEW' } = {}) {
    const key = `${RUN}-${++n}`;
    const user = await prisma.user.create({ data: { displayName: `Subs creator ${key}` } });
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: user.id,
        slug: `subs-${key}`,
        status: over.status ?? 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields(`Subs ${key}`),
      },
    });
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: profile.id, version: 1, priceCoins: 75n, active: true },
    });
    return { profileId: profile.id, slug: profile.slug, planId: plan.id };
  }
  async function newFan() {
    const user = await prisma.user.create({ data: { displayName: 'Subs fan' } });
    const token = `subs-spec-${randomUUID()}`;
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: sha256hex(token),
        expiresAt: new Date(Date.now() + DAY),
      },
    });
    return { id: user.id, token };
  }
  type Creator = Awaited<ReturnType<typeof newCreator>>;
  type Fan = Awaited<ReturnType<typeof newFan>>;

  /** A 30-day period ending `endsInMs` from now (negative = already over). The DB requires ends = starts + 720 h. */
  function period(fan: Fan, creator: Creator, endsInMs: number, canceled = false) {
    const endsAt = new Date(Date.now() + endsInMs);
    return prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: creator.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt: new Date(endsAt.getTime() - 30 * DAY),
        endsAt,
        canceledAt: canceled ? new Date() : null,
      },
    });
  }
  /** The prepaid renewal: starts `startsInMs` from now. */
  function renewal(fan: Fan, creator: Creator, startsInMs: number, canceled = false) {
    const startsAt = new Date(Date.now() + startsInMs);
    return prisma.subscriptionPeriod.create({
      data: {
        userId: fan.id,
        creatorProfileId: creator.profileId,
        planId: creator.planId,
        priceCoins: 75n,
        feeBps: 1500,
        durationDays: 30,
        startsAt,
        endsAt: new Date(startsAt.getTime() + 30 * DAY),
        canceledAt: canceled ? new Date() : null,
      },
    });
  }
  const get = (fan?: Fan) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/me/subscriptions',
      cookies: fan ? { [SESSION_COOKIE]: fan.token } : {},
    });
  const list = async (fan: Fan): Promise<MySubscriptionList> => {
    const res = await get(fan);
    expect(res.statusCode).toBe(200);
    return mySubscriptionListSchema.parse(res.json());
  };

  it('requires a session and is never cached', async () => {
    expect((await get()).statusCode).toBe(401);
    expect((await get(await newFan())).headers['cache-control']).toBe('no-store');
  });

  it('is empty without a subscription', async () => {
    expect(await list(await newFan())).toEqual({ subscriptions: [] });
  });

  it('lists an active subscription with whole days left, rounded up', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, 12 * DAY - HOUR);
    const { subscriptions } = await list(fan);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      creator: { slug: creator.slug, avatarUrl: null, bannerUrl: null, bio: null },
      daysLeft: 12,
      hasScheduledRenewal: false,
    });
  });

  it.each([
    [2 * HOUR, 1],
    [DAY + 60_000, 2],
    [30 * DAY, 30],
  ])('shows %i ms left as %i day(s)', async (endsIn, expected) => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, endsIn);
    expect((await list(fan)).subscriptions[0]!.daysLeft).toBe(expected);
  });

  it('does not list an ended subscription or a cancelled one', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, -1000); // ended a second ago
    await period(fan, await newCreator(), 5 * DAY, true); // cancelled
    expect(await list(fan)).toEqual({ subscriptions: [] });
  });

  it('never lists a creator that only has a scheduled period', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await renewal(fan, creator, 2 * HOUR);
    expect(await list(fan)).toEqual({ subscriptions: [] });
  });

  it('flags a prepaid renewal and clears the flag when it is cancelled', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, 3 * DAY);
    const next = await renewal(fan, creator, 3 * DAY);
    expect((await list(fan)).subscriptions[0]).toMatchObject({
      daysLeft: 3,
      hasScheduledRenewal: true,
    });
    await prisma.subscriptionPeriod.update({
      where: { id: next.id },
      data: { canceledAt: new Date() },
    });
    expect((await list(fan)).subscriptions[0]!.hasScheduledRenewal).toBe(false);
  });

  it('lists independent subscriptions of several creators, soonest to expire first', async () => {
    const [a, b, c] = [await newCreator(), await newCreator(), await newCreator()];
    const fan = await newFan();
    await period(fan, a, 20 * DAY);
    await period(fan, b, 2 * DAY);
    await period(fan, c, 9 * DAY);
    expect((await list(fan)).subscriptions.map((s) => s.creator.slug)).toEqual([
      b.slug,
      c.slug,
      a.slug,
    ]);
  });

  it("never shows another user's subscriptions", async () => {
    const creator = await newCreator();
    const [mine, theirs] = [await newFan(), await newFan()];
    await period(theirs, creator, 5 * DAY);
    expect(await list(mine)).toEqual({ subscriptions: [] });
    expect((await list(theirs)).subscriptions).toHaveLength(1);
  });

  it('leaves out a creator that is not public', async () => {
    const hidden = await newCreator({ status: 'PENDING_REVIEW' });
    const fan = await newFan();
    await period(fan, hidden, 5 * DAY);
    expect(await list(fan)).toEqual({ subscriptions: [] });
  });

  it('returns only the public creator shape and dates, no prices or counts', async () => {
    const creator = await newCreator();
    const fan = await newFan();
    await period(fan, creator, 5 * DAY);
    const [s] = (await get(fan)).json<{ subscriptions: Record<string, unknown>[] }>().subscriptions;
    expect(Object.keys(s!).sort()).toEqual([
      'creator',
      'daysLeft',
      'endsAt',
      'hasScheduledRenewal',
    ]);
    expect(Object.keys(s!.creator as object).sort()).toEqual([
      'avatarUrl',
      'bannerUrl',
      'bio',
      'displayName',
      'slug',
    ]);
  });
});
