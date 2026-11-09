import { Inject, Injectable } from '@nestjs/common';
import {
  API_PREFIX,
  DISCOVER_VIDEOS_PAGE_SIZE,
  type DiscoverVideosPage,
  HOME_FEED_PAGE_SIZE,
  type HomeFeedPage,
  LIBRARY_PAGE_SIZE,
  type LibraryPage,
  type LibraryQuery,
  PUBLIC_FEED_LIMIT,
  type PublicPost,
  type PublicPostDetail,
} from '@influency/shared';
import { z } from 'zod';
import { MEDIA_ORDER } from '../../common/media-order.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { MediaKind, Post, PostOffer, Prisma } from '../../generated/prisma/client.js';
import { imageUrl, PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { canEngage } from '../engagement/post-likes.service.js';
import { decidePostAccess } from '../entitlements/post-access.js';
import { PaidAccessService } from '../entitlements/paid-access.service.js';
import { PostAccessService } from '../entitlements/post-access.service.js';
import { encodeFeedCursor, FEED_ORDER, feedCursorWhere } from './feed-order.js';
import {
  encodeLibraryCursor,
  libraryCreatorsSql,
  libraryPageSql,
  type LibrarySqlRow,
} from './library-query.js';
import { currentOffer, PREVIEW_KEY_PREFIX, previewId } from './posts.service.js';

// Display order = the order GET /posts/:id/media-access returns (MEDIA_ORDER: the creator's position).
const readyMedia = {
  media: {
    where: { status: 'READY' },
    orderBy: MEDIA_ORDER,
    select: { kind: true, durationSeconds: true },
  },
} as const;
const counts = {
  _count: { select: { likes: true, comments: { where: { deletedAt: null } } } },
} as const;

type Viewer = PublicPost['viewer'];

/**
 * The viewer's state on a post; null for anonymous viewers. canReport = published and not the viewer's own post.
 * canTip = published premium post the viewer has paid access to (purchase or subscription) and does not own; the
 * tip endpoint checks the same rule again. Admins and owners get no tip button from their free access.
 */
function viewerOf(
  userId: string | null,
  liked: boolean,
  saved: boolean,
  canLike: boolean,
  post: { status: Post['status']; visibility: Post['visibility'] },
  paid: boolean,
  ownerUserId: string,
  subscribed: boolean,
): Viewer {
  if (!userId) return null;
  const published = post.status === 'PUBLISHED';
  return {
    liked,
    saved,
    canLike,
    canReport: published && ownerUserId !== userId,
    canTip: published && post.visibility === 'PREMIUM' && paid && ownerUserId !== userId,
    subscribed,
  };
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
    private readonly paidAccess: PaidAccessService,
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
  feed(userId: string, cursor: string | null): Promise<HomeFeedPage> {
    return this.feedPage(
      { status: 'PUBLISHED', creatorProfile: { ...PUBLIC_CREATOR, userId: { not: userId } } },
      userId,
      cursor,
      HOME_FEED_PAGE_SIZE,
    );
  }

  /**
   * Jelajahi videos (US-069): the Home feed query limited to FREE posts with a READY video, so no premium original
   * can surface here. Guests see every visible creator; a signed-in viewer never sees their own posts. Each item
   * carries the creator's follow state (ACTIVE followers, like `CreatorFollowsService`).
   * shortcut: no index for the media filter; add one if the query gets slow.
   */
  async discoverVideos(userId: string | null, cursor: string | null): Promise<DiscoverVideosPage> {
    const page = await this.feedPage(
      {
        status: 'PUBLISHED',
        visibility: 'FREE',
        media: { some: { kind: 'VIDEO', status: 'READY' } },
        creatorProfile: { ...PUBLIC_CREATOR, ...(userId ? { userId: { not: userId } } : {}) },
      },
      userId,
      cursor,
      DISCOVER_VIDEOS_PAGE_SIZE,
    );
    const slugs = [...new Set(page.items.map((i) => i.creator.slug))];
    const creators =
      slugs.length === 0
        ? []
        : await this.prisma.creatorProfile.findMany({
            where: { slug: { in: slugs } },
            select: {
              slug: true,
              _count: { select: { follows: { where: { user: { status: 'ACTIVE' } } } } },
              // The viewer's own follow row; none for a guest (take 0).
              follows: {
                where: { userId: userId ?? undefined },
                select: { userId: true },
                take: userId ? 1 : 0,
              },
            },
          });
    const follow = new Map(
      creators.map((c) => [
        c.slug,
        { following: userId !== null && c.follows.length > 0, followerCount: c._count.follows },
      ]),
    );
    return {
      items: page.items.map((item) => ({
        ...item,
        follow: follow.get(item.creator.slug) ?? { following: false, followerCount: 0 },
      })),
      nextCursor: page.nextCursor,
    };
  }

  /** One keyset page of PUBLISHED posts matching `where`, in FEED_ORDER, with the creator fields PostCard needs. */
  private async feedPage(
    where: Prisma.PostWhereInput,
    userId: string | null,
    cursor: string | null,
    pageSize: number,
  ): Promise<HomeFeedPage> {
    const rows = await this.prisma.post.findMany({
      where: { ...where, ...(cursor ? feedCursorWhere(cursor) : {}) },
      orderBy: FEED_ORDER,
      take: pageSize + 1,
      include: {
        ...readyMedia,
        ...currentOffer,
        ...counts,
        creatorProfile: {
          select: { slug: true, userId: true, displayName: true, avatarKey: true },
        },
      },
    });
    const page = rows.slice(0, pageSize);
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
        rows.length > pageSize && last
          ? encodeFeedCursor({ publishedAt: last.publishedAt!, id: last.id })
          : null,
    };
  }

  /**
   * Koleksi Saya (user-area US-045): the caller's saved and bought posts, one keyset page at a time. Which posts
   * qualify is decided in `libraryPageSql`; entitlement still runs through the same mapper as the feed, so a
   * saved-only premium post comes back locked with only its preview. userId from the session only.
   */
  async library(userId: string, q: LibraryQuery): Promise<LibraryPage> {
    const rows = await this.prisma.$queryRaw<LibrarySqlRow[]>(
      libraryPageSql(userId, q, LIBRARY_PAGE_SIZE + 1),
    );
    const pageRows = rows.slice(0, LIBRARY_PAGE_SIZE);
    const posts = await this.prisma.post.findMany({
      where: { id: { in: pageRows.map((r) => r.postId) } },
      include: {
        ...readyMedia,
        ...currentOffer,
        ...counts,
        creatorProfile: {
          select: { slug: true, userId: true, displayName: true, avatarKey: true },
        },
      },
    });
    const byId = new Map(posts.map((p) => [p.id, p]));
    const ordered = pageRows.flatMap((r) => {
      const row = byId.get(r.postId);
      return row ? [row] : [];
    });
    const entries = new Map(
      (await this.toPublicPosts(ordered, userId)).map((e) => [e.row.id, e] as const),
    );
    const items = pageRows.flatMap((r) => {
      const entry = entries.get(r.postId);
      if (!entry) return []; // never leaks: a hidden post is dropped, the cursor below still comes from the SQL rows
      const { row, post } = entry;
      return [
        {
          ...post,
          creator: {
            slug: row.creatorProfile.slug,
            displayName: row.creatorProfile.displayName,
            avatarUrl: imageUrl(row.creatorProfile.slug, row.creatorProfile.avatarKey),
          },
          saved: r.saved,
          purchased: r.purchased,
          addedAt: new Date(Number(r.addedMs)).toISOString(),
        },
      ];
    });
    const last = pageRows.at(-1);
    const creators = q.cursor
      ? []
      : await this.prisma.$queryRaw<{ slug: string; displayName: string }[]>(
          libraryCreatorsSql(userId),
        );
    return {
      items,
      nextCursor:
        rows.length > LIBRARY_PAGE_SIZE && last
          ? encodeLibraryCursor({ addedMs: Number(last.addedMs), id: last.postId })
          : null,
      creators,
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
    const savedIds = new Set(
      userId && rows.length > 0
        ? (
            await this.prisma.postSave.findMany({
              where: { userId, postId: { in: rows.map((r) => r.id) } },
              select: { postId: true },
            })
          ).map((s) => s.postId)
        : [],
    );
    const viewer = userId ? { userId, isAdmin: adminRole !== null } : null;
    const { paidPostIds: paidIds, subscribedCreatorIds } = await this.paidAccess.facts(
      userId,
      rows,
    );
    return rows.flatMap((row) => {
      // Callers already guarantee a PUBLISHED post of a public creator.
      const access = decidePostAccess(
        {
          status: row.status,
          visibility: row.visibility,
          ownerUserId: row.creatorProfile.userId,
          creatorPublic: true,
          paid: paidIds.has(row.id),
        },
        viewer,
      );
      if (access === 'hidden') return []; // unreachable for these rows; never leak a hidden post
      return [
        {
          row,
          post: {
            ...publicPostFields(row, row.creatorProfile.slug),
            // A purchased post stays visible after it is archived (it was published once).
            publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
            access,
            viewer: viewerOf(
              userId,
              likedIds.has(row.id),
              savedIds.has(row.id),
              canEngage(access, row.status, this.env.PREMIUM_LIKES_WITHOUT_ACCESS),
              row,
              paidIds.has(row.id),
              row.creatorProfile.userId,
              subscribedCreatorIds.has(row.creatorProfileId),
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
    const saved =
      userId !== null &&
      (await this.prisma.postSave.findUnique({
        where: { postId_userId: { postId, userId } },
        select: { id: true },
      })) !== null;
    const { paidPostIds, subscribedCreatorIds } = await this.paidAccess.facts(userId, [row]);
    return {
      ...publicPostFields(row, row.creatorProfile.slug),
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      access,
      viewer: viewerOf(
        userId,
        liked,
        saved,
        canEngage(access, row.status, this.env.PREMIUM_LIKES_WITHOUT_ACCESS),
        row,
        paidPostIds.has(row.id),
        row.creatorProfile.userId,
        subscribedCreatorIds.has(row.creatorProfileId),
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
