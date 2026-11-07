import { Inject, Injectable } from '@nestjs/common';
import {
  API_PREFIX,
  HOME_FEED_PAGE_SIZE,
  type HomeFeedPage,
  PUBLIC_FEED_LIMIT,
  type PublicPost,
  type PublicPostDetail,
} from '@influency/shared';
import { z } from 'zod';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { MediaKind, Post, PostOffer } from '../../generated/prisma/client.js';
import { imageUrl, PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { canEngage } from '../engagement/post-likes.service.js';
import { decidePostAccess } from '../entitlements/post-access.js';
import { PostAccessService } from '../entitlements/post-access.service.js';
import { encodeFeedCursor, FEED_ORDER, feedCursorWhere } from './feed-order.js';
import { currentOffer, PREVIEW_KEY_PREFIX, previewId } from './posts.service.js';

// Display order = the order GET /posts/:id/media-access returns (createdAt asc).
const readyMedia = {
  media: {
    where: { status: 'READY' },
    orderBy: { createdAt: 'asc' },
    select: { kind: true, durationSeconds: true },
  },
} as const;
const counts = {
  _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
} as const;

type Viewer = PublicPost['viewer'];

/** The viewer's state on a post; null for anonymous viewers. canReport = published and not the viewer's own post. */
function viewerOf(
  userId: string | null,
  liked: boolean,
  canLike: boolean,
  status: Post['status'],
  ownerUserId: string,
): Viewer {
  return userId
    ? { liked, canLike, canReport: status === 'PUBLISHED' && ownerUserId !== userId }
    : null;
}

/** Public fields that don't depend on the viewer (no publishedAt: nullable on the detail view). Media is listed by kind only. */
function publicPostFields(
  row: Post & {
    media: { kind: MediaKind; durationSeconds: number | null }[];
    offers: PostOffer[];
    _count: { likes: number; comments: number };
  },
  slug: string,
): Omit<PublicPost, 'publishedAt' | 'access' | 'viewer'> {
  const offer = row.visibility === 'PREMIUM' ? row.offers[0] : undefined;
  return {
    id: row.id,
    visibility: row.visibility,
    caption: row.caption,
    imageCount: row.media.filter((m) => m.kind === 'IMAGE').length,
    videoCount: row.media.filter((m) => m.kind === 'VIDEO').length,
    offer: offer
      ? {
          // Number() is exact: a DB CHECK caps prices at 1,000 Koin, far below 2^53.
          priceCoins: Number(offer.priceCoins),
        }
      : null,
    previewUrl:
      row.visibility === 'PREMIUM' && row.previewKey
        ? `/${API_PREFIX}/creators/${slug}/posts/${row.id}/preview/${previewId(row.previewKey)}`
        : null,
    likeCount: row._count.likes,
    commentCount: row._count.comments,
    media: row.media.map(({ kind, durationSeconds }) => ({ kind, durationSeconds })),
  };
}

/**
 * Public creator feed and post detail. Media is counted, never referenced; premium posts expose only their generated
 * cover preview (US-048).
 */
@Injectable()
export class PublicPostsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly access: PostAccessService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** PUBLISHED posts of a visible creator, with this viewer's access and like state. userId from the session only. */
  async list(slug: string, userId: string | null): Promise<PublicPost[]> {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      select: { id: true, slug: true, userId: true },
    });
    if (!creator) throw new DomainError('NOT_FOUND');
    // shortcut: newest PUBLIC_FEED_LIMIT only, add cursor pagination when creators exceed it.
    // shortcut: no (creator_profile_id, status, published_at) index; add one if the feed query gets slow.
    const rows = await this.prisma.post.findMany({
      where: { creatorProfileId: creator.id, status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: PUBLIC_FEED_LIMIT,
      include: { ...readyMedia, ...currentOffer, ...counts },
    });
    const entries = await this.toPublicPosts(
      rows.map((row) => ({ ...row, creatorProfile: creator })),
      userId,
    );
    return entries.map((e) => e.post);
  }

  /**
   * Home feed (US-025): PUBLISHED posts of every visible creator except the viewer's own, in FEED_ORDER, one keyset
   * page at a time. Entitlement runs through the same mapper as a creator's feed, so a locked premium post carries
   * only its preview. userId from the session only.
   * shortcut: no (status, published_at, id) index; add one if the query gets slow.
   */
  async feed(userId: string, cursor: string | null): Promise<HomeFeedPage> {
    const rows = await this.prisma.post.findMany({
      where: {
        status: 'PUBLISHED',
        creatorProfile: { ...PUBLIC_CREATOR, userId: { not: userId } },
        ...(cursor ? feedCursorWhere(cursor) : {}),
      },
      orderBy: FEED_ORDER,
      take: HOME_FEED_PAGE_SIZE + 1,
      include: {
        ...readyMedia,
        ...currentOffer,
        ...counts,
        creatorProfile: {
          select: { slug: true, userId: true, displayName: true, avatarKey: true },
        },
      },
    });
    const page = rows.slice(0, HOME_FEED_PAGE_SIZE);
    const entries = await this.toPublicPosts(page, userId);
    const last = page.at(-1);
    return {
      items: entries.map(({ row, post }) => ({
        ...post,
        creator: {
          slug: row.creatorProfile.slug,
          displayName: row.creatorProfile.displayName,
          avatarUrl: imageUrl(row.creatorProfile.slug, row.creatorProfile.avatarKey),
        },
      })),
      nextCursor:
        rows.length > HOME_FEED_PAGE_SIZE && last
          ? encodeFeedCursor({ publishedAt: last.publishedAt!, id: last.id })
          : null,
    };
  }

  /**
   * The one place a PUBLISHED post of a public creator becomes a PublicPost for a viewer: access, like state and
   * report flag. Viewer facts are batched (one admin lookup, one likes lookup for the whole page).
   */
  private async toPublicPosts<
    R extends Post & {
      media: { kind: MediaKind; durationSeconds: number | null }[];
      offers: PostOffer[];
      _count: { likes: number; comments: number };
      creatorProfile: { slug: string; userId: string };
    },
  >(rows: R[], userId: string | null): Promise<{ row: R; post: PublicPost }[]> {
    const adminRole = userId
      ? await this.prisma.userRole.findUnique({
          where: { userId_role: { userId, role: 'ADMIN' } },
          select: { id: true },
        })
      : null;
    const likedIds = new Set(
      userId && rows.length > 0
        ? (
            await this.prisma.postLike.findMany({
              where: { userId, postId: { in: rows.map((r) => r.id) } },
              select: { postId: true },
            })
          ).map((l) => l.postId)
        : [],
    );
    const viewer = userId ? { userId, isAdmin: adminRole !== null } : null;
    return rows.flatMap((row) => {
      // Callers already guarantee a PUBLISHED post of a public creator.
      const access = decidePostAccess(
        {
          status: row.status,
          visibility: row.visibility,
          ownerUserId: row.creatorProfile.userId,
          creatorPublic: true,
        },
        viewer,
      );
      if (access === 'hidden') return []; // unreachable for these rows; never leak a hidden post
      return [
        {
          row,
          post: {
            ...publicPostFields(row, row.creatorProfile.slug),
            publishedAt: row.publishedAt!.toISOString(),
            access,
            viewer: viewerOf(
              userId,
              likedIds.has(row.id),
              canEngage(access, row.status, this.env.PREMIUM_LIKES_WITHOUT_ACCESS),
              row.status,
              row.creatorProfile.userId,
            ),
          },
        },
      ];
    });
  }

  /** One post for /{slug}/posts/{postId}. hidden, wrong slug or malformed id → NOT_FOUND. userId from the session only. */
  async get(slug: string, postId: string, userId: string | null): Promise<PublicPostDetail> {
    if (!z.uuid().safeParse(postId).success) throw new DomainError('NOT_FOUND');
    const access = await this.access.check(postId, userId);
    if (access === 'hidden') throw new DomainError('NOT_FOUND');
    // No PUBLIC_CREATOR filter: check() already hides non-public creators from all but owner and admins.
    const row = await this.prisma.post.findFirst({
      where: { id: postId, creatorProfile: { slug: slug.toLowerCase() } },
      include: {
        ...readyMedia,
        ...currentOffer,
        ...counts,
        creatorProfile: { select: { slug: true, userId: true } },
      },
    });
    if (!row) throw new DomainError('NOT_FOUND');
    const liked =
      userId !== null &&
      (await this.prisma.postLike.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { id: true },
      })) !== null;
    return {
      ...publicPostFields(row, row.creatorProfile.slug),
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      access,
      viewer: viewerOf(
        userId,
        liked,
        canEngage(access, row.status, this.env.PREMIUM_LIKES_WITHOUT_ACCESS),
        row.status,
        row.creatorProfile.userId,
      ),
    };
  }

  /** The current preview of a PUBLISHED premium post of a visible creator; anything else is the same NOT_FOUND. */
  async getPreview(slug: string, postId: string, id: string): Promise<StoredObject> {
    if (!z.uuid().safeParse(postId).success || !z.uuid().safeParse(id).success) {
      throw new DomainError('NOT_FOUND');
    }
    const key = PREVIEW_KEY_PREFIX + id;
    const post = await this.prisma.post.findFirst({
      where: {
        id: postId,
        previewKey: key,
        visibility: 'PREMIUM',
        status: 'PUBLISHED',
        creatorProfile: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      },
      select: { id: true },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    const object = await this.storage.get(key);
    if (!object) throw new DomainError('NOT_FOUND');
    return { body: object.body, contentType: 'image/webp' };
  }
}
