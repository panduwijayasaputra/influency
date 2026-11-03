import { Inject, Injectable } from '@nestjs/common';
import type { PostLikeResponse, PostStatus } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { PostAccess } from '../entitlements/post-access.js';
import { PostAccessService } from '../entitlements/post-access.service.js';

/** The like/comment rule (US-051/US-052): published, and access or the TBD policy flag. Also the detail view's `canLike`. */
export function canEngage(
  access: Exclude<PostAccess, 'hidden'>,
  status: PostStatus,
  allowWithoutAccess: boolean,
): boolean {
  return status === 'PUBLISHED' && (access === 'full' || allowWithoutAccess);
}

/** Likes: one row per (post, user); counts are COUNT(*) over the unique index. */
@Injectable()
export class PostLikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** userId from the session only. hidden → NOT_FOUND, not published → POST_NOT_AVAILABLE, locked → FORBIDDEN. */
  private async assertCanLike(postId: string, userId: string): Promise<void> {
    const access = await this.access.check(postId, userId);
    if (access === 'hidden') throw new DomainError('NOT_FOUND');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true },
    });
    if (post?.status !== 'PUBLISHED') throw new DomainError('POST_NOT_AVAILABLE');
    if (!canEngage(access, post.status, this.env.PREMIUM_LIKES_WITHOUT_ACCESS)) {
      throw new DomainError('FORBIDDEN');
    }
  }

  async like(postId: string, userId: string): Promise<PostLikeResponse> {
    await this.assertCanLike(postId, userId);
    // shortcut: no post-row lock; a like racing an archive is harmless (post invisible, non-financial).
    await this.prisma.postLike.createMany({ data: [{ postId, userId }], skipDuplicates: true });
    return { liked: true, likeCount: await this.count(postId) };
  }

  async unlike(postId: string, userId: string): Promise<PostLikeResponse> {
    await this.assertCanLike(postId, userId);
    await this.prisma.postLike.deleteMany({ where: { postId, userId } });
    return { liked: false, likeCount: await this.count(postId) };
  }

  private count(postId: string): Promise<number> {
    return this.prisma.postLike.count({ where: { postId } });
  }
}
