import { Inject, Injectable } from '@nestjs/common';
import {
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationItem,
  type NotificationsPage,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { PrismaService } from '../../common/prisma.service.js';
import { imageUrl } from '../creators/creator-profile.service.js';
import { encodeLedgerCursor, ledgerCursorWhere } from '../wallets/ledger-cursor.js';
import { renderNotification, UNAVAILABLE_TEXT } from './notification-text.js';

const DAY_MS = 86_400_000;
const PUBLIC = { status: 'APPROVED', user: { status: 'ACTIVE' } } as const;
const isPublic = (c: { status: string; user: { status: string } } | null) =>
  c?.status === PUBLIC.status && c.user.status === PUBLIC.user.status;

const include = {
  actor: {
    select: {
      displayName: true,
      creatorProfile: { select: { slug: true, avatarKey: true, status: true } },
    },
  },
  creatorProfile: {
    select: { slug: true, displayName: true, status: true, user: { select: { status: true } } },
  },
  post: {
    select: {
      status: true,
      creatorProfile: { select: { slug: true, status: true, user: { select: { status: true } } } },
    },
  },
} as const;

/** The caller's inbox (US-071). Rows are written only by the producers (US-072); userId always comes from the session. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private since(): Date {
    return new Date(Date.now() - this.env.NOTIFICATION_RETENTION_DAYS * DAY_MS);
  }

  async list(userId: string, cursor: string | null): Promise<NotificationsPage> {
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        createdAt: { gte: this.since() },
        ...(cursor ? ledgerCursorWhere(cursor) : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: NOTIFICATIONS_PAGE_SIZE + 1,
      include,
    });
    const page = rows.slice(0, NOTIFICATIONS_PAGE_SIZE);
    const last = page.at(-1);
    return {
      items: page.map((row) => this.toItem(row)),
      nextCursor: rows.length > NOTIFICATIONS_PAGE_SIZE && last ? encodeLedgerCursor(last) : null,
    };
  }

  /** One notification as its recipient sees it (Telegram delivery, US-074); null when it no longer exists. */
  async render(id: string): Promise<{ userId: string; item: NotificationItem } | null> {
    const row = await this.prisma.notification.findUnique({ where: { id }, include });
    return row ? { userId: row.userId, item: this.toItem(row) } : null;
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, readAt: null, createdAt: { gte: this.since() } },
    });
  }

  /** Marks the caller's notifications up to and including `upToId` as read. Another user's id → 404, nothing changes. */
  async markRead(userId: string, upToId: string): Promise<void> {
    const row = await this.prisma.notification.findFirst({
      where: { id: upToId, userId },
      select: { createdAt: true },
    });
    if (!row) throw new DomainError('NOT_FOUND');
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null, createdAt: { lte: row.createdAt } },
      data: { readAt: new Date() },
    });
  }

  private toItem(row: {
    id: string;
    type: NotificationItem['type'];
    coins: bigint | null;
    postId: string | null;
    readAt: Date | null;
    createdAt: Date;
    actor: {
      displayName: string;
      creatorProfile: { slug: string; avatarKey: string | null; status: string } | null;
    } | null;
    creatorProfile: {
      slug: string;
      displayName: string;
      status: string;
      user: { status: string };
    } | null;
    post: {
      status: string;
      creatorProfile: { slug: string; status: string; user: { status: string } };
    } | null;
  }): NotificationItem {
    // A post link only while the post can still be opened (archived posts stay visible to past buyers).
    const postCreator =
      row.post &&
      ['PUBLISHED', 'ARCHIVED'].includes(row.post.status) &&
      isPublic(row.post.creatorProfile)
        ? row.post.creatorProfile.slug
        : null;
    const creatorSlug = row.post
      ? postCreator
      : isPublic(row.creatorProfile)
        ? row.creatorProfile!.slug
        : null;
    const rendered = renderNotification({
      type: row.type,
      coins: row.coins === null ? null : toSafeInt(row.coins),
      creatorName: row.creatorProfile?.displayName ?? null,
      creatorSlug,
      postId: postCreator ? row.postId : null,
    });
    const actorProfile = row.actor?.creatorProfile;
    return {
      id: row.id,
      type: row.type,
      actor:
        rendered && row.actor
          ? {
              displayName: row.actor.displayName,
              avatarUrl:
                actorProfile?.status === 'APPROVED'
                  ? imageUrl(actorProfile.slug, actorProfile.avatarKey)
                  : null,
            }
          : null,
      text: rendered?.text ?? UNAVAILABLE_TEXT,
      href: rendered?.href ?? '/notifications',
      createdAt: row.createdAt.toISOString(),
      read: row.readAt !== null,
    };
  }
}
