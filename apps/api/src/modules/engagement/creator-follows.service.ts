import { Injectable } from '@nestjs/common';
import {
  FOLLOWING_PAGE_SIZE,
  type FollowingPage,
  type FollowingQuery,
  type FollowState,
} from '@influency/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { imageUrl, PUBLIC_CREATOR } from '../creators/creator-profile.service.js';
import {
  encodeNameCursor,
  encodeRecentCursor,
  parseNameCursor,
  parseRecentCursor,
} from './following-order.js';

/** Follow / unfollow a creator (US-024). Social only: never touches entitlements or subscriptions. */
@Injectable()
export class CreatorFollowsService {
  constructor(private readonly prisma: PrismaService) {}

  private async creator(slug: string) {
    const creator = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
      select: { id: true, userId: true },
    });
    if (!creator) throw new DomainError('NOT_FOUND');
    return creator;
  }

  private async stateOf(creatorProfileId: string, userId: string | null): Promise<FollowState> {
    const [followerCount, mine] = await Promise.all([
      this.prisma.creatorFollow.count({ where: { creatorProfileId, user: { status: 'ACTIVE' } } }),
      userId
        ? this.prisma.creatorFollow.count({ where: { creatorProfileId, userId } })
        : Promise.resolve(0),
    ]);
    return { following: mine > 0, followerCount };
  }

  async state(slug: string, userId: string | null): Promise<FollowState> {
    return this.stateOf((await this.creator(slug)).id, userId);
  }

  /** Idempotent: INSERT ... ON CONFLICT DO NOTHING on the unique (user, creator) key. */
  async follow(slug: string, userId: string): Promise<FollowState> {
    const creator = await this.creator(slug);
    if (creator.userId === userId) throw new DomainError('CANNOT_FOLLOW_SELF');
    await this.prisma.creatorFollow.createMany({
      data: [{ userId, creatorProfileId: creator.id }],
      skipDuplicates: true,
    });
    return this.stateOf(creator.id, userId);
  }

  async unfollow(slug: string, userId: string): Promise<FollowState> {
    const creator = await this.creator(slug);
    await this.prisma.creatorFollow.deleteMany({
      where: { userId, creatorProfileId: creator.id },
    });
    return this.stateOf(creator.id, userId);
  }

  /**
   * Diikuti (user-area US-046): the creators the caller follows, public fields only. Only visible creators (APPROVED,
   * ACTIVE owner) are listed and counted. Sort `name` is case-insensitive A-Z in SQL (Prisma cannot order by lower()).
   * A cursor from the other sort is ignored (first page). userId from the session only.
   */
  async list(userId: string, q: FollowingQuery): Promise<FollowingPage> {
    const take = FOLLOWING_PAGE_SIZE + 1;
    const total = this.prisma.creatorFollow.count({
      where: { userId, creatorProfile: PUBLIC_CREATOR },
    });
    type Row = {
      id: string;
      slug: string;
      displayName: string;
      bio: string | null;
      avatarKey: string | null;
      bannerKey: string | null;
      sortName: string;
      createdAt: Date;
    };
    let rows: Row[];
    if (q.sort === 'name') {
      const after = q.cursor ? parseNameCursor(q.cursor) : null;
      const keyset = after
        ? Prisma.sql`AND (lower(cp.display_name), f.id) > (${after.sortName}, ${after.id}::uuid)`
        : Prisma.empty;
      rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT f.id, cp.slug, cp.display_name AS "displayName", cp.bio,
               cp.avatar_key AS "avatarKey", cp.banner_key AS "bannerKey",
               lower(cp.display_name) AS "sortName", f.created_at AS "createdAt"
        FROM creator_follows f
        JOIN creator_profiles cp ON cp.id = f.creator_profile_id AND cp.status = 'APPROVED'
        JOIN users u ON u.id = cp.user_id AND u.status = 'ACTIVE'
        WHERE f.user_id = ${userId}::uuid ${keyset}
        ORDER BY lower(cp.display_name) ASC, f.id ASC
        LIMIT ${take}`);
    } else {
      const after = q.cursor ? parseRecentCursor(q.cursor) : null;
      const found = await this.prisma.creatorFollow.findMany({
        where: {
          userId,
          creatorProfile: PUBLIC_CREATOR,
          ...(after
            ? {
                OR: [
                  { createdAt: { lt: after.createdAt } },
                  { createdAt: after.createdAt, id: { lt: after.id } },
                ],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        select: {
          id: true,
          createdAt: true,
          creatorProfile: {
            select: { slug: true, displayName: true, bio: true, avatarKey: true, bannerKey: true },
          },
        },
      });
      rows = found.map((f) => ({
        id: f.id,
        createdAt: f.createdAt,
        sortName: '',
        ...f.creatorProfile,
      }));
    }
    const page = rows.slice(0, FOLLOWING_PAGE_SIZE);
    const last = page.at(-1);
    return {
      creators: page.map((r) => ({
        slug: r.slug,
        displayName: r.displayName,
        avatarUrl: imageUrl(r.slug, r.avatarKey),
        bannerUrl: imageUrl(r.slug, r.bannerKey),
        bio: r.bio,
      })),
      total: await total,
      nextCursor:
        rows.length > FOLLOWING_PAGE_SIZE && last
          ? q.sort === 'name'
            ? encodeNameCursor(last)
            : encodeRecentCursor(last)
          : null,
    };
  }
}
