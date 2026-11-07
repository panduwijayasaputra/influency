'use client';

import Link from 'next/link';
import { useState } from 'react';
import { SubscribeSheet } from '@/components/purchase-sheet';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { DEMO_SUBSCRIPTION } from '@/lib/demo';

/** Ikuti + Langganan, equal width. Ikuti is local only until home-feed; plan values are dummies until US-026. */
export function ProfileActions({
  creatorName,
  loginHref,
  subscribedDaysLeft,
}: {
  creatorName: string;
  /** Set for guests: both actions go to login instead (US-007). */
  loginHref?: string;
  /** Set (demo) when the viewer is subscribed: Langganan becomes Berlangganan. */
  subscribedDaysLeft?: number;
}) {
  const [following, setFollowing] = useState(false);
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
      <Button
        type="button"
        variant={following ? 'outline' : 'secondary'}
        aria-pressed={following}
        onClick={() => {
          setFollowing((v) => !v);
          toast('Segera hadir');
        }}
      >
        {following ? 'Diikuti' : 'Ikuti'}
      </Button>
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
