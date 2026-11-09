import { PassThrough } from 'node:stream';
import { Body, Controller, ForbiddenException, Get, HttpCode, Post } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { ERRORS, errorResponseSchema, POST_IMAGE_MAX_BYTES } from '@influency/shared';
import { z } from 'zod';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp, createFastifyAdapter } from '../app.factory.js';
import { DomainError } from './domain-error.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const personSchema = z.object({ name: z.string().min(1), age: z.number().int() });

@Controller('test-errors')
class TestErrorsController {
  @Get('domain')
  domain(): never {
    throw new DomainError('INSUFFICIENT_COINS', { required: 5, available: 3 });
  }

  @Get('unexpected')
  unexpected(): never {
    throw new Error('db password=secret at /srv/app/x.ts');
  }

  @Get('forbidden')
  forbidden(): never {
    throw new ForbiddenException('internal reason');
  }

  @Post('validate')
  @HttpCode(201)
  validate(@Body(new ZodValidationPipe(personSchema)) body: z.infer<typeof personSchema>) {
    return body;
  }
}

describe('error format', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestErrorsController],
    }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: false }),
        { logger: false },
      ),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  function errorOf(res: { json: () => unknown; headers: Record<string, unknown> }) {
    const body = errorResponseSchema.parse(res.json());
    expect(body.error.requestId).toBe(res.headers['x-request-id']);
    return body.error;
  }

  it('maps a DomainError to its status, code, message and details', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/test-errors/domain' });

    expect(res.statusCode).toBe(402);
    expect(errorOf(res)).toEqual({
      code: 'INSUFFICIENT_COINS',
      message: ERRORS.INSUFFICIENT_COINS.message,
      requestId: res.headers['x-request-id'],
      details: { required: 5, available: 3 },
    });
  });

  it('hides unexpected errors behind a generic 500', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/test-errors/unexpected' });

    expect(res.statusCode).toBe(500);
    expect(errorOf(res)).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: ERRORS.INTERNAL_ERROR.message,
      details: null,
    });
    expect(res.body).not.toMatch(/secret|stack|\.ts/);
  });

  it('maps Nest HttpExceptions without exposing their message', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/test-errors/forbidden' });

    expect(res.statusCode).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
    expect(res.body).not.toContain('internal reason');
  });

  it('returns 400 VALIDATION_FAILED listing every invalid field', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/test-errors/validate',
      payload: { name: '', age: 1.5 },
    });

    expect(res.statusCode).toBe(400);
    const error = errorOf(res);
    expect(error.code).toBe('VALIDATION_FAILED');
    const issues = (error.details as { issues: { path: string }[] }).issues;
    expect(issues.map((i) => i.path).sort()).toEqual(['age', 'name']);
    expect(res.body).not.toContain('1.5');
  });

  it('passes parsed data through when the body is valid', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/test-errors/validate',
      payload: { name: 'Claudia', age: 30, extra: 'dropped' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ name: 'Claudia', age: 30 });
  });

  it('returns 400 VALIDATION_FAILED for malformed JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/test-errors/validate',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });

    expect(res.statusCode).toBe(400);
    expect(errorOf(res)).toMatchObject({ code: 'VALIDATION_FAILED', details: null });
  });

  it('returns 413 FILE_TOO_LARGE for an image body over the upload limit', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/test-errors/validate',
      headers: { 'content-type': 'image/png' },
      payload: Buffer.alloc(POST_IMAGE_MAX_BYTES + 1),
    });

    expect(res.statusCode).toBe(413);
    expect(errorOf(res)).toMatchObject({ code: 'FILE_TOO_LARGE', details: null });
  });

  it('returns 415 UNSUPPORTED_FILE_TYPE for a body type without a parser', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/test-errors/validate',
      headers: { 'content-type': 'application/pdf' },
      payload: '%PDF-1.7',
    });

    expect(res.statusCode).toBe(415);
    expect(errorOf(res)).toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE', details: null });
  });

  it('logs unexpected errors server-side with the request ID', async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    stream.on('data', (chunk: Buffer) =>
      lines.push(...chunk.toString().split('\n').filter(Boolean)),
    );
    const moduleRef = await Test.createTestingModule({
      controllers: [TestErrorsController],
    }).compile();
    const logged = configureApp(
      moduleRef.createNestApplication<NestFastifyApplication>(
        createFastifyAdapter({ logger: true, logStream: stream }),
        { logger: false },
      ),
    );
    await logged.init();
    await logged.getHttpAdapter().getInstance().ready();

    await logged.inject({
      method: 'GET',
      url: '/api/v1/test-errors/unexpected',
      headers: { 'x-request-id': 'trace_500' },
    });
    await logged.close();

    const entry = lines
      .map(
        (line) =>
          JSON.parse(line) as { msg?: string; requestId?: string; err?: { stack?: string } },
      )
      .find((e) => e.msg === 'Unhandled error');
    expect(entry?.requestId).toBe('trace_500');
    expect(entry?.err?.stack).toContain('db password=secret');
  });

  it('returns 404 NOT_FOUND for unknown routes', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/nope' });

    expect(res.statusCode).toBe(404);
    expect(errorOf(res).code).toBe('NOT_FOUND');
  });
});
