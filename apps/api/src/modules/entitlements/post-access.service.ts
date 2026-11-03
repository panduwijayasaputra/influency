import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { decidePostAccess, type PostAccess } from './post-access.js';

/** Loads the access facts of a post from the DB and applies `decidePostAccess`. */
@Injectable()
export class PostAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /** userId must be `req.authSession?.userId ?? null`: never a client-supplied value. */
  async check(postId: string, userId: string | null): Promise<PostAccess> {
    const [post, adminRole] = await Promise.all([
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
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
    return decidePostAccess(
      {
        status: post.status,
        visibility: post.visibility,
        ownerUserId: creator.userId,
        creatorPublic:
          creator.status === PUBLIC_CREATOR.status &&
          creator.user.status === PUBLIC_CREATOR.user.status,
      },
      userId ? { userId, isAdmin: adminRole !== null } : null,
    );
  }
}
