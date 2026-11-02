import { PassThrough } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp, createApp, createFastifyAdapter } from './app.factory.js';
import { AppModule } from './app.module.js';

const GENERATED_ID = /^req_[0-9a-f-]{36}$/;

describe('request ID', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a req_<uuid> ID per request, also on 404s', async () => {
    const a = await app.inject({ method: 'GET', url: '/api/v1/x' });
    const b = await app.inject({ method: 'GET', url: '/api/v1/x' });

    expect(a.statusCode).toBe(404);
    expect(a.headers['x-request-id']).toMatch(GENERATED_ID);
    expect(b.headers['x-request-id']).toMatch(GENERATED_ID);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('reuses a well-formed incoming ID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/x',
      headers: { 'x-request-id': 'web_abc-123' },
    });

    expect(res.headers['x-request-id']).toBe('web_abc-123');
  });

  it.each(['a b', 'x"injected":1', 'a'.repeat(65), '', 'id;drop'])(
    'replaces a malformed incoming ID (%j)',
    async (incoming) => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/x',
        headers: { 'x-request-id': incoming },
      });

      expect(res.headers['x-request-id']).toMatch(GENERATED_ID);
    },
  );
});

describe('request logs', () => {
  it('are JSON lines carrying the requestId and the path without query string', async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    stream.on('data', (chunk: Buffer) =>
      lines.push(...chunk.toString().split('\n').filter(Boolean)),
    );
    const app = await NestFactory.create<NestFastifyApplication>(
      AppModule,
      createFastifyAdapter({ logger: true, logStream: stream }),
      { logger: false },
    );
    configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    await app.inject({
      method: 'GET',
      url: '/api/v1/x?code=secret',
      headers: { 'x-request-id': 'trace_1' },
    });
    await app.close();

    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    const requestEntries = entries.filter((e) => e.requestId === 'trace_1');
    expect(requestEntries.length).toBeGreaterThan(0);
    expect(requestEntries).toContainEqual(
      expect.objectContaining({ req: { method: 'GET', url: '/api/v1/x' } }),
    );
    expect(lines.join('\n')).not.toContain('secret');
  });
});
