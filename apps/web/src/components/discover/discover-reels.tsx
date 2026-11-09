'use client';

import { Button } from '@/components/ui/button';
import { fetchDiscoverVideosPage } from '@/lib/api/discover';
import { usePagedList } from '@/lib/use-paged-list';
import { ReelItem } from './reel-item';

/** Full-height, snap-scrolling creator videos (US-065). Playback rules come from PostVideo: one video at a time. */
export function DiscoverReels({ viewerSlug }: { viewerSlug: string | null }) {
  const { items, status, loadingMore, retry, sentinelRef } = usePagedList(
    fetchDiscoverVideosPage,
    'discover',
  );

  if (status === 'loading' && items.length === 0) {
    return (
      <div
        aria-busy="true"
        aria-label="Memuat video"
        className="h-full animate-pulse bg-[#141418]"
      />
    );
  }

  if (items.length === 0 && status === 'error') {
    return (
      <div
        role="alert"
        className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center"
      >
        <p className="text-sm text-muted-foreground">Gagal memuat video.</p>
        <Button type="button" variant="outline" onClick={retry}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">Belum ada video.</p>
      </div>
    );
  }

  return (
    <div
      aria-label="Video creator, geser ke atas untuk video berikutnya"
      className="h-full snap-y snap-mandatory [scrollbar-width:none] overflow-y-auto overscroll-contain bg-[#141418]"
    >
      {items.map((item) => (
        <ReelItem key={item.id} video={item} showFollow={item.creator.slug !== viewerSlug} />
      ))}
      <div ref={sentinelRef} className="snap-start py-6 text-center text-sm text-white/70">
        {loadingMore && <p role="status">Memuat…</p>}
        {status === 'error' && (
          <div role="alert" className="flex flex-col items-center gap-3">
            <p>Gagal memuat video.</p>
            <Button type="button" variant="outline" onClick={retry}>
              Coba lagi
            </Button>
          </div>
        )}
        {status === 'done' && <p>Kamu sudah melihat semua video.</p>}
      </div>
    </div>
  );
}
