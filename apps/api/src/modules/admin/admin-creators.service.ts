import { Injectable } from '@nestjs/common';
import type { AdminCreatorApplication, CreatorReviewResult } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';

type Decision = 'APPROVED' | 'REJECTED';

@Injectable()
export class AdminCreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  /** PENDING_REVIEW applications, oldest first. */
  async listPending(): Promise<AdminCreatorApplication[]> {
    // shortcut: no pagination; add cursor paging when the pending queue can exceed ~100.
    const profiles = await this.prisma.creatorProfile.findMany({
      where: { status: 'PENDING_REVIEW' },
      orderBy: { updatedAt: 'asc' },
      include: { user: { select: { displayName: true } } },
    });
    return profiles.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      slug: p.slug,
      bio: p.bio,
      category: p.category,
      applicantName: p.user.displayName,
      submittedAt: p.updatedAt.toISOString(),
    }));
  }

  approve(profileId: string, reviewerId: string): Promise<CreatorReviewResult> {
    return this.decide(profileId, reviewerId, 'APPROVED', null);
  }

  reject(profileId: string, reviewerId: string, reason: string): Promise<CreatorReviewResult> {
    return this.decide(profileId, reviewerId, 'REJECTED', reason);
  }

  /**
   * Status change + review row in one transaction. The conditional UPDATE locks the row, so of
   * concurrent decisions only one sees PENDING_REVIEW; the others get CREATOR_APPLICATION_NOT_PENDING.
   */
  private async decide(
    profileId: string,
    reviewerId: string,
    decision: Decision,
    reason: string | null,
  ): Promise<CreatorReviewResult> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.creatorProfile.updateMany({
        where: { id: profileId, status: 'PENDING_REVIEW' },
        data: { status: decision },
      });
      if (count === 0) {
        const exists = await tx.creatorProfile.findUnique({
          where: { id: profileId },
          select: { id: true },
        });
        throw new DomainError(exists ? 'CREATOR_APPLICATION_NOT_PENDING' : 'NOT_FOUND');
      }
      await tx.creatorApplicationReview.create({
        data: { creatorProfileId: profileId, reviewerId, decision, reason },
      });
    });
    return { id: profileId, status: decision };
  }
}
