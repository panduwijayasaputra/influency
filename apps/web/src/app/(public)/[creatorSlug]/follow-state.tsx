'use client';

import { Users } from 'lucide-react';
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

/** Stats row item: icon + count (`aria-label` carries the words). */
export function StatItem({
  icon,
  count,
  label,
}: {
  icon: ReactNode;
  count: number;
  label: string;
}) {
  return (
    <li
      aria-label={`${full.format(count)} ${label}`}
      className="flex items-center gap-1.5 text-muted-foreground"
    >
      {icon}
      <span aria-hidden className="text-sm font-extrabold text-foreground">
        {compact.format(count)}
      </span>
    </li>
  );
}

/** Follower count; nothing when the count is unknown. */
export function FollowerCount() {
  const { state } = useFollow();
  if (!state) return null;
  return (
    <StatItem
      icon={<Users aria-hidden className="size-4.5" />}
      count={state.followerCount}
      label="pengikut"
    />
  );
}

export function ProfileFollowButton({ slug }: { slug: string }) {
  const { state, setState } = useFollow();
  return (
    <FollowButton slug={slug} initialFollowing={state?.following ?? false} onChange={setState} />
  );
}
