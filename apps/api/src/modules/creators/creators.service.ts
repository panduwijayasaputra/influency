import { Injectable } from '@nestjs/common';
import {
  CREATOR_AGREEMENT_VERSION,
  type CreatorApplicationInput,
  type CreatorApplicationResponse,
} from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';

/** Latest review, for the rejection reason shown to the applicant. */
const latestReview = {
  reviews: { orderBy: { createdAt: 'desc' }, take: 1, select: { reason: true } },
} satisfies Prisma.CreatorProfileInclude;

function toResponse(
  profile: Prisma.CreatorProfileGetPayload<{ include: typeof latestReview }>,
): CreatorApplicationResponse {
  return {
    status: profile.status,
    displayName: profile.displayName,
    slug: profile.slug,
    bio: profile.bio,
    category: profile.category,
    submittedAt: profile.updatedAt.toISOString(),
    rejectionReason: profile.status === 'REJECTED' ? (profile.reviews[0]?.reason ?? null) : null,
  };
}

@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One application per user (UNIQUE user_id). PENDING_REVIEW/APPROVED → CREATOR_APPLICATION_EXISTS;
   * REJECTED → resubmitted on the same row. Concurrent submits are settled by the DB unique constraints.
   */
  async apply(userId: string, input: CreatorApplicationInput): Promise<CreatorApplicationResponse> {
    const data = {
      displayName: input.displayName,
      slug: input.slug,
      bio: input.bio || null,
      category: input.category || null,
      agreementVersion: CREATOR_AGREEMENT_VERSION,
      agreementAcceptedAt: new Date(),
      status: 'PENDING_REVIEW' as const,
    };
    const existing = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (existing && existing.status !== 'REJECTED') {
      throw new DomainError('CREATOR_APPLICATION_EXISTS');
    }
    await this.assertSlugFree(userId, input.slug);
    try {
      if (!existing) {
        return toResponse(
          await this.prisma.creatorProfile.create({
            data: { userId, ...data },
            include: latestReview,
          }),
        );
      }
      const { count } = await this.prisma.creatorProfile.updateMany({
        where: { userId, status: 'REJECTED' },
        data,
      });
      if (count === 0) throw new DomainError('CREATOR_APPLICATION_EXISTS'); // raced with another submit
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
      // Not meta.target: its shape depends on the driver adapter. Re-check who owns the slug instead.
      await this.assertSlugFree(userId, input.slug);
      throw new DomainError('CREATOR_APPLICATION_EXISTS');
    }
    return toResponse(
      await this.prisma.creatorProfile.findUniqueOrThrow({
        where: { userId },
        include: latestReview,
      }),
    );
  }

  async findMine(userId: string): Promise<CreatorApplicationResponse | null> {
    const profile = await this.prisma.creatorProfile.findUnique({
      where: { userId },
      include: latestReview,
    });
    return profile && toResponse(profile);
  }

  private async assertSlugFree(userId: string, slug: string): Promise<void> {
    const owner = await this.prisma.creatorProfile.findUnique({
      where: { slug },
      select: { userId: true },
    });
    if (owner && owner.userId !== userId) throw new DomainError('SLUG_TAKEN', { field: 'slug' });
  }
}
