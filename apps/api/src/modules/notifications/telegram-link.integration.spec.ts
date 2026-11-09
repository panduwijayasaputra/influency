import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { SESSION_COOKIE, telegramLinkResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createFakeTelegramBot } from '../../../test/fake-telegram-bot.js';
import { createMemoryStorage } from '../../../test/memory-storage.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { sha256hex } from '../../common/crypto.js';
import { ENV, parseEnv } from '../../common/env.js';
import { OBJECT_STORAGE } from '../../common/object-storage.js';
import { TELEGRAM_BOT } from '../../common/telegram-bot.js';
import { TELEGRAM_OIDC_CLIENT } from '../auth/telegram-oidc.client.js';
import { REPLIES } from './telegram-link.service.js';

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  ana: '0190a000-0000-7000-8000-000000740001',
  budi: '0190a000-0000-7000-8000-000000740002',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `telegram-link-spec-${name}`;
const WEB_ORIGIN = 'http://localhost:3000';
const SECRET = 'link-spec-secret';
const BOT_ENV = {
  TELEGRAM_BOT_TOKEN: '123456:link-spec',
  TELEGRAM_BOT_USERNAME: 'InfluencyTestBot',
  TELEGRAM_BOT_WEBHOOK_SECRET: SECRET,
};
const CHAT = 7400001;

async function boot(withBot: boolean, fakeBot = createFakeTelegramBot()) {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(
      parseEnv({ ...process.env, ...(withBot ? BOT_ENV : { TELEGRAM_BOT_TOKEN: undefined }) }),
    )
    .overrideProvider(TELEGRAM_BOT)
    .useValue(withBot ? fakeBot.bot : null)
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

describe('Telegram link + webhook (US-074)', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  const fakeBot = createFakeTelegramBot();
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Link ${name}` })),
    });
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt: new Date(Date.now() + 86_400_000),
      })),
    });
    app = await boot(true, fakeBot);
  });
  beforeEach(async () => {
    fakeBot.sent.length = 0;
    await prisma.notificationPreference.deleteMany({ where: { userId: { in: userIds } } });
  });
  afterAll(async () => {
    await app.close();
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  const link = async (user: UserName, on = app) =>
    on.inject({
      method: 'POST',
      url: '/api/v1/me/telegram/link',
      cookies: { [SESSION_COOKIE]: token(user) },
      headers: { origin: WEB_ORIGIN },
    });
  const startToken = async (user: UserName) => {
    const res = await link(user);
    expect(res.statusCode).toBe(200);
    const { url } = telegramLinkResponseSchema.parse(res.json());
    expect(url.startsWith('https://t.me/InfluencyTestBot?start=')).toBe(true);
    return new URL(url).searchParams.get('start')!;
  };
  /** A valid link token stored directly (the link endpoint allows only 5 calls a minute per user). */
  const seedToken = async (user: UserName) => {
    const t = `seeded-${user}-${Math.random().toString(36).slice(2)}`;
    await prisma.notificationPreference.upsert({
      where: { userId: USERS[user] },
      create: {
        userId: USERS[user],
        linkTokenHash: sha256hex(t),
        linkTokenExpiresAt: new Date(Date.now() + 600_000),
      },
      update: { linkTokenHash: sha256hex(t), linkTokenExpiresAt: new Date(Date.now() + 600_000) },
    });
    return t;
  };
  const update = (
    text: string,
    opts: { chat?: number; type?: string; secret?: string | null } = {},
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers:
        opts.secret === null ? {} : { 'x-telegram-bot-api-secret-token': opts.secret ?? SECRET },
      payload: {
        update_id: 1,
        message: {
          message_id: 1,
          chat: { id: opts.chat ?? CHAT, type: opts.type ?? 'private' },
          text,
        },
      },
    });
  const prefs = (user: UserName) =>
    prisma.notificationPreference.findUnique({ where: { userId: USERS[user] } });

  it('links the chat with a one-time /start token and replies', async () => {
    const t = await startToken('ana');
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await prefs('ana');
    expect(stored!.linkTokenHash).toBe(sha256hex(t));
    expect((await update(`/start ${t}`)).statusCode).toBe(200);
    expect(await prefs('ana')).toMatchObject({
      telegramChat: BigInt(CHAT),
      telegramAllowed: true,
      linkTokenHash: null,
      linkTokenExpiresAt: null,
    });
    expect((await prefs('ana'))!.telegramLinkedAt).not.toBeNull();
    expect(fakeBot.sent).toEqual([{ chat: BigInt(CHAT), text: REPLIES.linked }]);

    // Single use.
    await update(`/start ${t}`, { chat: CHAT + 1 });
    expect(fakeBot.sent.at(-1)!.text).toBe(REPLIES.invalid);
    expect((await prefs('ana'))!.telegramChat).toBe(BigInt(CHAT));
  });

  it('rejects an expired token', async () => {
    const t = await seedToken('ana');
    await prisma.notificationPreference.update({
      where: { userId: USERS.ana },
      data: { linkTokenExpiresAt: new Date(Date.now() - 1000) },
    });
    await update(`/start ${t}`);
    expect(fakeBot.sent.at(-1)!.text).toBe(REPLIES.invalid);
    expect((await prefs('ana'))!.telegramChat).toBeNull();
  });

  it('moves a chat to the user who links it last', async () => {
    await update(`/start ${await seedToken('ana')}`);
    await update(`/start ${await seedToken('budi')}`);
    expect((await prefs('ana'))!.telegramChat).toBeNull();
    expect((await prefs('ana'))!.telegramAllowed).toBe(false);
    expect((await prefs('budi'))!.telegramChat).toBe(BigInt(CHAT));
  });

  it('turns delivery off with /stop and explains a bare /start', async () => {
    await update(`/start ${await seedToken('ana')}`);
    await update('/stop');
    expect((await prefs('ana'))!.telegramAllowed).toBe(false);
    expect(fakeBot.sent.at(-1)!.text).toBe(REPLIES.stopped);
    await update('/start');
    expect(fakeBot.sent.at(-1)!.text).toBe(REPLIES.howTo);
  });

  it('ignores group chats and other updates', async () => {
    const t = await seedToken('ana');
    expect((await update(`/start ${t}`, { type: 'group' })).statusCode).toBe(200);
    const junk = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram',
      headers: { 'x-telegram-bot-api-secret-token': SECRET },
      payload: { update_id: 2, edited_message: {} },
    });
    expect(junk.statusCode).toBe(200);
    expect((await prefs('ana'))!.telegramChat).toBeNull();
    expect(fakeBot.sent).toEqual([]);
  });

  it.each([
    ['a wrong', 'nope'],
    ['a missing', null],
  ])('refuses %s secret header without changing anything', async (_label, secret) => {
    const t = await seedToken('ana');
    const res = await update(`/start ${t}`, { secret });
    expect(res.statusCode).toBe(403);
    expect((await prefs('ana'))!.telegramChat).toBeNull();
  });

  it('is off without a bot: link 409, webhook 404', async () => {
    const off = await boot(false);
    try {
      const res = await link('ana', off);
      expect(res.statusCode).toBe(409);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('TELEGRAM_UNAVAILABLE');
      const hook = await off.inject({
        method: 'POST',
        url: '/api/v1/webhooks/telegram',
        headers: { 'x-telegram-bot-api-secret-token': SECRET },
        payload: {},
      });
      expect(hook.statusCode).toBe(404);
    } finally {
      await off.close();
    }
  });
});
