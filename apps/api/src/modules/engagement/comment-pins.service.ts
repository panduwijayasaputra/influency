import { Injectable } from '@nestjs/common';
import type { CommentPinResponse } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PostAccessService } from '../entitlements/post-access.service.js';
import { lockAnyPost } from '../posts/posts.service.js';

/**
 * Pinned comment (US-020): at most one per post (partial unique index), top-level only (CHECK), set by the
 * post's creator only. Pin and replace run in one transaction under the post-row lock.
 * shortcut: no rate limit; pins are creator-only and idempotent.
 */
@Injectable()
export class CommentPinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
  ) {}

  /** hidden → NOT_FOUND, not PUBLISHED → POST_NOT_AVAILABLE, not the creator → FORBIDDEN. Runs before any comment lookup. */
  private async assertOwner(postId: string, userId: string): Promise<void> {
    if ((await this.access.check(postId, userId)) === 'hidden') throw new DomainError('NOT_FOUND');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true, creatorProfile: { select: { userId: true } } },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    if (post.status !== 'PUBLISHED') throw new DomainError('POST_NOT_AVAILABLE');
    if (post.creatorProfile.userId !== userId) throw new DomainError('FORBIDDEN');
  }

  async pin(postId: string, commentId: string, userId: string): Promise<CommentPinResponse> {
    await this.assertOwner(postId, userId);
    return this.prisma.$transaction(async (tx) => {
      await lockAnyPost(tx, postId);
      const comment = await tx.postComment.findFirst({
        where: { id: commentId, postId, deletedAt: null },
        select: { parentId: true },
      });
      if (!comment) throw new DomainError('NOT_FOUND');
      if (comment.parentId !== null) throw new DomainError('COMMENT_NOT_PINNABLE');
      await tx.postComment.updateMany({
        where: { postId, pinnedAt: { not: null }, id: { not: commentId } },
        data: { pinnedAt: null },
      });
      // Conditional: a delete that committed meanwhile matches nothing.
      await tx.postComment.updateMany({
        where: { id: commentId, deletedAt: null, pinnedAt: null },
        data: { pinnedAt: new Date() },
      });
      const after = await tx.postComment.findUniqueOrThrow({
        where: { id: commentId },
        select: { pinnedAt: true, deletedAt: true },
      });
      // A delete won the race: roll back, including the cleared old pin.
      if (after.deletedAt !== null || after.pinnedAt === null) throw new DomainError('NOT_FOUND');
      return { pinned: true };
    });
  }

  async unpin(postId: string, commentId: string, userId: string): Promise<CommentPinResponse> {
    await this.assertOwner(postId, userId);
    return this.prisma.$transaction(async (tx) => {
      await lockAnyPost(tx, postId);
      const comment = await tx.postComment.findFirst({
        where: { id: commentId, postId, deletedAt: null },
        select: { id: true },
      });
      if (!comment) throw new DomainError('NOT_FOUND');
      await tx.postComment.updateMany({
        where: { id: commentId, pinnedAt: { not: null } },
        data: { pinnedAt: null },
      });
      return { pinned: false };
    });
  }
}
