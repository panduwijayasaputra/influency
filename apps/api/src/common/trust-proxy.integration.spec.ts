import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { configureApp, createFastifyAdapter } from '../app.factory.js';
import { AppModule } from '../app.module.js';
import { MEDIA_ACCESS_RATE_LIMIT } from '../modules/entitlements/media-access.controller.js';

// Unknown post: the rate limit runs before the handler, so every call counts and answers 404 until limited.
const URL = '/api/v1/posts/0190a000-0000-7000-8000-0000000f0001/media-access';

async function boot(trustProxy?: number | string[]) {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(
    moduleRef.createNestApplication<NestFastifyApplication>(
      createFastifyAdapter({ logger: false, trustProxy }),
      { logger: false },
    ),
  );
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

describe('TRUST_PROXY and the anonymous rate-limit key', () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => app?.close());

  // inject() connects from 127.0.0.1, standing in for the web proxy.
  const call = (ip: string) =>
    app!.inject({ method: 'GET', url: URL, headers: { 'x-forwarded-for': ip } });
  const exhaust = async (ip: string) => {
    for (let i = 0; i < MEDIA_ACCESS_RATE_LIMIT.max; i++) {
      expect((await call(ip)).statusCode).toBe(404);
    }
    expect((await call(ip)).statusCode).toBe(429);
  };

  it('gives each forwarded client IP its own bucket when the proxy is trusted', async () => {
    app = await boot(['127.0.0.1']);
    await exhaust('203.0.113.1');
    expect((await call('203.0.113.2')).statusCode).toBe(404);
  });

  it('treats a hop count the same way (TRUST_PROXY=1)', async () => {
    app = await boot(1);
    await exhaust('203.0.113.1');
    expect((await call('203.0.113.2')).statusCode).toBe(404);
  });

  it('keeps one shared bucket without TRUST_PROXY (forwarded IPs are ignored)', async () => {
    app = await boot();
    await exhaust('203.0.113.1');
    expect((await call('203.0.113.2')).statusCode).toBe(429);
  });
});
