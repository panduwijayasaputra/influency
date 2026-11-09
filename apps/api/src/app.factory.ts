import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Writable } from 'node:stream';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import { type FastifyRequest, LogController } from 'fastify';
import type { NestApplicationOptions } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import {
  API_PREFIX,
  POST_IMAGE_MAX_BYTES,
  POST_VIDEO_MAX_BYTES,
  PROFILE_IMAGE_MAX_BYTES,
} from '@influency/shared';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

export const REQUEST_ID_HEADER = 'x-request-id';
// Incoming IDs are reused only in this shape, so they can't inject into logs.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Fastify adapter with JSON logging (unless disabled) and validated request IDs. */
export function createFastifyAdapter(options: {
  logger: boolean;
  logStream?: Writable;
  /** Fastify trustProxy (env TRUST_PROXY); default: trust none. */
  trustProxy?: false | number | string[];
}): FastifyAdapter {
  return new FastifyAdapter({
    // A hop count means "trust the first n hops", exactly what proxy-addr does for a number (Nest's type omits it).
    trustProxy:
      typeof options.trustProxy === 'number'
        ? (_address: string, hop: number) => hop < (options.trustProxy as number)
        : (options.trustProxy ?? false),
    logger: options.logger && {
      level: 'info',
      ...(options.logStream && { stream: options.logStream }),
      // Path only: query strings may carry secrets (e.g. OIDC `code`).
      serializers: {
        req: (req: FastifyRequest) => ({ method: req.method, url: req.url.split('?')[0] }),
      },
    },
    // Not 'x-request-id': Fastify would then trust the header without calling genReqId.
    requestIdHeader: false,
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
    genReqId: (req: IncomingMessage) => {
      const incoming = req.headers[REQUEST_ID_HEADER];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)
        ? incoming
        : `req_${randomUUID()}`;
    },
  });
}

/** Applies the global prefix, the error filter, cookie parsing and the X-Request-Id response header. */
export function configureApp(app: NestFastifyApplication): NestFastifyApplication {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());
  const fastify = app.getHttpAdapter().getInstance();
  // Queued by Fastify and loaded before ready(), so configureApp stays synchronous.
  void fastify.register(fastifyCookie);
  // Opt-in per handler through @RateLimit + RateLimitGuard (createRateLimit), never global hooks.
  void fastify.register(fastifyRateLimit, { global: false });
  // Raw image uploads (PUT /creators/me/avatar|banner, local-driver PUT /dev-storage/*); limits and types are checked in the services.
  fastify.addContentTypeParser(
    /^image\//,
    {
      parseAs: 'buffer',
      bodyLimit: Math.max(PROFILE_IMAGE_MAX_BYTES.banner, POST_IMAGE_MAX_BYTES),
    },
    (_req, body, done) => done(null, body),
  );
  // Raw video uploads to the stub video driver (local-driver PUT /dev-storage/post-video/*); checked by the driver.
  fastify.addContentTypeParser(
    /^video\//,
    { parseAs: 'buffer', bodyLimit: POST_VIDEO_MAX_BYTES },
    (_req, body, done) => done(null, body),
  );
  fastify.addHook('onRequest', (req, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, req.id);
    done();
  });
  return app;
}

/** Builds the API application without listening, so tests can boot the same app. */
export async function createApp(
  options?: NestApplicationOptions,
  trustProxy?: false | number | string[],
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createFastifyAdapter({ logger: options?.logger !== false, trustProxy }),
    // rawBody: signed webhooks are verified against the exact bytes (req.rawBody).
    { ...options, rawBody: true },
  );
  return configureApp(app);
}
