import { Controller, Get, Injectable } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ERRORS } from '@influency/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.factory.js';

describe('API app', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createApp({ logger: false });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('boots on Fastify and serves under the /api/v1 prefix', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: ERRORS.NOT_FOUND.message,
        requestId: res.headers['x-request-id'],
        details: null,
      },
    });
  });
});

// Guards the test toolchain: NestJS constructor injection needs decorator metadata.
@Injectable()
class GreetingService {
  greet(): string {
    return 'hello';
  }
}

@Controller('greeting')
class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  @Get()
  get(): string {
    return this.greetingService.greet();
  }
}

describe('test toolchain', () => {
  it('resolves constructor-injected providers', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [GreetingController],
      providers: [GreetingService],
    }).compile();
    const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter(), {
      logger: false,
    });
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    const res = await app.inject({ method: 'GET', url: '/greeting' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('hello');
    await app.close();
  });
});
