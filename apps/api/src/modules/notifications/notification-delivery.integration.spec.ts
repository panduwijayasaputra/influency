import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createFakeTelegramBot } from '../../../test/fake-telegram-bot.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_BOT } from '../../common/telegram-bot.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';
import { NotificationProducer } from './notification-producer.service.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  ana: '0190a000-0000-7000-8000-000000740101',
  creator: '0190a000-0000-7000-8000-000000740102',
} as const;
const CHAT = 7401001n;
const MAX_ATTEMPTS = 3;
const ORIGIN = 'http://localhost:3000';

describe('Telegram delivery (US-074)', () => {
  const prisma = createTestPrisma();
  const fakeBot = createFakeTelegramBot();
  let app: NestFastifyApplication;
  let delivery: NotificationDeliveryService;
  let producer: NotificationProducer;
  let creatorProfileId = '';
  let postId = '';
  let n = 0;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        { id: USERS.ana, displayName: 'Ana Delivery' },
        { id: USERS.creator, displayName: 'Nadia Delivery' },
      ],
    });
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: 'notif-delivery-spec',
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT, // ranked last in GET /creators/recommended (parallel specs)
          ...profileFields('Nadia Delivery'),
        },
      })
    ).id;
    postId = (
      await prisma.post.create({
        data: {
          creatorProfileId,
          visibility: 'FREE',
          status: 'PUBLISHED',
          caption: 'SECRET-CAPTION',
          publishedAt: new Date(),
        },
      })
    ).id;
    const fake = await createFakeTelegram();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TELEGRAM_OIDC_CLIENT)
      .useValue(fake.client())
      .overrideProvider(OBJECT_STORAGE)
      .useValue(createMemoryStorage().storage)
      .overrideProvider(ENV)
      .useValue(
        parseEnv({
          ...process.env,
          WEB_ORIGIN: ORIGIN,
          TELEGRAM_BOT_TOKEN: '123456:delivery-spec',
          TELEGRAM_BOT_USERNAME: 'InfluencyTestBot',
          TELEGRAM_BOT_WEBHOOK_SECRET: 'delivery-secret',
          NOTIFICATION_MAX_ATTEMPTS: String(MAX_ATTEMPTS),
        }),
      )
      .overrideProvider(TELEGRAM_BOT)
      .useValue(fakeBot.bot)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    delivery = app.get(NotificationDeliveryService);
    producer = app.get(NotificationProducer);
  });

  beforeEach(async () => {
    fakeBot.sent.length = 0;
    fakeBot.next.length = 0;
    await prisma.notification.deleteMany({ where: { userId: USERS.ana } }); // jobs cascade
    await prisma.notificationPreference.deleteMany({ where: { userId: USERS.ana } });
    await prisma.notificationPreference.create({
      data: { userId: USERS.ana, telegramAllowed: true, telegramChat: CHAT },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.post.deleteMany({ where: { creatorProfileId } });
    await prisma.creatorProfile.deleteMany({ where: { id: creatorProfileId } });
    await prisma.user.deleteMany({ where: { id: { in: Object.values(USERS) } } });
    await prisma.$disconnect();
  });

  /** Queues one NEW_POST notification (with its job) for Ana. */
  const queue = () =>
    producer.notify({
      userId: USERS.ana,
      type: 'NEW_POST',
      dedupeKey: `delivery:${++n}`,
      actorUserId: USERS.creator,
      creatorProfileId,
      postId,
    });
  const job = async () => {
    const jobs = await prisma.notificationJob.findMany({
      where: { notification: { userId: USERS.ana } },
    });
    expect(jobs).toHaveLength(1);
    return jobs[0]!;
  };
  /** Makes the job due now (the producer and retries schedule it for later). */
  const makeDue = (id: string) =>
    prisma.notificationJob.update({
      where: { id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });

  it('sends the summary with an absolute website link, never the caption', async () => {
    await queue();
    expect(await delivery.deliverDue()).toBeGreaterThanOrEqual(1);
    expect(fakeBot.sent).toEqual([
      {
        chat: CHAT,
        text: `Nadia Delivery memposting konten baru.\n${ORIGIN}/notif-delivery-spec/posts/${postId}`,
      },
    ]);
    expect(fakeBot.sent.map((m) => m.text).join(' ')).not.toContain('SECRET-CAPTION');
    const sent = await job();
    expect(sent).toMatchObject({ status: 'SENT', attempts: 1 });
    expect(sent.sentAt).not.toBeNull();
    // The inbox row is untouched (still unread).
    expect(
      (await prisma.notification.findFirstOrThrow({ where: { userId: USERS.ana } })).readAt,
    ).toBeNull();
  });

  it('stops for good on a blocked bot (403) and skips the next messages', async () => {
    fakeBot.next.push({ ok: false, permanent: true, code: '403:Forbidden: bot was blocked' });
    await queue();
    await delivery.deliverDue();
    expect(await job()).toMatchObject({
      status: 'FAILED',
      lastError: '403:Forbidden: bot was blocked',
    });
    expect(
      (await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: USERS.ana } }))
        .telegramAllowed,
    ).toBe(false);
    // Allowed is now false, so no new job is queued at all.
    await queue();
    expect(
      await prisma.notificationJob.count({ where: { notification: { userId: USERS.ana } } }),
    ).toBe(1);
  });

  it('skips a queued job when the user turned Telegram off meanwhile', async () => {
    await queue();
    await prisma.notificationPreference.update({
      where: { userId: USERS.ana },
      data: { telegramAllowed: false },
    });
    await delivery.deliverDue();
    expect(fakeBot.sent).toEqual([]);
    expect((await job()).status).toBe('SKIPPED');
  });

  it('retries with backoff, honours retry_after, and gives up after the cap', async () => {
    await queue();
    const id = (await job()).id;
    fakeBot.next.push({ ok: false, permanent: false, code: '500:' });
    await delivery.deliverDue();
    let row = await job();
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, lastError: '500:' });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 20_000);

    // Not due yet: nothing is sent.
    await delivery.deliverDue();
    expect(fakeBot.sent).toHaveLength(1);

    await makeDue(id);
    fakeBot.next.push({ ok: false, permanent: false, retryAfterSeconds: 7, code: '429:' });
    await delivery.deliverDue();
    row = await job();
    const wait = row.nextAttemptAt.getTime() - Date.now();
    expect(wait).toBeGreaterThan(5_000);
    expect(wait).toBeLessThan(9_000);

    await makeDue(id);
    fakeBot.next.push({ ok: false, permanent: false, code: '502:' });
    await delivery.deliverDue();
    expect(await job()).toMatchObject({ status: 'FAILED', attempts: MAX_ATTEMPTS });
  });

  it('sends each job exactly once under concurrent workers', async () => {
    for (let i = 0; i < 5; i++) await queue();
    await Promise.all([delivery.deliverDue(), delivery.deliverDue(), delivery.deliverDue()]);
    expect(fakeBot.sent).toHaveLength(5);
    expect(
      await prisma.notificationJob.count({
        where: { notification: { userId: USERS.ana }, status: 'SENT' },
      }),
    ).toBe(5);
  });
});
