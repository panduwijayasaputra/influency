import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { notificationsPageSchema, SESSION_COOKIE, unreadCountSchema } from '@influency/shared';
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

// Fixed ids outside DEMO_USER_IDS so this spec owns (and cleans up) its rows.
const USERS = {
  ana: '0190a000-0000-7000-8000-000000710101',
  budi: '0190a000-0000-7000-8000-000000710102',
  creator: '0190a000-0000-7000-8000-000000710103',
} as const;
type UserName = keyof typeof USERS;
const token = (name: UserName) => `notif-inbox-spec-${name}`;
const SLUG = 'notif-inbox-spec';
const DAY = 86_400_000;
const RETENTION_DAYS = 90;

async function boot() {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(OBJECT_STORAGE)
    .useValue(createMemoryStorage().storage)
    .overrideProvider(ENV)
    .useValue(parseEnv({ ...process.env, NOTIFICATION_RETENTION_DAYS: String(RETENTION_DAYS) }))
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

describe('notifications inbox (US-071)', () => {
  const prisma = createTestPrisma();
  const userIds = Object.values(USERS);
  let app: NestFastifyApplication;
  let creatorProfileId = '';
  let postId = '';

  beforeAll(async () => {
    await prisma.user.createMany({
      data: Object.entries(USERS).map(([name, id]) => ({ id, displayName: `Inbox ${name}` })),
    });
    const expiresAt = new Date(Date.now() + DAY);
    await prisma.session.createMany({
      data: (Object.keys(USERS) as UserName[]).map((name) => ({
        userId: USERS[name],
        tokenHash: sha256hex(token(name)),
        expiresAt,
      })),
    });
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: USERS.creator,
          slug: SLUG,
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT, // ranked last in GET /creators/recommended (parallel specs)
          ...profileFields('Nadia Inbox'),
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
    app = await boot();
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  });

  afterAll(async () => {
    await app.close();
    await prisma.post.deleteMany({ where: { creatorProfileId } });
    await prisma.creatorProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  /** n notifications for `user`, one minute apart, newest last in the array (dedupe keys k0…). */
  const seed = async (user: UserName, n: number, extra: Record<string, unknown> = {}) => {
    const now = Date.now();
    for (let i = 0; i < n; i++) {
      await prisma.notification.create({
        data: {
          userId: USERS[user],
          type: 'TOPUP_CREDITED',
          coins: 50n,
          dedupeKey: `k${i}`,
          createdAt: new Date(now - (n - i) * 60_000),
          ...extra,
        },
      });
    }
  };
  const get = (user: UserName | null, url: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/me/notifications${url}`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
    });
  const page = async (user: UserName, cursor?: string) => {
    const res = await get(user, cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
    expect(res.statusCode).toBe(200);
    return notificationsPageSchema.parse(res.json());
  };
  const unread = async (user: UserName) =>
    unreadCountSchema.parse((await get(user, '/unread-count')).json()).count;
  const markRead = (user: UserName, upToId: string) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/me/notifications/read',
      cookies: { [SESSION_COOKIE]: token(user) },
      headers: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000' },
      payload: { upToId },
    });

  it('needs a session', async () => {
    expect((await get(null, '')).statusCode).toBe(401);
    expect((await get(null, '/unread-count')).statusCode).toBe(401);
  });

  it('lists newest first in pages of 20 with a stable cursor, and is never cached', async () => {
    await seed('ana', 25);
    const res = await get('ana', '');
    expect(res.headers['cache-control']).toBe('no-store');
    const first = await page('ana');
    expect(first.items).toHaveLength(20);
    const second = await page('ana', first.nextCursor!);
    expect(second.items).toHaveLength(5);
    expect(second.nextCursor).toBeNull();
    const times = [...first.items, ...second.items].map((i) => Date.parse(i.createdAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(new Set([...first.items, ...second.items].map((i) => i.id)).size).toBe(25);
    expect(first.items[0]).toMatchObject({
      type: 'TOPUP_CREDITED',
      actor: null,
      text: 'Top-up berhasil: 50 Koin masuk ke Dompet.',
      href: '/wallet',
      read: false,
    });
  });

  it('rejects a malformed cursor', async () => {
    expect((await get('ana', '?cursor=nope')).statusCode).toBe(400);
  });

  it('counts unread and marks read up to a notification, only for the caller', async () => {
    await seed('ana', 3);
    await seed('budi', 2);
    const items = (await page('ana')).items; // newest first
    expect(await unread('ana')).toBe(3);
    const res = await markRead('ana', items[1]!.id);
    expect(res.statusCode).toBe(204);
    expect(await unread('ana')).toBe(1);
    expect((await page('ana')).items.map((i) => i.read)).toEqual([false, true, true]);
    expect(await unread('budi')).toBe(2);
  });

  it("refuses another user's notification id without changing anything", async () => {
    await seed('budi', 1);
    const [budiItem] = (await page('budi')).items;
    const res = await markRead('ana', budiItem!.id);
    expect(res.statusCode).toBe(404);
    expect(await unread('budi')).toBe(1);
    expect((await page('ana')).items).toEqual([]);
  });

  it('validates the mark-read body', async () => {
    expect((await markRead('ana', 'not-a-uuid')).statusCode).toBe(400);
  });

  it('leaves out notifications older than the retention', async () => {
    await prisma.notification.create({
      data: {
        userId: USERS.ana,
        type: 'TOPUP_CREDITED',
        coins: 5n,
        dedupeKey: 'old',
        createdAt: new Date(Date.now() - (RETENTION_DAYS + 1) * DAY),
      },
    });
    await seed('ana', 1);
    expect((await page('ana')).items).toHaveLength(1);
    expect(await unread('ana')).toBe(1);
  });

  it('links a post notification with the actor, and falls back once the post is gone', async () => {
    await seed('ana', 1, {
      type: 'NEW_POST',
      coins: null,
      actorUserId: USERS.creator,
      postId,
      creatorProfileId,
    });
    const [item] = (await page('ana')).items;
    expect(item).toMatchObject({
      actor: { displayName: 'Inbox creator', avatarUrl: null },
      text: 'memposting konten baru.',
      href: `/${SLUG}/posts/${postId}`,
    });
    expect(JSON.stringify(item)).not.toContain('SECRET-CAPTION');

    await prisma.post.update({ where: { id: postId }, data: { status: 'REMOVED' } });
    try {
      const [gone] = (await page('ana')).items;
      expect(gone).toMatchObject({
        actor: null,
        text: 'Notifikasi ini tidak lagi tersedia.',
        href: '/notifications',
      });
    } finally {
      await prisma.post.update({ where: { id: postId }, data: { status: 'PUBLISHED' } });
    }
  });
});
