import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { errorResponseSchema } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seed } from '../../../prisma/seed/seed.js';
import { createFakeTelegram } from '../../../test/fake-telegram.js';
import { createTestPrisma } from '../../../test/prisma.js';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { DEMO_USER_IDS } from '../../common/demo-ids.js';
import { ENV, parseEnv } from '../../common/env.js';
import { TELEGRAM_OIDC_CLIENT } from './telegram-oidc.client.js';

async function buildApp(nodeEnv: 'development' | 'production'): Promise<NestFastifyApplication> {
  const fake = await createFakeTelegram();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(TELEGRAM_OIDC_CLIENT)
    .useValue(fake.client())
    .overrideProvider(ENV)
    .useValue({ ...parseEnv(process.env), NODE_ENV: nodeEnv })
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

describe('GET /auth/dev/login', () => {
  const prisma = createTestPrisma();
  const startedAt = new Date();
  let dev: NestFastifyApplication;
  let prod: NestFastifyApplication;

  beforeAll(async () => {
    await seed(prisma);
    [dev, prod] = await Promise.all([buildApp('development'), buildApp('production')]);
  });

  afterAll(async () => {
    await Promise.all([dev.close(), prod.close()]);
    // Seeded users stay (other specs rely on them); only this spec's sessions go.
    await prisma.session.deleteMany({
      where: { userId: { in: Object.values(DEMO_USER_IDS) }, createdAt: { gte: startedAt } },
    });
    await prisma.$disconnect();
  });

  const devLogin = (app: NestFastifyApplication, query: string) =>
    app.inject({ method: 'GET', url: `/api/v1/auth/dev/login?${query}` });

  it('logs in as a demo user and redirects to returnTo', async () => {
    const res = await devLogin(dev, 'user=claudia&returnTo=%2Fstudio');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/studio');
    const cookie = res.cookies.find((c) => c.name === 'influency_session')!;
    expect(cookie.httpOnly).toBe(true);

    const me = await dev.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      cookies: { influency_session: cookie.value },
    });
    expect(me.json()).toMatchObject({ id: DEMO_USER_IDS.claudia, roles: ['USER', 'CREATOR'] });
  });

  it('sends a user who has not finished onboarding to /welcome, keeping returnTo', async () => {
    await prisma.user.update({
      where: { id: DEMO_USER_IDS.subscriberB },
      data: { onboardingCompletedAt: null },
    });
    try {
      const res = await devLogin(dev, 'user=subscriberB&returnTo=%2Fana');
      expect(res.headers.location).toBe('/welcome?returnTo=%2Fana');
      expect((await devLogin(dev, 'user=subscriberB')).headers.location).toBe('/welcome');
    } finally {
      await prisma.user.update({
        where: { id: DEMO_USER_IDS.subscriberB },
        data: { onboardingCompletedAt: new Date() },
      });
    }
  });

  it('falls back to / for an unsafe returnTo', async () => {
    const res = await devLogin(dev, 'user=admin&returnTo=https%3A%2F%2Fevil.com');
    expect(res.headers.location).toBe('/');
  });

  it.each(['user=nobody', 'user=constructor', 'user=a&user=b', ''])(
    'returns 404 NOT_FOUND for %j',
    async (query) => {
      const res = await devLogin(dev, query);
      expect(res.statusCode).toBe(404);
      expect(errorResponseSchema.parse(res.json()).error.code).toBe('NOT_FOUND');
      expect(res.cookies).toHaveLength(0);
    },
  );

  it('returns 404 in production and creates no session', async () => {
    const before = await prisma.session.count({ where: { userId: DEMO_USER_IDS.admin } });
    const res = await devLogin(prod, 'user=admin');
    expect(res.statusCode).toBe(404);
    expect(res.cookies).toHaveLength(0);
    expect(await prisma.session.count({ where: { userId: DEMO_USER_IDS.admin } })).toBe(before);
  });
});
