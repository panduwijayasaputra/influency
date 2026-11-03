import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '@influency/shared';
import { DomainError } from './domain-error.js';
import { ENV, type Env } from './env.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** CSRF: a cookie-authenticated mutation must come from the web origin (handoff §12.1). */
@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly webOrigin: string;

  constructor(@Inject(ENV) env: Env) {
    this.webOrigin = new URL(env.WEB_ORIGIN).origin;
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (SAFE_METHODS.has(req.method)) return true;
    // No session cookie → the request can't act as anyone (e.g. provider webhooks).
    if (!req.cookies[SESSION_COOKIE]) return true;
    if (req.headers.origin === this.webOrigin) return true;
    throw new DomainError('FORBIDDEN');
  }
}
