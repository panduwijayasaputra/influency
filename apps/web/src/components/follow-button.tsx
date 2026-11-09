'use client';

import { useState } from 'react';
import type { FollowState } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { cn } from '@/lib/utils';

/**
 * Ikuti / Diikuti toggle. Optimistic: flips at once, rolls back with an error toast if the API fails.
 * Following is a free social relation: it never touches a subscription.
 */
export function FollowButton({
  slug,
  creatorName,
  initialFollowing = false,
  onChange,
  className,
  onDark = false,
}: {
  slug: string;
  /** Adds the creator to the accessible name where several buttons share a page (suggestion cards). */
  creatorName?: string;
  initialFollowing?: boolean;
  /** Called with the server state after a successful toggle. */
  onChange?: (state: FollowState) => void;
  className?: string;
  /** On a cover image: a white pill instead of the page-coloured variants. */
  onDark?: boolean;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [pending, setPending] = useState(false);
  const toast = useToast();
  const label = following ? 'Diikuti' : 'Ikuti';

  async function toggle() {
    const next = !following;
    setFollowing(next);
    setPending(true);
    const state = await setFollow(slug, next);
    setPending(false);
    if (!state) {
      setFollowing(!next);
      toast('Gagal memperbarui. Coba lagi.');
      return;
    }
    setFollowing(state.following);
    onChange?.(state);
    if (!next) toast('Berhenti mengikuti. Langganan tidak terpengaruh.');
  }

  return (
    <Button
      type="button"
      variant={following ? 'outline' : 'secondary'}
      aria-pressed={following}
      aria-label={creatorName ? `${label} ${creatorName}` : undefined}
      disabled={pending}
      className={cn(onDark && 'rounded-full bg-white/95 text-foreground hover:bg-white', className)}
      onClick={() => void toggle()}
    >
      {label}
    </Button>
  );
}
