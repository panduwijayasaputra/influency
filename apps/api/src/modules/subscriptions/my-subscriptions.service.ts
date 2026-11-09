import { Injectable } from '@nestjs/common';
import type { MySubscription, MySubscriptionList } from '@influency/shared';
import { dbNow } from '../../common/db-time.js';
import { PrismaService } from '../../common/prisma.service.js';
import { imageUrl, PUBLIC_CREATOR } from '../creators/creator-profile.service.js';

const DAY_MS = 86_400_000;

/**
 * Langganan (user-area US-047): the caller's active creator subscriptions. State comes from the period timestamps and
 * the database clock, never a stored status (see SubscriptionPeriod): active = not cancelled and
 * startsAt <= now < endsAt; a later non-cancelled period is the prepaid renewal. Read-only; userId from the session
 * only, and only the public creator shape leaves the service.
 */
@Injectable()
export class MySubscriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<MySubscriptionList> {
    const now = await dbNow(this.prisma);
    // shortcut: 200 live periods per user is far above one active subscription per creator; paginate if that changes.
    const periods = await this.prisma.subscriptionPeriod.findMany({
      where: {
        userId,
        canceledAt: null,
        endsAt: { gt: now },
        creatorProfile: PUBLIC_CREATOR,
      },
      orderBy: { startsAt: 'asc' },
      take: 200,
      select: {
        creatorProfileId: true,
        startsAt: true,
        endsAt: true,
        creatorProfile: {
          select: { slug: true, displayName: true, bio: true, avatarKey: true, bannerKey: true },
        },
      },
    });

    const byCreator = new Map<string, MySubscription>();
    const withRenewal = new Set<string>();
    for (const p of periods) {
      if (p.startsAt > now) {
        withRenewal.add(p.creatorProfileId);
        continue;
      }
      const c = p.creatorProfile;
      const current = byCreator.get(p.creatorProfileId);
      // Normally exactly one active period per creator; if two overlap, show the one that ends last.
      if (current && new Date(current.endsAt) >= p.endsAt) continue;
      byCreator.set(p.creatorProfileId, {
        creator: {
          slug: c.slug,
          displayName: c.displayName,
          avatarUrl: imageUrl(c.slug, c.avatarKey),
          bannerUrl: imageUrl(c.slug, c.bannerKey),
          bio: c.bio,
        },
        endsAt: p.endsAt.toISOString(),
        daysLeft: Math.max(1, Math.ceil((p.endsAt.getTime() - now.getTime()) / DAY_MS)),
        hasScheduledRenewal: false,
      });
    }
    // A creator is listed only with an active period: a scheduled period alone never shows up.
    const subscriptions = [...byCreator.entries()]
      .map(([creatorId, s]) => ({ ...s, hasScheduledRenewal: withRenewal.has(creatorId) }))
      .sort(
        (a, b) => a.endsAt.localeCompare(b.endsAt) || a.creator.slug.localeCompare(b.creator.slug),
      );
    return { subscriptions };
  }
}
