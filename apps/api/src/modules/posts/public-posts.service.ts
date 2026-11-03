import { Injectable } from '@nestjs/common';
import { PUBLIC_FEED_LIMIT, type PublicPost } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import { currentOffer } from './posts.service.js';

/** Public creator feed: PUBLISHED posts of a visible creator. Media is counted, never referenced. */
@Injectable()
export class PublicPostsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(slug: string): Promise<PublicPost[]> {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      select: { id: true },
    });
    if (!creator) throw new DomainError('NOT_FOUND');
    // shortcut: newest PUBLIC_FEED_LIMIT only, add cursor pagination when creators exceed it.
    // shortcut: no (creator_profile_id, status, published_at) index; add one if the feed query gets slow.
    const rows = await this.prisma.post.findMany({
      where: { creatorProfileId: creator.id, status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: PUBLIC_FEED_LIMIT,
      include: { media: { where: { status: 'READY' }, select: { kind: true } }, ...currentOffer },
    });
    return rows.map((row) => {
      const offer = row.visibility === 'PREMIUM' ? row.offers[0] : undefined;
      return {
        id: row.id,
        visibility: row.visibility,
        caption: row.caption,
        publishedAt: row.publishedAt!.toISOString(),
        imageCount: row.media.filter((m) => m.kind === 'IMAGE').length,
        videoCount: row.media.filter((m) => m.kind === 'VIDEO').length,
        offer: offer
          ? {
              // Number() is exact: the API caps prices at POST_OFFER_MAX_PRICE_COINS, far below 2^53.
              priceCoins: Number(offer.priceCoins),
              durationSeconds: offer.durationSeconds,
            }
          : null,
      };
    });
  }
}
