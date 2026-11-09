import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { decidePostAccess, type PostAccess } from './post-access.js';
import { PaidAccessService } from './paid-access.service.js';

/** Loads the access facts of a post from the DB and applies `decidePostAccess`. */
@Injectable()
export class PostAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paidAccess: PaidAccessService,
  ) {}

  /** userId must be `req.authSession?.userId ?? null`: never a client-supplied value. */
  async check(postId: string, userId: string | null): Promise<PostAccess> {
    const [post, adminRole] = await Promise.all([
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          id: true,
          creatorProfileId: true,
          status: true,
          visibility: true,
          creatorProfile: {
            select: { userId: true, status: true, user: { select: { status: true } } },
          },
        },
      }),
      userId
        ? this.prisma.userRole.findUnique({
            where: { userId_role: { userId, role: 'ADMIN' } },
            select: { id: true },
          })
        : null,
    ]);
    if (!post) return 'hidden';
    const creator = post.creatorProfile;
    const paid = (await this.paidAccess.paidPostIds(userId, [post])).has(post.id);
    return decidePostAccess(
      {
        status: post.status,
        visibility: post.visibility,
        ownerUserId: creator.userId,
        creatorPublic:
          creator.status === PUBLIC_CREATOR.status &&
          creator.user.status === PUBLIC_CREATOR.user.status,
        paid,
      },
      userId ? { userId, isAdmin: adminRole !== null } : null,
    );
  }
}
