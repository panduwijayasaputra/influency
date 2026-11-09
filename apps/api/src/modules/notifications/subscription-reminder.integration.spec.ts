import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { NotificationProducer } from './notification-producer.service.js';

const HOUR = 3_600_000;
const LEAD_HOURS = 72;
const PERIOD_MS = 30 * 24 * HOUR;

// Periods are append-only: fresh users and creators per test, nothing deleted (the DB is reset per run).
describe('subscription-ending reminders (US-072)', () => {
  const prisma = createTestPrisma();
  let app: NestFastifyApplication;
  let producer: NotificationProducer;

  beforeAll(async () => {
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .overrideProvider(ENV)
      .useValue(parseEnv({ ...process.env, SUBSCRIPTION_REMINDER_LEAD_HOURS: String(LEAD_HOURS) }))
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    producer = app.get(NotificationProducer);
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const fan = await prisma.user.create({ data: { displayName: 'Reminder fan' } });
    const owner = await prisma.user.create({ data: { displayName: 'Reminder creator' } });
    const profile = await prisma.creatorProfile.create({
      data: {
        userId: owner.id,
        slug: `reminder-${randomUUID().slice(0, 8)}`,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Reminder creator'),
      },
    });
    const plan = await prisma.creatorSubscriptionPlan.create({
      data: { creatorProfileId: profile.id, version: 1, priceCoins: 75n, active: true },
    });
    /** A 30-day period (CHECK subscription_periods_30_days) ending in `endsInHours`. */
    const period = (endsInHours: number) => {
      const endsAt = new Date(Date.now() + endsInHours * HOUR);
      return prisma.subscriptionPeriod.create({
        data: {
          userId: fan.id,
          creatorProfileId: profile.id,
          planId: plan.id,
          priceCoins: 75n,
          feeBps: 1500,
          durationDays: 30,
          startsAt: new Date(endsAt.getTime() - PERIOD_MS),
          endsAt,
        },
      });
    };
    return { fan, profile, period };
  }
  const reminders = (userId: string) =>
    prisma.notification.findMany({ where: { userId, type: 'SUBSCRIPTION_ENDING' } });

  it('reminds once for a period ending within the lead time', async () => {
    const { fan, profile, period } = await setup();
    const p = await period(LEAD_HOURS - 1);
    await producer.remindEndingSubscriptions();
    await producer.remindEndingSubscriptions();
    const rows = await reminders(fan.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      creatorProfileId: profile.id,
      sourceId: p.id,
      dedupeKey: `subscription-ending:${p.id}`,
      actorUserId: null,
    });
  });

  it('skips periods ending later or already ended', async () => {
    const { fan, period } = await setup();
    await period(LEAD_HOURS + 2);
    await producer.remindEndingSubscriptions();
    expect(await reminders(fan.id)).toEqual([]);
    const other = await setup();
    await other.period(-1);
    await producer.remindEndingSubscriptions();
    expect(await reminders(other.fan.id)).toEqual([]);
  });

  it('skips a period with a scheduled renewal, but not one whose renewal was cancelled', async () => {
    const { fan, period } = await setup();
    const current = await period(10);
    const renewal = await period(10 + 30 * 24); // starts when `current` ends
    await producer.remindEndingSubscriptions();
    expect(await reminders(fan.id)).toEqual([]);
    await prisma.subscriptionPeriod.update({
      where: { id: renewal.id },
      data: { canceledAt: new Date() },
    });
    await producer.remindEndingSubscriptions();
    expect((await reminders(fan.id)).map((r) => r.sourceId)).toEqual([current.id]);
  });

  it('respects the opt-out', async () => {
    const { fan, period } = await setup();
    await prisma.notificationPreference.create({
      data: { userId: fan.id, optOutTypes: ['SUBSCRIPTION_ENDING'] },
    });
    await period(5);
    await producer.remindEndingSubscriptions();
    expect(await reminders(fan.id)).toEqual([]);
  });
});
