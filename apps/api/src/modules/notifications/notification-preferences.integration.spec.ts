import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { notificationPreferencesSchema, SESSION_COOKIE } from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { LEFTOVER_CREATED_AT, profileFields } from '../../../test/creator-profile.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { NotificationProducer } from './notification-producer.service.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  ana: '0190a000-0000-7000-8000-000000730001',
  budi: '0190a000-0000-7000-8000-000000730002',
  creator: '0190a000-0000-7000-8000-000000730003',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `notif-prefs-spec-${name}`;
const WEB_ORIGIN = 'http://localhost:3000';
const BOT = {
  TELEGRAM_BOT_TOKEN: '123456:test-token',
  TELEGRAM_BOT_USERNAME: 'InfluencyTestBot',
  TELEGRAM_BOT_WEBHOOK_SECRET: 'test-secret',
};

async function boot(env: Record<string, string | undefined>) {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, ...env }))
    .compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('notification preferences (US-073)', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Prefs ${name}` })),
    });
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    });
    await prisma.creatorProfile.create({
      data: {
        userId: USERS.creator,
        slug: 'notif-prefs-spec',
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT, // ranked last in GET /creators/recommended (parallel specs)
        ...profileFields('Prefs creator'),
      },
    });
    app = await boot({ TELEGRAM_BOT_TOKEN: undefined });
  });
  beforeEach(async () => {
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  });
  afterAll(async () => {
    await app.close();
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const get = (user: UserName | null, on = app) =>
    on.inject({
      method: 'GET',
      url: '/api/v1/me/notification-preferences',
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
    });
  const put = (user: UserName, payload: object) =>
    app.inject({
      method: 'PUT',
      url: '/api/v1/me/notification-preferences',
      cookies: { [SESSION_COOKIE]: token(user) },
      headers: { origin: WEB_ORIGIN },
      payload,
    });
  const prefs = async (user: UserName, on = app) => {
    const res = await get(user, on);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    return notificationPreferencesSchema.parse(res.json());
  };

  it('needs a session', async () => {
    expect((await get(null)).statusCode).toBe(401);
  });

  it('returns the defaults without a row; earnings only for creators; Telegram unavailable without a bot', async () => {
    expect(await prefs('ana')).toEqual({
      newPost: true,
      commentReply: true,
      commentLike: false,
      subscriptionReminder: true,
      earnings: null,
      telegram: { status: 'unavailable', allowed: false },
    });
    expect((await prefs('creator')).earnings).toBe(true);
  });

  it('saves a patch and keeps other users untouched', async () => {
    const res = await put('ana', { commentLike: true, newPost: false });
    expect(res.statusCode).toBe(200);
    expect(notificationPreferencesSchema.parse(res.json())).toMatchObject({
      commentLike: true,
      newPost: false,
    });
    expect(await prefs('ana')).toMatchObject({
      commentLike: true,
      newPost: false,
      commentReply: true,
    });
    expect(await prefs('budi')).toMatchObject({ commentLike: false, newPost: true });
  });

  it('allows earnings for creators only', async () => {
    expect((await put('ana', { earnings: false })).statusCode).toBe(403);
    expect((await put('creator', { earnings: false })).statusCode).toBe(200);
    expect((await prefs('creator')).earnings).toBe(false);
  });

  it.each([
    ['an unknown key', { mentions: false }],
    ['a non-boolean', { newPost: 'no' }],
  ])('rejects %s', async (_label, payload) => {
    const res = await put('ana', payload);
    expect(res.statusCode).toBe(400);
  });

  it('applies concurrent toggles without losing one', async () => {
    const results = await Promise.all([
      put('budi', { newPost: false }),
      put('budi', { commentReply: false }),
      put('budi', { commentLike: true }),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(await prefs('budi')).toMatchObject({
      newPost: false,
      commentReply: false,
      commentLike: true,
    });
  });

  it('stops producing an opted-out type', async () => {
    await put('ana', { newPost: false });
    const producer = app.get(NotificationProducer);
    await producer.notify({ userId: USERS.ana, type: 'NEW_POST', dedupeKey: 'prefs:np' });
    await producer.notify({
      userId: USERS.ana,
      type: 'TOPUP_CREDITED',
      dedupeKey: 'prefs:tc',
      coins: 5n,
    });
    const rows = await prisma.notification.findMany({ where: { userId: USERS.ana } });
    expect(rows.map((r) => r.type)).toEqual(['TOPUP_CREDITED']);
    await prisma.notification.deleteMany({ where: { userId: USERS.ana } });
  });

  it('reports Telegram as not connected or connected once a bot exists', async () => {
    const withBot = await boot(BOT);
    try {
      await put('ana', { telegramAllowed: true });
      expect((await prefs('ana', withBot)).telegram).toEqual({
        status: 'not_connected',
        allowed: false,
      });
      await prisma.notificationPreference.update({
        where: { userId: USERS.ana },
        data: { telegramChat: 7300001n },
      });
      expect((await prefs('ana', withBot)).telegram).toEqual({
        status: 'connected',
        allowed: true,
      });
    } finally {
      await withBot.close();
    }
  });
});
