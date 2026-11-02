import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { configureApp, createFastifyAdapter } from '../../app.factory.js';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../../common/prisma.service.js';
import { DB_CHECK_TIMEOUT_MS } from './health.service.js';

describe('GET /api/v1/health', () => {
  let app: NestFastifyApplication | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    await app?.close();
  });

  async function boot(queryRaw: () => Promise<unknown>): Promise<NestFastifyApplication> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw, $disconnect: () => Promise.resolve() })
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    return app;
  }

  it('returns 200 when the database answers', async () => {
    const res = await (
      await boot(() => Promise.resolve([{ '?column?': 1 }]))
    ).inject({
      method: 'GET',
      url: '/api/v1/health',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', checks: { database: 'up', redis: 'disabled' } });
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });

  it('returns 503 without error details when the database fails', async () => {
    const res = await (
      await boot(() =>
        Promise.reject(new Error('connect ECONNREFUSED postgresql://u:pw@db.internal')),
      )
    ).inject({ method: 'GET', url: '/api/v1/health' });

    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({
      status: 'degraded',
      checks: { database: 'down', redis: 'disabled' },
    });
    expect(res.body).not.toMatch(/pw|ECONNREFUSED|db\.internal/);
  });

  it('returns 503 when the database does not answer in time', async () => {
    const started = await boot(() => new Promise(() => undefined));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    const pending = started.inject({ method: 'GET', url: '/api/v1/health' });
    await vi.advanceTimersByTimeAsync(DB_CHECK_TIMEOUT_MS);
    const res = await pending;

    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ checks: { database: 'down' } });
  });
});
