import { Inject, Injectable } from '@nestjs/common';
import {
  API_PREFIX,
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
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { canEngage } from '../engagement/post-likes.service.js';
import { PostAccessService } from '../entitlements/post-access.service.js';
import { currentOffer, PREVIEW_KEY_PREFIX, previewId } from './posts.service.js';

const readyMediaKinds = { media: { where: { status: 'READY' }, select: { kind: true } } } as const;
const likeCount = { _count: { select: { likes: true } } } as const;

/** Every public field except publishedAt (nullable on the detail view). Media is counted, never referenced. */
function publicPostFields(
  row: Post & { media: { kind: MediaKind }[]; offers: PostOffer[]; _count: { likes: number } },
  slug: string,
): Omit<PublicPost, 'publishedAt'> {
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

  /** PUBLISHED posts of a visible creator. */
  async list(slug: string): Promise<PublicPost[]> {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      select: { id: true, slug: true },
    });
    if (!creator) throw new DomainError('NOT_FOUND');
    // shortcut: newest PUBLIC_FEED_LIMIT only, add cursor pagination when creators exceed it.
    // shortcut: no (creator_profile_id, status, published_at) index; add one if the feed query gets slow.
    const rows = await this.prisma.post.findMany({
      where: { creatorProfileId: creator.id, status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: PUBLIC_FEED_LIMIT,
      include: { ...readyMediaKinds, ...currentOffer, ...likeCount },
    });
    return rows.map((row) => ({
      ...publicPostFields(row, creator.slug),
      publishedAt: row.publishedAt!.toISOString(),
    }));
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
        ...readyMediaKinds,
        ...currentOffer,
        ...likeCount,
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
      viewer: userId
        ? {
            liked,
            canLike: canEngage(access, row.status, this.env.PREMIUM_LIKES_WITHOUT_ACCESS),
            canReport: row.status === 'PUBLISHED' && row.creatorProfile.userId !== userId,
          }
        : null,
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
