import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { HttpAdapterHost, Reflector } from '@nestjs/core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from './domain-error.js';

export interface RateLimitOptions {
  max: number;
  /** @fastify/rate-limit duration, e.g. '1 minute'. */
  timeWindow: string;
}

/** Per-handler limit enforced by `RateLimitGuard`. */
export const RateLimit = Reflector.createDecorator<RateLimitOptions>();

type Limiter = ReturnType<FastifyInstance['createRateLimit']>;

/**
 * Applies `@RateLimit(...)` through @fastify/rate-limit (registered with `global: false` in configureApp), so the
 * error goes through AllExceptionsFilter as 429 RATE_LIMITED. List it after the session guard: the key is the
 * session's user, else the client IP.
 */
// shortcut: in-memory store per process; switch to the Redis store in Phase 5 (several API instances).
// shortcut: without Fastify `trustProxy`, req.ip is the web proxy's IP, so anonymous callers share one bucket; set it once the deploy topology is fixed.
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiters = new Map<unknown, Limiter>();

  constructor(
    private readonly reflector: Reflector,
    private readonly adapterHost: HttpAdapterHost,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get(RateLimit, ctx.getHandler());
    if (!options) return true;
    const http = ctx.switchToHttp();
    const req = http.getRequest<FastifyRequest>();
    const result = await this.limiter(ctx.getHandler(), options)(req);
    if (!result.isAllowed && result.isExceeded) {
      void http.getResponse<FastifyReply>().header('retry-after', result.ttlInSeconds);
      throw new DomainError('RATE_LIMITED');
    }
    return true;
  }

  /** One limiter (and store) per handler, created on first use: the plugin's decorator exists only after ready(). */
  private limiter(handler: unknown, options: RateLimitOptions): Limiter {
    let limiter = this.limiters.get(handler);
    if (!limiter) {
      limiter = this.adapterHost.httpAdapter.getInstance<FastifyInstance>().createRateLimit({
        ...options,
        keyGenerator: (req) => req.authSession?.userId ?? req.ip,
      });
      this.limiters.set(handler, limiter);
    }
    return limiter;
  }
}
