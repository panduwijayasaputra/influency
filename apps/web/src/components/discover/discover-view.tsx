'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { pauseAllVideos } from '@/lib/video-playback';
import { cn } from '@/lib/utils';
import { CreatorSearch } from './creator-search';
import { DiscoverReels } from './discover-reels';

export type DiscoverTab = 'video' | 'cari';

const TABS: { id: DiscoverTab; label: string; href: string }[] = [
  { id: 'video', label: 'Video', href: '/discover' },
  { id: 'cari', label: 'Cari', href: '/discover?tab=cari' },
];

/** Jelajahi (US-065/US-066): Video reels | Cari creators. The tab lives in the URL (`?tab=cari`). */
export function DiscoverView({
  initialTab,
  viewerSlug,
}: {
  initialTab: DiscoverTab;
  /** The viewer's own creator slug (no Ikuti on their own videos); null for non-creators. */
  viewerSlug: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<DiscoverTab>(initialTab);

  function select(next: (typeof TABS)[number]) {
    if (next.id === tab) return;
    if (tab === 'video') pauseAllVideos();
    setTab(next.id);
    router.replace(next.href, { scroll: false });
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-var(--bottom-nav-height)-env(safe-area-inset-bottom))] w-full max-w-feed flex-col">
      <h1 className="sr-only">Jelajahi</h1>
      <div
        role="tablist"
        aria-label="Jelajahi"
        className="flex h-13 shrink-0 items-center justify-center gap-7 border-b bg-card"
      >
        {TABS.map((t) => {
          const selected = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`discover-tab-${t.id}`}
              aria-selected={selected}
              aria-controls={`discover-panel-${t.id}`}
              onClick={() => select(t)}
              className={cn(
                'relative h-11 px-1 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                selected ? 'font-extrabold text-foreground' : 'font-semibold text-muted-foreground',
              )}
            >
              {t.label}
              <span
                aria-hidden
                className={cn(
                  'absolute bottom-0.5 left-1/2 h-0.75 w-6 -translate-x-1/2 rounded-full',
                  selected ? 'bg-brand' : 'bg-transparent',
                )}
              />
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`discover-panel-${tab}`}
        aria-labelledby={`discover-tab-${tab}`}
        className="min-h-0 flex-1"
      >
        {tab === 'video' ? (
          <DiscoverReels viewerSlug={viewerSlug} />
        ) : (
          // Focus the input when Cari was opened directly (top-bar search icon) or by tapping the tab.
          <CreatorSearch autoFocus />
        )}
      </div>
    </div>
  );
}
