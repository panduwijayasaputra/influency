'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FollowingCreator } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { CreatorCard } from '@/components/user-area/creator-card';
import { LabeledSelect } from '@/components/user-area/labeled-select';
import { ListEmpty, ListError, ListSkeleton } from '@/components/user-area/list-states';
import { type ListView, ViewToggle } from '@/components/user-area/view-toggle';
import { fetchFollowingPage } from '@/lib/api/following';
import { usePagedList } from '@/lib/use-paged-list';

type Sort = 'recent' | 'name';
const SORTS = [
  { value: 'recent', label: 'Terakhir diikuti' },
  { value: 'name', label: 'Nama A–Z' },
] as const;

/** Diikuti: the creators the user follows. Cards only open the profile, where Ikuti / Diikuti is toggled. */
export function FollowingView() {
  const [sort, setSort] = useState<Sort>('recent');
  const [view, setView] = useState<ListView>('grid');
  const [total, setTotal] = useState<number | null>(null);

  const { items, status, loadingMore, retry, sentinelRef } = usePagedList<
    FollowingCreator & { id: string }
  >(async (cursor) => {
    const page = await fetchFollowingPage({ sort, cursor: cursor ?? undefined });
    setTotal(page.total);
    return {
      items: page.creators.map((c) => ({ ...c, id: c.slug })),
      nextCursor: page.nextCursor,
    };
  }, sort);

  return (
    <main className="mx-auto w-full max-w-feed flex-1 pb-6">
      <div className="flex flex-col gap-3 border-b bg-card px-4 py-3">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[13px] text-muted-foreground">
            Mengikuti itu gratis dan terpisah dari berlangganan.
          </p>
          {total !== null && (
            <span className="shrink-0 text-[13px] font-semibold">
              {new Intl.NumberFormat('id-ID').format(total)} creator
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <LabeledSelect
            label="Urutkan"
            value={sort}
            options={SORTS}
            onChange={(v) => setSort(v as Sort)}
          />
          <ViewToggle value={view} onChange={setView} />
        </div>
      </div>

      {status === 'loading' && <ListSkeleton variant="cards" label="Memuat creator" />}
      {status === 'error' && items.length === 0 && <ListError onRetry={retry} />}
      {status === 'done' && items.length === 0 && (
        <ListEmpty
          title="Kamu belum mengikuti siapa pun"
          action={
            <Button asChild className="mt-2">
              <Link href="/discover">Jelajahi</Link>
            </Button>
          }
        />
      )}

      {items.length > 0 && (
        <ul className={`grid gap-3 px-4 py-3 ${view === 'grid' ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {items.map((c) => (
            <li key={c.id} className="flex flex-col">
              <CreatorCard creator={c} bannerClassName={view === 'grid' ? 'h-16' : 'h-24'} />
            </li>
          ))}
        </ul>
      )}

      <div ref={sentinelRef} className="px-4 py-3 text-center text-sm text-muted-foreground">
        {loadingMore && <p role="status">Memuat…</p>}
        {status === 'error' && items.length > 0 && <ListError onRetry={retry} />}
      </div>
    </main>
  );
}
