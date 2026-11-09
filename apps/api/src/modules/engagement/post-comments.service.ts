import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreatePostCommentInput,
  POST_COMMENT_REPLIES_PAGE_SIZE,
  POST_COMMENT_REPLIES_PREVIEW,
  POST_COMMENTS_PAGE_SIZE,
  type PostComment,
  type PostCommentList,
  type PostReply,
  type PostReplyList,
  type PostStatus,
  type UpdatePostCommentInput,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { PostAccess } from '../entitlements/post-access.js';
import { PostAccessService } from '../entitlements/post-access.service.js';
import { NotificationProducer } from '../notifications/notification-producer.service.js';
import { encodeTopCursor, TOP_ORDER, topCursorWhere } from './comment-order.js';
import { canEngage } from './post-likes.service.js';

const commentFields = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  likeCount: true,
  editedAt: true,
  user: { select: { displayName: true } },
} as const;

/** What a top-level list row selects: a reply's fields plus the thread (live replyCount, first replies). */
const topFields = {
  ...commentFields,
  deletedAt: true,
  pinnedAt: true,
  _count: { select: { replies: { where: { deletedAt: null } } } },
  replies: {
    where: { deletedAt: null },
    orderBy: { id: 'asc' },
    take: POST_COMMENT_REPLIES_PREVIEW,
    select: commentFields,
  },
} as const;

type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  userId: string;
  likeCount: number;
  editedAt: Date | null;
  user: { displayName: string };
};
type TopRow = CommentRow & {
  deletedAt: Date | null;
  pinnedAt: Date | null;
  _count: { replies: number };
  replies: CommentRow[];
};

/** Never exposes user ids. The can* flags are for the current viewer (null = anonymous). */
function mapReply(
  row: CommentRow,
  viewerId: string | null,
  ownerUserId: string,
  isAdmin: boolean,
  liked: ReadonlySet<string>,
): PostReply {
  const isAuthor = viewerId !== null && row.userId === viewerId;
  const isOwner = viewerId !== null && ownerUserId === viewerId;
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { displayName: row.user.displayName },
    canDelete: isAuthor || isOwner || isAdmin, // moderation never grants edit (canEdit) or pin
    canEdit: isAuthor,
    canPin: false, // replies cannot be pinned
    likeCount: row.likeCount,
    liked: liked.has(row.id),
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}

/** A new top-level comment, or a live one in a list. */
function mapTop(
  row: TopRow,
  viewerId: string | null,
  ownerUserId: string,
  isAdmin: boolean,
  liked: ReadonlySet<string>,
): PostComment {
  const replies = row.replies.map((r) => mapReply(r, viewerId, ownerUserId, isAdmin, liked));
  const thread = { replyCount: row._count.replies, replies };
  if (row.deletedAt) {
    // Deleted text, author and avatar never leave the server (CMT-08); only the id and time survive.
    return {
      id: row.id,
      body: '',
      createdAt: row.createdAt.toISOString(),
      author: { displayName: '' },
      deleted: true,
      canDelete: false,
      canEdit: false,
      canPin: false,
      pinned: false,
      likeCount: 0,
      liked: false,
      ...thread,
    };
  }
  const isOwner = viewerId !== null && ownerUserId === viewerId;
  return {
    ...mapReply(row, viewerId, ownerUserId, isAdmin, liked),
    canPin: isOwner,
    pinned: row.pinnedAt !== null,
    ...thread,
  };
}

/** Comments (US-052): plain text, Top order, one level of replies, soft-deleted only. */
@Injectable()
export class PostCommentsService {
  private readonly logger = new Logger(PostCommentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    @Inject(ENV) private readonly env: Env,
    private readonly notifications: NotificationProducer,
  ) {}

  /**
   * Reply/like notification for the author of comment `authorOf` (US-072), after the change committed. Only when that
   * author can fully access the post, so nobody is pointed at a locked post's private thread. Never throws.
   */
  async notifyCommentAuthor(e: {
    type: 'COMMENT_REPLY' | 'COMMENT_LIKE';
    postId: string;
    authorOf: string;
    commentId: string;
    actorUserId: string;
    dedupeKey: string;
  }): Promise<void> {
    try {
      const target = await this.prisma.postComment.findUnique({
        where: { id: e.authorOf },
        select: { userId: true, post: { select: { creatorProfileId: true } } },
      });
      if (!target || target.userId === e.actorUserId) return;
      if ((await this.access.check(e.postId, target.userId)) !== 'full') return;
      await this.notifications.notify({
        userId: target.userId,
        type: e.type,
        dedupeKey: e.dedupeKey,
        actorUserId: e.actorUserId,
        creatorProfileId: target.post.creatorProfileId,
        postId: e.postId,
        commentId: e.commentId,
      });
    } catch (err) {
      this.logger.warn(`notification ${e.type} skipped: ${(err as Error).message}`);
    }
  }

  /** hidden → NOT_FOUND, not published → POST_NOT_AVAILABLE, locked without the policy flag → FORBIDDEN. */
  async gate(
    postId: string,
    userId: string | null,
    allowWithoutAccess: boolean,
  ): Promise<{
    access: Exclude<PostAccess, 'hidden'>;
    status: PostStatus;
    ownerUserId: string;
    isAdmin: boolean;
  }> {
    const access = await this.access.check(postId, userId);
    if (access === 'hidden') throw new DomainError('NOT_FOUND');
    const post = await this.loadPost(postId);
    if (post.status !== 'PUBLISHED') throw new DomainError('POST_NOT_AVAILABLE');
    if (!canEngage(access, post.status, allowWithoutAccess)) throw new DomainError('FORBIDDEN');
    const isAdmin = await this.isAdmin(userId);
    return { access, status: post.status, ownerUserId: post.creatorProfile.userId, isAdmin };
  }

  /** Server-side role only (never request data). Guests are never admins. */
  private async isAdmin(userId: string | null): Promise<boolean> {
    if (userId === null) return false;
    const role = await this.prisma.userRole.findUnique({
      where: { userId_role: { userId, role: 'ADMIN' } },
      select: { userId: true },
    });
    return role !== null;
  }

  private async loadPost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true, creatorProfile: { select: { userId: true } } },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    return post;
  }

  /** Which of these comments the viewer liked: one query per response, none for a guest. */
  private async likedIds(userId: string | null, ids: string[]): Promise<Set<string>> {
    if (userId === null || ids.length === 0) return new Set();
    const rows = await this.prisma.commentLike.findMany({
      where: { userId, commentId: { in: ids } },
      select: { commentId: true },
    });
    return new Set(rows.map((r) => r.commentId));
  }

  /** userId from the session only (null = anonymous). cursor = last id of the previous page. */
  async list(postId: string, userId: string | null, cursor?: string): Promise<PostCommentList> {
    const { access, status, ownerUserId, isAdmin } = await this.gate(
      postId,
      userId,
      this.env.PREMIUM_COMMENTS_READ_WITHOUT_ACCESS,
    );
    // The pinned comment (US-020) leads the first page and is left out of the Top query on every page, so it
    // never repeats and the keyset cursor is unaffected. It takes one slot, so a page stays at PAGE_SIZE.
    const pinned = cursor
      ? null
      : await this.prisma.postComment.findFirst({
          where: { postId, parentId: null, deletedAt: null, pinnedAt: { not: null } },
          select: topFields,
        });
    const size = POST_COMMENTS_PAGE_SIZE - (pinned ? 1 : 0);
    // A deleted comment stays (as a placeholder) only while it still has a live reply (CMT-08/09).
    const rows = await this.prisma.postComment.findMany({
      where: {
        postId,
        parentId: null,
        pinnedAt: null,
        OR: [{ deletedAt: null }, { replies: { some: { deletedAt: null } } }],
        ...(cursor && { AND: topCursorWhere(cursor) }),
      },
      orderBy: [...TOP_ORDER],
      take: size + 1,
      select: topFields,
    });
    const page = rows.slice(0, size);
    const shown = pinned ? [pinned, ...page] : page;
    const liked = await this.likedIds(
      userId,
      shown.flatMap((row) => [row.id, ...row.replies.map((r) => r.id)]),
    );
    return {
      items: shown.map((row) => mapTop(row, userId, ownerUserId, isAdmin, liked)),
      nextCursor: rows.length > size ? encodeTopCursor(page.at(-1)!) : null,
      canComment:
        userId !== null &&
        canEngage(access, status, this.env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS),
    };
  }

  /** Replies after `cursor` (a reply id), oldest first. The parent may be a deleted placeholder. */
  async listReplies(
    postId: string,
    commentId: string,
    userId: string | null,
    cursor?: string,
  ): Promise<PostReplyList> {
    const { access, status, ownerUserId, isAdmin } = await this.gate(
      postId,
      userId,
      this.env.PREMIUM_COMMENTS_READ_WITHOUT_ACCESS,
    );
    const parent = await this.prisma.postComment.findFirst({
      where: { id: commentId, postId, parentId: null },
      select: { id: true },
    });
    if (!parent) throw new DomainError('NOT_FOUND');
    const rows = await this.prisma.postComment.findMany({
      where: { parentId: commentId, deletedAt: null, ...(cursor && { id: { gt: cursor } }) },
      orderBy: { id: 'asc' },
      take: POST_COMMENT_REPLIES_PAGE_SIZE + 1,
      select: commentFields,
    });
    const page = rows.slice(0, POST_COMMENT_REPLIES_PAGE_SIZE);
    const liked = await this.likedIds(
      userId,
      page.map((row) => row.id),
    );
    return {
      items: page.map((row) => mapReply(row, userId, ownerUserId, isAdmin, liked)),
      nextCursor: rows.length > POST_COMMENT_REPLIES_PAGE_SIZE ? page.at(-1)!.id : null,
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
    const { ownerUserId, isAdmin } = await this.gate(
      postId,
      userId,
      this.env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS,
    );
    // Deleted comments count too, so deleting does not free quota.
    // shortcut: count-then-insert can overshoot under concurrency; move to Redis/advisory lock if abused.
    const recent = await this.prisma.postComment.count({
      where: { userId, createdAt: { gte: new Date(Date.now() - 60_000) } },
    });
    if (recent >= this.env.COMMENT_RATE_LIMIT_PER_MINUTE) throw new DomainError('RATE_LIMITED');
    // A reply to a reply goes under the same top-level parent (one level only).
    let parentId: string | null = null;
    if (input.parentId) {
      const parent = await this.prisma.postComment.findFirst({
        where: { id: input.parentId, postId, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!parent) throw new DomainError('NOT_FOUND');
      parentId = parent.parentId ?? parent.id;
    }
    const repliedTo = input.parentId ?? null;
    // shortcut: no post-row lock; a comment racing an archive is invisible (post not PUBLISHED) and non-financial.
    // shortcut: a reply racing its parent's delete attaches to a now-deleted parent and shows under the placeholder.
    const row = await this.prisma.postComment.create({
      data: { postId, userId, body: input.body, parentId },
      select: commentFields,
    });
    if (repliedTo) {
      // The author of the comment that was answered (also when it is itself a reply).
      await this.notifyCommentAuthor({
        type: 'COMMENT_REPLY',
        postId,
        authorOf: repliedTo,
        commentId: row.id,
        actorUserId: userId,
        dedupeKey: `reply:${row.id}`,
      });
    }
    const none = new Set<string>(); // a new comment is never liked yet
    if (parentId) return mapReply(row, userId, ownerUserId, isAdmin, none);
    return mapTop(
      { ...row, deletedAt: null, pinnedAt: null, _count: { replies: 0 }, replies: [] },
      userId,
      ownerUserId,
      isAdmin,
      none,
    );
  }

  /**
   * Author only, any time (no creator/admin override). Needs the same access as writing a comment, so an
   * author who lost access to a premium post cannot edit. An unchanged text is a no-op (no "Diedit").
   * Returns the flat reply shape; the caller merges only `body` and `editedAt`.
   */
  async edit(
    postId: string,
    commentId: string,
    userId: string,
    input: UpdatePostCommentInput,
  ): Promise<PostReply> {
    const { ownerUserId, isAdmin } = await this.gate(
      postId,
      userId,
      this.env.PREMIUM_COMMENTS_WRITE_WITHOUT_ACCESS,
    );
    const row = await this.prisma.postComment.findFirst({
      where: { id: commentId, postId, deletedAt: null },
      select: commentFields,
    });
    if (!row) throw new DomainError('NOT_FOUND');
    if (row.userId !== userId) throw new DomainError('FORBIDDEN');
    const none = new Set<string>(); // the caller does not use `liked` from an edit response
    if (row.body === input.body) return mapReply(row, userId, ownerUserId, isAdmin, none);
    // shortcut: edits are not rate-limited; add a limit if abused.
    // deletedAt: null makes an edit racing a delete a 404, never a change to deleted text.
    const { count } = await this.prisma.postComment.updateMany({
      where: { id: commentId, userId, deletedAt: null },
      data: { body: input.body, editedAt: new Date() },
    });
    if (count === 0) throw new DomainError('NOT_FOUND');
    const updated = await this.prisma.postComment.findUniqueOrThrow({
      where: { id: commentId },
      select: commentFields,
    });
    return mapReply(updated, userId, ownerUserId, isAdmin, none);
  }

  /**
   * Author, post owner or admin (role read from the DB); works on any post the caller can still see (an admin
   * sees every post). Deleting someone else's comment writes an append-only audit row in the same transaction.
   */
  async delete(postId: string, commentId: string, userId: string): Promise<void> {
    if ((await this.access.check(postId, userId)) === 'hidden') throw new DomainError('NOT_FOUND');
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, postId, deletedAt: null },
      select: { userId: true },
    });
    if (!comment) throw new DomainError('NOT_FOUND');
    const post = await this.loadPost(postId);
    const isAuthor = comment.userId === userId;
    const isAdmin = await this.isAdmin(userId);
    if (!isAuthor && post.creatorProfile.userId !== userId && !isAdmin) {
      throw new DomainError('FORBIDDEN');
    }
    await this.prisma.$transaction(async (tx) => {
      // deletedAt: null makes a concurrent second delete a no-op. Deleting also clears the pin in the same statement (CMT-12).
      const { count } = await tx.postComment.updateMany({
        where: { id: commentId, deletedAt: null },
        data: { deletedAt: new Date(), deletedByUserId: userId, pinnedAt: null },
      });
      // Only the winning delete of someone else's comment is audited. ADMIN wins over CREATOR.
      if (count === 1 && !isAuthor) {
        await tx.commentModerationAction.create({
          data: { commentId, postId, actorId: userId, actorRole: isAdmin ? 'ADMIN' : 'CREATOR' },
        });
      }
    });
  }
}
