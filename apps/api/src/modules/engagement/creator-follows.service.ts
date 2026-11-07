import { Injectable } from '@nestjs/common';
import type { FollowState } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PUBLIC_CREATOR } from '../creators/creator-profile.service.js';

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
}
