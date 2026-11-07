'use client';

import { createContext, type ReactNode, useContext, useState } from 'react';
import type { FollowState } from '@influency/shared';
import { FollowButton } from '@/components/follow-button';

const compact = new Intl.NumberFormat('id-ID', { notation: 'compact' });
const full = new Intl.NumberFormat('id-ID');

const FollowContext = createContext<{
  state: FollowState | null;
  setState: (s: FollowState) => void;
} | null>(null);

// Outside a provider (e.g. an isolated test) the state is simply unknown.
const useFollow = () => useContext(FollowContext) ?? { state: null, setState: () => {} };

/** Shares the follow state between the follower count and the Ikuti button. `initial` is null when the API was unreachable. */
export function FollowProvider({
  initial,
  children,
}: {
  initial: FollowState | null;
  children: ReactNode;
}) {
  const [state, setState] = useState(initial);
  return <FollowContext.Provider value={{ state, setState }}>{children}</FollowContext.Provider>;
}

/** "1,2 rb pengikut"; nothing when the count is unknown. */
export function FollowerCount() {
  const { state } = useFollow();
  if (!state) return null;
  return (
    <p
      className="text-sm text-muted-foreground"
      aria-label={`${full.format(state.followerCount)} pengikut`}
    >
      <span className="font-semibold text-foreground">{compact.format(state.followerCount)}</span>{' '}
      pengikut
    </p>
  );
}

export function ProfileFollowButton({ slug }: { slug: string }) {
  const { state, setState } = useFollow();
  return (
    <FollowButton slug={slug} initialFollowing={state?.following ?? false} onChange={setState} />
  );
}
