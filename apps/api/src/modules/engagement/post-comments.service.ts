import { Inject, Injectable } from '@nestjs/common';
import {
  type CreatePostCommentInput,
  POST_COMMENTS_PAGE_SIZE,
  type PostComment,
  type PostCommentList,
  type PostStatus,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { PostAccess } from '../entitlements/post-access.js';
import { PostAccessService } from '../entitlements/post-access.service.js';
import { canEngage } from './post-likes.service.js';

const commentFields = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { displayName: true } },
} as const;

type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  user: { displayName: string };
};

/** Never exposes user ids; canDelete = author or post owner. */
function toComment(row: CommentRow, canDelete: boolean): PostComment {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { displayName: row.user.displayName },
    canDelete,
  };
}

/** Comments (US-052): plain text, oldest first, soft-deleted only. */
@Injectable()
export class PostCommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** hidden → NOT_FOUND, not published → POST_NOT_AVAILABLE, locked without the policy flag → FORBIDDEN. */
  private async gate(
    postId: string,
    userId: string | null,
    allowWithoutAccess: boolean,
  ): Promise<{ access: Exclude<PostAccess, 'hidden'>; status: PostStatus; ownerUserId: string }> {
    const access = await this.access.check(postId, userId);
    if (access === 'hidden') throw new DomainError('NOT_FOUND');
    const post = await this.loadPost(postId);
    if (post.status !== 'PUBLISHED') throw new DomainError('POST_NOT_AVAILABLE');
    if (!canEngage(access, post.status, allowWithoutAccess)) throw new DomainError('FORBIDDEN');
    return { access, status: post.status, ownerUserId: post.creatorProfile.userId };
  }

  private async loadPost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true, creatorProfile: { select: { userId: true } } },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    return post;
  }

  /** userId from the session only (null = anonymous). cursor = last id of the previous page. */
  async list(postId: string, userId: string | null, cursor?: string): Promise<PostCommentList> {
    const { access, status, ownerUserId } = await this.gate(
      postId,
      userId,
      this.env.PREMIUM_COMMENTS_READ_WITHOUT_ACCESS,
    );
    const rows = await this.prisma.postComment.findMany({
      where: { postId, deletedAt: null, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' },
      take: POST_COMMENTS_PAGE_SIZE + 1,
      select: commentFields,
    });
    const page = rows.slice(0, POST_COMMENTS_PAGE_SIZE);
    return {
      items: page.map((row) =>
        toComment(row, userId !== null && (row.userId === userId || ownerUserId === userId)),
      ),
      nextCursor: rows.length > POST_COMMENTS_PAGE_SIZE ? page.at(-1)!.id : null,
      canComment:
        userId !== null &&
        canEngage(access, status, this.env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS),
    };
  }

  async create(
    postId: string,
    userId: string,
    input: CreatePostCommentInput,
  ): Promise<PostComment> {
    await this.gate(postId, userId, this.env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS);
    // Deleted comments count too, so deleting does not free quota.
    // shortcut: count-then-insert can overshoot under concurrency; move to Redis/advisory lock if abused.
    const recent = await this.prisma.postComment.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= this.env.COMMENT_RATE_LIMIT_PER_MINUTE) throw new DomainError('RATE_LIMITED');
    // shortcut: no post-row lock; a comment racing an archive is invisible (post not PUBLISHED) and non-financial.
    const row = await this.prisma.postComment.create({
      data: { postId, userId, body: input.body },
      select: commentFields,
    });
    return toComment(row, true);
  }

  /** Author or post owner; works on any post the caller can still see (e.g. the owner's archived post). */
  async delete(postId: string, commentId: string, userId: string): Promise<void> {
    if ((await this.access.check(postId, userId)) === 'hidden') throw new DomainError('NOT_FOUND');
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, postId, deletedAt: null },
      select: { userId: true },
    });
    if (!comment) throw new DomainError('NOT_FOUND');
    const post = await this.loadPost(postId);
    if (comment.userId !== userId && post.creatorProfile.userId !== userId) {
      throw new DomainError('FORBIDDEN');
    }
    // deletedAt: null makes a concurrent second delete a no-op.
    await this.prisma.postComment.updateMany({
      where: { id: commentId, deletedAt: null },
      data: { deletedAt: new Date(), deletedByUserId: userId },
    });
  }
}
