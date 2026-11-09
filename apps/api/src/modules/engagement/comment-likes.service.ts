import { Inject, Injectable } from '@nestjs/common';
import type { CommentLikeResponse } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PostCommentsService } from './post-comments.service.js';

/**
 * Comment likes (US-018): one row per (comment, user). `post_comments.like_count` moves in the same
 * transaction, and only when a row really changed, so the unique index makes it exact under concurrent taps.
 * shortcut: no rate limit; a like is one cheap idempotent row. Add RateLimitGuard if abused.
 */
@Injectable()
export class CommentLikesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly comments: PostCommentsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async like(postId: string, commentId: string, userId: string): Promise<CommentLikeResponse> {
    let added = false;
    const result = await this.run(postId, commentId, userId, async (tx) => {
      const { count } = await tx.commentLike.createMany({
        data: [{ commentId, userId }],
        skipDuplicates: true,
      });
      if (count === 1) {
        // A delete that committed since the check above matches nothing: roll the like back.
        const r = await tx.postComment.updateMany({
          where: { id: commentId, deletedAt: null },
          data: { likeCount: { increment: 1 } },
        });
        if (r.count === 0) throw new DomainError('NOT_FOUND');
        added = true;
      }
      return true;
    });
    // After commit; the key holds the liker, so unlike + like again doesn't notify twice.
    if (added) {
      await this.comments.notifyCommentAuthor({
        type: 'COMMENT_LIKE',
        postId,
        authorOf: commentId,
        commentId,
        actorUserId: userId,
        dedupeKey: `comment-like:${commentId}:${userId}`,
      });
    }
    return result;
  }

  unlike(postId: string, commentId: string, userId: string): Promise<CommentLikeResponse> {
    return this.run(postId, commentId, userId, async (tx) => {
      const { count } = await tx.commentLike.deleteMany({ where: { commentId, userId } });
      if (count === 1) {
        await tx.postComment.updateMany({
          where: { id: commentId, likeCount: { gt: 0 } },
          data: { likeCount: { decrement: 1 } },
        });
      }
      return false;
    });
  }

  /** Access gate first (so a locked post never reveals whether a comment exists), then one transaction. */
  private async run(
    postId: string,
    commentId: string,
    userId: string,
    change: (tx: Tx) => Promise<boolean>,
  ): Promise<CommentLikeResponse> {
    await this.comments.gate(postId, userId, this.env.PREMIUM_COMMENTS_READ_WITHOUT_ACCESS);
    return this.prisma.$transaction(async (tx) => {
      const live = await tx.postComment.findFirst({
        where: { id: commentId, postId, deletedAt: null },
        select: { id: true },
      });
      if (!live) throw new DomainError('NOT_FOUND');
      const liked = await change(tx);
      const { likeCount } = await tx.postComment.findUniqueOrThrow({
        where: { id: commentId },
        select: { likeCount: true },
      });
      return { liked, likeCount };
    });
  }
}

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
