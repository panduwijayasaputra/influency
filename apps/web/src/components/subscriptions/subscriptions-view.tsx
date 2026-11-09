'use client';

import { useCallback, useEffect, useState } from 'react';
import type { MySubscription } from '@influency/shared';
import { CreatorCard } from '@/components/user-area/creator-card';
import { ListEmpty, ListError, ListSkeleton } from '@/components/user-area/list-states';
import { fetchMySubscriptions } from '@/lib/api/my-subscriptions';
import { daysLeftLabel } from '@/lib/format';

type State = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; list: MySubscription[] };

/** Langganan: the user's active creator subscriptions. Renewal and cancel are handled on the creator profile. */
export function SubscriptionsView() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    fetchMySubscriptions().then(
      (r) => setState({ kind: 'ready', list: r.subscriptions }),
      () => setState({ kind: 'error' }),
    );
  }, []);

  // Starts from a timer callback: react-hooks/set-state-in-effect forbids setting state in the effect body.
  useEffect(() => {
    const id = setTimeout(load, 0);
    return () => clearTimeout(id);
  }, [load]);

  const retry = () => {
    setState({ kind: 'loading' });
    load();
  };

  return (
    <main className="mx-auto w-full max-w-feed flex-1 pb-6">
      <p className="border-b bg-card px-4 py-3 text-[13px] text-muted-foreground">
        Langganan terpisah dari mengikuti. Perpanjangan dilakukan manual.
      </p>

      {state.kind === 'loading' && <ListSkeleton variant="cards" label="Memuat langganan" />}
      {state.kind === 'error' && <ListError onRetry={retry} />}
      {state.kind === 'ready' && state.list.length === 0 && (
        <ListEmpty
          title="Belum ada langganan aktif"
          body="Langganan terpisah dari mengikuti. Berlanggananlah dari profil creator."
        />
      )}
      {state.kind === 'ready' && state.list.length > 0 && (
        <ul className="flex flex-col gap-3 px-4 py-3">
          {state.list.map((s) => {
            const label = daysLeftLabel(s.daysLeft);
            return (
              <li key={s.creator.slug}>
                <CreatorCard
                  creator={s.creator}
                  ariaLabel={`Buka ${s.creator.displayName}, langganan aktif, ${label}`}
                  badge={
                    <>
                      <span className="rounded-full bg-card px-2.5 py-1 text-xs font-extrabold text-success">
                        {label}
                      </span>
                      {s.hasScheduledRenewal && (
                        <span className="rounded-full bg-card px-2.5 py-1 text-xs font-bold text-foreground">
                          Perpanjangan terjadwal
                        </span>
                      )}
                    </>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      {state.kind === 'ready' && (
        <p className="px-4 text-xs leading-relaxed text-muted-foreground">
          Perlu konfirmasi: detail kartu dan kontrol perpanjangan.
        </p>
      )}
    </main>
  );
}
