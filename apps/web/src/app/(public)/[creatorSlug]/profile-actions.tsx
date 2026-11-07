'use client';

import Link from 'next/link';
import { SubscribeSheet } from '@/components/purchase-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DEMO_SUBSCRIPTION } from '@/lib/demo';
import { ProfileFollowButton } from './follow-state';

/** Ikuti + Langganan, equal width. plan values are dummies until the purchases feature. */
export function ProfileActions({
  slug,
  creatorName,
  loginHref,
  subscribedDaysLeft,
}: {
  slug: string;
  creatorName: string;
  /** Set for guests: both actions go to login instead (US-007). */
  loginHref?: string;
  /** Set (demo) when the viewer is subscribed: Langganan becomes Berlangganan. */
  subscribedDaysLeft?: number;
}) {
  const toast = useToast();
  const { priceCoins, days } = DEMO_SUBSCRIPTION;

  if (loginHref) {
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="secondary">
          <Link href={loginHref}>Ikuti</Link>
        </Button>
        <Button asChild>
          <Link href={loginHref}>Langganan</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <ProfileFollowButton slug={slug} />
      {subscribedDaysLeft !== undefined ? (
        <Button
          type="button"
          variant="outline"
          className="h-auto min-h-12 flex-col gap-0 py-1.5"
          onClick={() => toast('Segera hadir')}
        >
          Berlangganan
          <span className="text-xs font-medium text-muted-foreground">
            {subscribedDaysLeft} hari lagi (demo)
          </span>
        </Button>
      ) : (
        <SubscribeSheet
          creatorName={creatorName}
          trigger={
            <Button type="button" aria-label={`Langganan · ${priceCoins} Koin / ${days} hari`}>
              Langganan
            </Button>
          }
        />
      )}
    </div>
  );
}
