import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { SESSION_COOKIE } from '@influency/shared';
import { sha256hex } from './crypto.js';
import { DomainError } from './domain-error.js';
import { PrismaService } from './prisma.service.js';

export interface AuthSession {
  sessionId: string;
  userId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `SessionGuard`. Not `session`, to avoid clashing with @fastify/session typings. */
    authSession?: AuthSession;
  }
}

/** Requires a live session: not revoked, not expired (server time), active user. Else 401 AUTH_REQUIRED. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(protected readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const token = req.cookies[SESSION_COOKIE];
    if (!token) throw new DomainError('AUTH_REQUIRED');
    const session = await this.prisma.session.findFirst({
      where: {
        tokenHash: sha256hex(token),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { status: 'ACTIVE' },
      },
      select: { id: true, userId: true },
    });
    if (!session) throw new DomainError('AUTH_REQUIRED');
    req.authSession = { sessionId: session.id, userId: session.userId };
    return true;
  }
}

/** Public routes: sets `req.authSession` for a live session, otherwise continues anonymously. */
@Injectable()
export class OptionalSessionGuard extends SessionGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    try {
      await super.canActivate(ctx);
    } catch (err) {
      if (!(err instanceof DomainError && err.code === 'AUTH_REQUIRED')) throw err;
    }
    return true;
  }
}
