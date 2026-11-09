import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import {
  creatorSubscriptionStateSchema,
  ownSubscriptionPlanResponseSchema,
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

const WEB_ORIGIN = 'http://localhost:3000';
// Plans are append-only (no cleanup is possible), so every run uses fresh users and slugs.
const RUN = randomUUID().slice(0, 8);
const SLUG = `plans-${RUN}`;
type UserName = 'creator' | 'creator2' | 'fan' | 'pending';
const token = (name: UserName) => `plans-spec-${RUN}-${name}`;

describe('creator subscription plan API', () => {
  const prisma = createTestPrisma();
  const users = {} as Record<UserName, string>;
  let app: NestFastifyApplication;
  let creatorProfileId: string;

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

    for (const name of ['creator', 'creator2', 'fan', 'pending'] as const) {
      const user = await prisma.user.create({ data: { displayName: `Plans ${name}` } });
      users[name] = user.id;
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash: sha256hex(token(name)),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });
    }
    creatorProfileId = (
      await prisma.creatorProfile.create({
        data: {
          userId: users.creator,
          slug: SLUG,
          status: 'APPROVED',
          createdAt: LEFTOVER_CREATED_AT,
          ...profileFields('Plans'),
        },
      })
    ).id;
    await prisma.creatorProfile.create({
      data: {
        userId: users.creator2,
        slug: `${SLUG}-2`,
        status: 'APPROVED',
        createdAt: LEFTOVER_CREATED_AT,
        ...profileFields('Plans 2'),
      },
    });
    await prisma.creatorProfile.create({
      data: {
        userId: users.pending,
        slug: `${SLUG}-pending`,
        status: 'PENDING_REVIEW',
        ...profileFields('Pending'),
      },
    });
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const put = (user: UserName | undefined, body: unknown, origin = WEB_ORIGIN) =>
    app.inject({
      method: 'PUT',
      url: '/api/v1/creators/me/subscription-plan',
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
      headers: { origin },
      payload: body as object,
    });
  const getOwn = (user?: UserName) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/creators/me/subscription-plan',
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
    });
  const state = (slug: string, user?: UserName) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/creators/${slug}/subscription`,
      cookies: user ? { [SESSION_COOKIE]: token(user) } : {},
    });
  const versions = () =>
    prisma.creatorSubscriptionPlan.findMany({
      where: { creatorProfileId },
      orderBy: { version: 'asc' },
    });

  it('has no plan until the creator sets one', async () => {
    const res = await getOwn('creator');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(ownSubscriptionPlanResponseSchema.parse(res.json())).toEqual({ plan: null });
    const pub = creatorSubscriptionStateSchema.parse((await state(SLUG)).json());
    expect(pub).toEqual({ plan: null, viewer: null });
  });

  it('rejects out-of-range, fractional, extra and missing fields', async () => {
    for (const body of [
      { priceCoins: 9, active: true },
      { priceCoins: 5001, active: true },
      { priceCoins: 12.5, active: true },
      { priceCoins: 50, active: true, durationDays: 7 },
      { priceCoins: 50 },
    ]) {
      const res = await put('creator', body);
      expect(res.statusCode).toBe(400);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('VALIDATION_FAILED');
    }
    expect(await versions()).toHaveLength(0);
  });

  it('versions every change and adds nothing for a repeat', async () => {
    const first = await put('creator', { priceCoins: 75, active: true });
    expect(first.statusCode).toBe(200);
    expect(ownSubscriptionPlanResponseSchema.parse(first.json()).plan).toMatchObject({
      version: 1,
      priceCoins: 75,
      durationDays: 30,
      active: true,
    });
    expect((await put('creator', { priceCoins: 100, active: true })).json()).toMatchObject({
      plan: { version: 2, priceCoins: 100 },
    });
    expect((await put('creator', { priceCoins: 100, active: true })).json()).toMatchObject({
      plan: { version: 2 },
    });
    expect((await versions()).map((v) => [v.version, Number(v.priceCoins)])).toEqual([
      [1, 75],
      [2, 100],
    ]);
  });

  it('shows the active plan publicly and hides a deactivated one', async () => {
    const live = creatorSubscriptionStateSchema.parse((await state(SLUG)).json());
    expect(live).toEqual({ plan: { priceCoins: 100, durationDays: 30 }, viewer: null });
    const signedIn = creatorSubscriptionStateSchema.parse((await state(SLUG, 'fan')).json());
    expect(signedIn.viewer).toEqual({ current: null, scheduled: null, canTip: false });

    await put('creator', { priceCoins: 100, active: false });
    expect(creatorSubscriptionStateSchema.parse((await state(SLUG)).json()).plan).toBeNull();
    expect((await getOwn('creator')).json()).toMatchObject({
      plan: { version: 3, active: false },
    });
    await put('creator', { priceCoins: 100, active: true });
  });

  it('keeps versions gap-free under simultaneous edits', async () => {
    const before = (await versions()).length;
    const results = await Promise.all(
      [11, 12, 13, 14, 15].map((priceCoins) => put('creator', { priceCoins, active: true })),
    );
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200, 200, 200]);
    const all = (await versions()).map((v) => v.version);
    expect(all).toEqual(Array.from({ length: before + 5 }, (_, i) => i + 1));
  });

  it('only approved creators can write, and only their own plan', async () => {
    expect((await put(undefined, { priceCoins: 50, active: true })).statusCode).toBe(401);
    for (const user of ['fan', 'pending'] as const) {
      const res = await put(user, { priceCoins: 50, active: true });
      expect(res.statusCode).toBe(403);
      expect(res.json<{ error: { code: string } }>().error.code).toBe('CREATOR_NOT_APPROVED');
      expect((await getOwn(user)).statusCode).toBe(403);
    }
    expect((await getOwn()).statusCode).toBe(401);
    // creator2 writes to their own profile; nothing leaks onto the first creator.
    const before = (await versions()).length;
    expect((await put('creator2', { priceCoins: 30, active: true })).statusCode).toBe(200);
    expect(await versions()).toHaveLength(before);
    expect((await state(`${SLUG}-2`)).json()).toMatchObject({ plan: { priceCoins: 30 } });
  });

  it('answers 404 for unknown and non-public creators', async () => {
    expect((await state('no-such-creator-xyz')).statusCode).toBe(404);
    expect((await state(`${SLUG}-pending`)).statusCode).toBe(404);
  });

  it('requires a same-origin request when the cookie is sent', async () => {
    const before = (await versions()).length;
    const res = await put('creator', { priceCoins: 60, active: true }, 'https://evil.example');
    expect(res.statusCode).toBe(403);
    expect(await versions()).toHaveLength(before);
  });
});
