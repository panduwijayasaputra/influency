'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { HomeFeedItem, RecommendedCreator } from '@influency/shared';
import { PostCard } from '@/components/post-card/post-card';
import { Button } from '@/components/ui/button';
import { fetchHomeFeedPage } from '@/lib/api/home-feed';
import { fetchRecommendedCreators } from '@/lib/api/recommended-creators';
import { CreatorUntukmu } from './creator-untukmu';

const SUGGESTIONS_AFTER = 5;

type Status = 'loading' | 'idle' | 'error' | 'done';

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Memuat postingan" className="flex flex-col divide-y">
      {[0, 1].map((i) => (
        <div key={i} className="flex animate-pulse flex-col gap-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-full bg-muted" />
            <div className="h-3 w-32 rounded bg-muted" />
          </div>
          <div className="aspect-square w-full rounded-xl bg-muted" />
        </div>
      ))}
    </div>
  );
}

/** Beranda: one mixed feed of PostCards with infinite scroll (US-022). Data comes from `fetchHomeFeedPage`. */
export function HomeFeed() {
  const [items, setItems] = useState<HomeFeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const inFlight = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creators, setCreators] = useState<RecommendedCreator[]>([]);

  const load = useCallback(async (from: string | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoadingMore(from !== null);
    try {
      const page = await fetchHomeFeedPage(from);
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      setCursor(page.nextCursor);
      setStatus(page.nextCursor === null ? 'done' : 'idle');
    } catch {
      setStatus('error');
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  }, []);

  // Loads start from callbacks (a timer, the observer, click handlers): react-hooks/set-state-in-effect forbids
  // setting state in the effect body itself.
  useEffect(() => {
    const id = setTimeout(() => void load(null), 0);
    return () => clearTimeout(id);
  }, [load]);

  // Suggestions are a bonus: a failure hides the block instead of breaking the feed.
  useEffect(() => {
    const id = setTimeout(() => {
      fetchRecommendedCreators().then(setCreators, () => {});
    }, 0);
    return () => clearTimeout(id);
  }, []);

  // Re-created after every page: observe() reports the current state again, so a page that leaves the sentinel in
  // view loads the next one.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || status !== 'idle' || cursor === null) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry!.isIntersecting) void load(cursor);
      },
      { rootMargin: '400px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [status, cursor, load]);

  // Event handlers may set state; effects may not (react-hooks/set-state-in-effect).
  const retryFirst = () => {
    setStatus('loading');
    void load(null);
  };
  // Back to idle: the observer effect loads `cursor` again, since the sentinel (holding this button) is in view.
  const retryNext = () => setStatus('idle');

  if (status === 'loading') return <Skeleton />;

  if (items.length === 0 && status === 'error') return <FeedError onRetry={retryFirst} />;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="text-lg font-extrabold">Belum ada postingan</h2>
        <p className="text-sm text-muted-foreground">Postingan dari creator akan muncul di sini.</p>
        <Button asChild>
          <Link href="/discover">Jelajahi</Link>
        </Button>
        <div className="mt-6 w-full border-t">
          <CreatorUntukmu creators={creators} />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col divide-y">
        {items.map((item, i) => (
          <Fragment key={item.id}>
            <PostCard post={item} creator={item.creator} linkCreator />
            {/* After the 5th post; a feed that ends sooner gets it after its last post. */}
            {i === SUGGESTIONS_AFTER - 1 && <CreatorUntukmu creators={creators} />}
          </Fragment>
        ))}
        {status === 'done' && items.length < SUGGESTIONS_AFTER && (
          <CreatorUntukmu creators={creators} />
        )}
      </div>
      <div ref={sentinel} className="px-4 py-6 text-center text-sm text-muted-foreground">
        {loadingMore && <p role="status">Memuat…</p>}
        {status === 'error' && <FeedError onRetry={retryNext} />}
        {status === 'done' && <p>Kamu sudah melihat semua postingan.</p>}
      </div>
    </>
  );
}

function FeedError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <p className="text-sm text-muted-foreground">Postingan belum bisa dimuat.</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}
