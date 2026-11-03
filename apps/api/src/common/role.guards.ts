import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { DomainError } from './domain-error.js';
import { SessionGuard } from './session.guard.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `ApprovedCreatorGuard`: the caller's APPROVED creator profile id. */
    creatorProfileId?: string;
  }
}

/** Live session (401 AUTH_REQUIRED) + ADMIN row in user_roles, read now from the DB (403 FORBIDDEN). */
@Injectable()
export class AdminGuard extends SessionGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const role = await this.prisma.userRole.findUnique({
      where: { userId_role: { userId: req.authSession!.userId, role: 'ADMIN' } },
      select: { id: true },
    });
    if (!role) throw new DomainError('FORBIDDEN');
    return true;
  }
}

/** Live session (401 AUTH_REQUIRED) + APPROVED creator profile (403 CREATOR_NOT_APPROVED); sets req.creatorProfileId. */
@Injectable()
export class ApprovedCreatorGuard extends SessionGuard {
  override async canActivate(ctx: ExecutionContext): Promise<boolean> {
    await super.canActivate(ctx);
    const req = ctx.switchToHttp().getRequest<FastifyRequest>();
    const profile = await this.prisma.creatorProfile.findFirst({
      where: { userId: req.authSession!.userId, status: 'APPROVED' },
      select: { id: true },
    });
    if (!profile) throw new DomainError('CREATOR_NOT_APPROVED');
    req.creatorProfileId = profile.id;
    return true;
  }
}
