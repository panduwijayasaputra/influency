'use client';

import { Coins } from 'lucide-react';
import Link from 'next/link';
import type { CreatorSubscriptionState } from '@influency/shared';
import { SubscribeSheet, SubscriptionManageSheet } from '@/components/subscription-sheet';
import { TipSheet } from '@/components/tip-sheet';
import { Button } from '@/components/ui/button';
import { daysLeft } from '@/lib/format';
import { ProfileFollowButton } from './follow-state';

/** Ikuti + Langganan, equal width. A creator without a plan has no Langganan button. */
export function ProfileActions({
  slug,
  creatorName,
  avatarUrl,
  loginHref,
  subscription,
}: {
  slug: string;
  creatorName: string;
  avatarUrl: string | null;
  /** Set for guests: both actions go to login instead (US-007). */
  loginHref?: string;
  subscription: CreatorSubscriptionState;
}) {
  const { plan, viewer } = subscription;
  const path = `/${slug}`;
  const layout = plan ? 'grid grid-cols-2 gap-2' : 'grid gap-2';

  if (loginHref) {
    return (
      <div className={layout}>
        <Button asChild variant="secondary">
          <Link href={loginHref}>Ikuti</Link>
        </Button>
        {plan && (
          <Button asChild>
            <Link href={loginHref}>Langganan</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={layout}>
        <ProfileFollowButton slug={slug} />
        {plan && viewer?.current ? (
          <SubscriptionManageSheet
            slug={slug}
            creatorName={creatorName}
            plan={plan}
            viewer={viewer}
            returnPath={path}
            trigger={
              <Button
                type="button"
                variant="outline"
                className="h-auto min-h-12 flex-col gap-0 py-1.5"
              >
                Berlangganan
                <span className="text-xs font-medium text-muted-foreground">
                  {daysLeft(viewer.current.endsAt, new Date())} hari lagi
                </span>
              </Button>
            }
          />
        ) : (
          plan && (
            <SubscribeSheet
              slug={slug}
              creatorName={creatorName}
              plan={plan}
              returnPath={path}
              trigger={
                <Button
                  type="button"
                  aria-label={`Langganan · ${plan.priceCoins} Koin / ${plan.durationDays} hari`}
                >
                  Langganan
                </Button>
              }
            />
          )
        )}
      </div>
      {viewer?.canTip && (
        <TipSheet
          creator={{ slug, displayName: creatorName, avatarUrl }}
          returnPath={path}
          trigger={
            <button
              type="button"
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-koin-surface text-sm font-bold text-koin-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Coins aria-hidden className="size-5" />
              Kirim Tip
            </button>
          }
        />
      )}
    </div>
  );
}
