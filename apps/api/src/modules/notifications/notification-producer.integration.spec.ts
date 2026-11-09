import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { NotificationProducer } from './notification-producer.service.js';
import { DEFAULT_OPT_OUT_TYPES } from './notification-types.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  ana: '0190a000-0000-7000-8000-000000720001',
  budi: '0190a000-0000-7000-8000-000000720002',
  creator: '0190a000-0000-7000-8000-000000720003',
  suspended: '0190a000-0000-7000-8000-000000720004',
  optedOut: '0190a000-0000-7000-8000-000000720005',
} as const;
const MISSING_POST = '0190a000-0000-7000-8000-0000007200ff';
const WINDOW_MIN = 60;

async function boot() {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, NEW_POST_NOTIFY_WINDOW_MINUTES: String(WINDOW_MIN) }))
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  return app;
}

describe('NotificationProducer (US-072)', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;
  let producer: NotificationProducer;
  let db: PrismaService;
  let creatorProfileId = '';
  let postId = '';

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({
        id,
        displayName: `Producer ${name}`,
        status: name === 'suspended' ? ('SUSPENDED' as const) : ('ACTIVE' as const),
      })),
    });
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: 'notif-producer-spec',
          // Not APPROVED: with 3 followers it would outrank other specs' creators in GET /creators/recommended.
          // The fan-out only reads creator_follows, so the status doesn't matter here.
          status: 'PENDING_REVIEW',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('Producer creator'),
        },
      })
    ).id;
    postId = (
      await prisma.post.create({
        data: {
          creatorProfileId,
          visibility: 'FREE',
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
      })
    ).id;
    await prisma.creatorFollow.createMany({
      data: [USERS.ana, USERS.suspended, USERS.optedOut].map((userId) => ({
        userId,
        creatorProfileId,
      })),
    });
    app = await boot();
    producer = app.get(NotificationProducer);
    db = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.notificationPreference.create({
      data: { userId: USERS.optedOut, optOutTypes: ['NEW_POST', 'TIP_RECEIVED', 'TOPUP_CREDITED'] },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.creatorFollow.deleteMany({ where: { creatorProfileId } });
    await prisma.post.deleteMany({ where: { creatorProfileId } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // notifications/prefs cascade
    await prisma.$disconnect();
  });

  const rows = (userId: string) => prisma.notification.findMany({ where: { userId } });
  const tip = (userId: string, key = 'tip:1') =>
    ({ userId, type: 'TIP_RECEIVED', dedupeKey: key, actorUserId: USERS.budi, coins: 5n }) as const;

  it('keeps the default opt-outs in step with the shared defaults', () => {
    expect(DEFAULT_OPT_OUT_TYPES).toEqual(
      NOTIFICATION_PREFERENCE_DEFAULTS.commentLike ? [] : ['COMMENT_LIKE'],
    );
  });

  it('writes one notification per dedupe key, also under concurrency', async () => {
    await producer.notify(tip(USERS.ana));
    await producer.notify(tip(USERS.ana));
    await Promise.all(Array.from({ length: 10 }, () => producer.notify(tip(USERS.ana, 'tip:2'))));
    const found = await rows(USERS.ana);
    expect(found.map((r) => r.dedupeKey).sort()).toEqual(['tip:1', 'tip:2']);
    expect(found[0]).toMatchObject({ type: 'TIP_RECEIVED', actorUserId: USERS.budi, coins: 5n });
  });

  it('stores createdAt like Prisma does, so it reads back as now (no session time zone shift)', async () => {
    await producer.notify(tip(USERS.ana));
    const [row] = await rows(USERS.ana);
    expect(Math.abs(row!.createdAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it('skips opted-out types, self-notifications and inactive recipients', async () => {
    await producer.notify(tip(USERS.optedOut));
    await producer.notify({ ...tip(USERS.budi), actorUserId: USERS.budi });
    await producer.notify(tip(USERS.suspended));
    for (const id of [USERS.optedOut, USERS.budi, USERS.suspended]) {
      expect(await rows(id)).toEqual([]);
    }
  });

  it('applies the default opt-out without a preferences row, and the user can opt in', async () => {
    const like = { userId: USERS.ana, type: 'COMMENT_LIKE' as const, dedupeKey: 'like:1' };
    await producer.notify(like);
    expect(await rows(USERS.ana)).toEqual([]);
    await prisma.notificationPreference.create({ data: { userId: USERS.ana, optOutTypes: [] } });
    await producer.notify(like);
    expect(await rows(USERS.ana)).toHaveLength(1);
  });

  it('always delivers transactional types, even when opted out', async () => {
    await producer.notify({
      userId: USERS.optedOut,
      type: 'TOPUP_CREDITED',
      dedupeKey: 'topup:1',
      coins: 50n,
    });
    expect(await rows(USERS.optedOut)).toHaveLength(1);
  });

  it('queues a Telegram job only for a connected, allowed recipient', async () => {
    await prisma.notificationPreference.create({
      data: { userId: USERS.ana, telegramAllowed: true, telegramChat: 7200001n },
    });
    await prisma.notificationPreference.create({
      data: { userId: USERS.budi, telegramAllowed: false, telegramChat: 7200002n },
    });
    await producer.notify(tip(USERS.ana));
    await producer.notify(tip(USERS.budi));
    const jobs = await prisma.notificationJob.findMany({
      where: { notification: { userId: { in: [USERS.ana, USERS.budi] } } },
      include: { notification: { select: { userId: true } } },
    });
    expect(jobs.map((j) => j.notification.userId)).toEqual([USERS.ana]);
    expect(jobs[0]!.status).toBe('PENDING');
  });

  it('never breaks the surrounding transaction: a failed insert rolls back to its savepoint', async () => {
    const marker = 'notif-producer-spec-tx';
    await db.$transaction(async (tx) => {
      await producer.notifyInTx(tx, {
        userId: USERS.ana,
        type: 'NEW_POST',
        dedupeKey: 'broken',
        postId: MISSING_POST, // FK violation
      });
      await producer.notifyInTx(tx, tip(USERS.ana));
      await tx.user.update({ where: { id: USERS.budi }, data: { displayName: marker } });
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: USERS.budi } })).displayName).toBe(
      marker,
    );
    expect((await rows(USERS.ana)).map((r) => r.dedupeKey)).toEqual(['tip:1']);
    await prisma.user.update({ where: { id: USERS.budi }, data: { displayName: 'Producer budi' } });
  });

  it('rolls back with the business transaction', async () => {
    await expect(
      db.$transaction(async (tx) => {
        await producer.notifyInTx(tx, tip(USERS.ana));
        throw new Error('business failure');
      }),
    ).rejects.toThrow('business failure');
    expect(await rows(USERS.ana)).toEqual([]);
  });

  it('fans a new post out to active, opted-in followers once per window', async () => {
    const now = new Date();
    const run = (at: Date) =>
      db.$transaction((tx) =>
        producer.notifyNewPostInTx(tx, {
          creatorProfileId,
          creatorUserId: USERS.creator,
          postId,
          now: at,
        }),
      );
    await run(now);
    await run(now); // same window: nothing new
    expect(await rows(USERS.ana)).toHaveLength(1);
    expect(await rows(USERS.suspended)).toEqual([]);
    expect(await rows(USERS.optedOut)).toEqual([]);
    expect(await rows(USERS.creator)).toEqual([]);
    await run(new Date(now.getTime() + WINDOW_MIN * 60_000)); // next window
    expect(await rows(USERS.ana)).toHaveLength(2);
    expect((await rows(USERS.ana))[0]).toMatchObject({
      type: 'NEW_POST',
      actorUserId: USERS.creator,
      postId,
      creatorProfileId,
    });
  });
});
