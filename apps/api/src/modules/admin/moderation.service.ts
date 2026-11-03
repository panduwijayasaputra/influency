import { Injectable, Logger } from '@nestjs/common';
import {
  MODERATION_QUEUE_LIMIT,
  type ModerationPostAction,
  type ModerationPostResult,
  type ModerationQueueItem,
  type ModerationUserResult,
  type PostStatus,
  type UserStatus,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { ModerationActionType } from '../../generated/prisma/client.js';
import { lockAnyPost } from '../posts/posts.service.js';

const OPEN = { resolvedByActionId: null };
const NEWEST_REPORTS = 5;

const ACTION_TYPE = {
  dismiss: 'DISMISS',
  hide: 'HIDE',
  unhide: 'UNHIDE',
  remove: 'REMOVE',
} as const satisfies Record<ModerationPostAction, ModerationActionType>;

/**
 * Moderation (US-042). Actions only change posts.status / users.status and append moderation_actions rows:
 * offers, media, likes, comments and any finance rows are never touched.
 */
@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Posts with open reports, oldest open report first. */
  async queue(): Promise<ModerationQueueItem[]> {
    // shortcut: first MODERATION_QUEUE_LIMIT posts only; add cursor paging when the queue gets long.
    const groups = await this.prisma.postReport.groupBy({
      by: ['postId'],
      where: OPEN,
      _count: { _all: true },
      _min: { createdAt: true },
      orderBy: { _min: { createdAt: 'asc' } },
      take: MODERATION_QUEUE_LIMIT,
    });
    if (groups.length === 0) return [];
    const postIds = groups.map((g) => g.postId);
    const [posts, reasons] = await Promise.all([
      this.prisma.post.findMany({
        where: { id: { in: postIds } },
        select: {
          id: true,
          status: true,
          visibility: true,
          caption: true,
          creatorProfile: {
            select: {
              userId: true,
              slug: true,
              displayName: true,
              user: { select: { status: true } },
            },
          },
          reports: {
            where: OPEN,
            orderBy: { createdAt: 'desc' },
            take: NEWEST_REPORTS,
            select: {
              reason: true,
              note: true,
              createdAt: true,
              reporter: { select: { displayName: true } },
            },
          },
        },
      }),
      this.prisma.postReport.groupBy({
        by: ['postId', 'reason'],
        where: { ...OPEN, postId: { in: postIds } },
        _count: { _all: true },
      }),
    ]);
    const byId = new Map(posts.map((p) => [p.id, p]));
    return groups.map((g) => {
      const post = byId.get(g.postId)!;
      const creator = post.creatorProfile;
      return {
        post: {
          id: post.id,
          status: post.status,
          visibility: post.visibility,
          caption: post.caption,
        },
        creator: {
          userId: creator.userId,
          slug: creator.slug,
          displayName: creator.displayName,
          userStatus: creator.user.status,
        },
        openReportCount: g._count._all,
        reasons: reasons
          .filter((r) => r.postId === g.postId)
          .map((r) => ({ reason: r.reason, count: r._count._all }))
          .sort((a, b) => b.count - a.count),
        reports: post.reports.map((r) => ({
          reason: r.reason,
          note: r.note,
          reporterDisplayName: r.reporter.displayName,
          createdAt: r.createdAt.toISOString(),
        })),
        firstReportedAt: g._min.createdAt!.toISOString(),
      };
    });
  }

  /**
   * One transaction under the post-row lock: status check after the lock, status change, action row, and every
   * open report of the post resolved by that action. Concurrent conflicting actions get POST_STATUS_CONFLICT.
   */
  async actOnPost(
    postId: string,
    adminId: string,
    action: ModerationPostAction,
    note: string | undefined,
  ): Promise<ModerationPostResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const { status } = await lockAnyPost(tx, postId);
      let next: PostStatus = status;
      if (action === 'hide') {
        if (status !== 'PUBLISHED') throw new DomainError('POST_STATUS_CONFLICT');
        next = 'PENDING_REVIEW';
      } else if (action === 'unhide') {
        // Only undo an admin hide, never approve a first-publish review (POST_MODERATION_REQUIRED).
        const last = await tx.moderationAction.findFirst({
          where: { postId },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: { action: true },
        });
        if (status !== 'PENDING_REVIEW' || last?.action !== 'HIDE') {
          throw new DomainError('POST_STATUS_CONFLICT');
        }
        next = 'PUBLISHED';
      } else if (action === 'remove') {
        if (status === 'REMOVED') throw new DomainError('POST_STATUS_CONFLICT');
        next = 'REMOVED';
      }
      if (next !== status) await tx.post.update({ where: { id: postId }, data: { status: next } });
      const { id } = await tx.moderationAction.create({
        data: { adminId, action: ACTION_TYPE[action], postId, note: note || null },
        select: { id: true },
      });
      const { count } = await tx.postReport.updateMany({
        where: { ...OPEN, postId },
        data: { resolvedByActionId: id },
      });
      return { postId, status: next, resolvedReports: count };
    });
    this.logger.log(`moderation admin=${adminId} post=${postId} action=${action}`);
    return result;
  }

  /**
   * Account suspension for users and creators (SessionGuard and PUBLIC_CREATOR already act on users.status).
   * The conditional UPDATE makes concurrent changes safe: only one sees the expected status.
   */
  async setUserStatus(
    userId: string,
    adminId: string,
    to: UserStatus,
    note: string | undefined,
  ): Promise<ModerationUserResult> {
    const from: UserStatus = to === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    await this.prisma.$transaction(async (tx) => {
      if (to === 'SUSPENDED') {
        const admin = await tx.userRole.findUnique({
          where: { userId_role: { userId, role: 'ADMIN' } },
          select: { id: true },
        });
        if (userId === adminId || admin) throw new DomainError('CANNOT_SUSPEND_ADMIN');
      }
      const { count } = await tx.user.updateMany({
        where: { id: userId, status: from },
        data: { status: to },
      });
      if (count === 0) {
        const exists = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
        throw new DomainError(exists ? 'USER_STATUS_CONFLICT' : 'NOT_FOUND');
      }
      await tx.moderationAction.create({
        data: {
          adminId,
          action: to === 'SUSPENDED' ? 'SUSPEND_USER' : 'UNSUSPEND_USER',
          targetUserId: userId,
          note: note || null,
        },
      });
    });
    this.logger.log(`moderation admin=${adminId} user=${userId} status=${to}`);
    return { userId, status: to };
  }
}
