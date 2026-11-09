'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Page<T> = { items: T[]; nextCursor: string | null };
export type PagedStatus = 'loading' | 'idle' | 'error' | 'done';

/**
 * Cursor-paged list with infinite scroll. `key` identifies the query: when it changes the list resets and reloads,
 * and a response for the old key is ignored. Attach `sentinelRef` to an element below the list.
 */
export function usePagedList<T extends { id: string }>(
  load: (cursor: string | null) => Promise<Page<T>>,
  key: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [status, setStatus] = useState<PagedStatus>('loading');
  const [loadingMore, setLoadingMore] = useState(false);
  const cursor = useRef<string | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const loadRef = useRef(load);
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadRef.current = load;
  });

  const run = useCallback(async (from: string | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    const mine = generation.current;
    setLoadingMore(from !== null);
    try {
      const page = await loadRef.current(from);
      if (mine !== generation.current) return;
      setItems((prev) => {
        if (from === null) return page.items;
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...page.items.filter((i) => !seen.has(i.id))];
      });
      cursor.current = page.nextCursor;
      setStatus(page.nextCursor === null ? 'done' : 'idle');
    } catch {
      if (mine === generation.current) setStatus('error');
    } finally {
      if (mine === generation.current) {
        inFlight.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  // Starts from a timer callback: react-hooks/set-state-in-effect forbids setting state in the effect body.
  useEffect(() => {
    const id = setTimeout(() => {
      generation.current += 1;
      inFlight.current = false;
      cursor.current = null;
      setItems([]);
      setStatus('loading');
      void run(null);
    }, 0);
    return () => clearTimeout(id);
  }, [key, run]);

  const loadMore = useCallback(() => {
    if (status === 'idle' && cursor.current) void run(cursor.current);
  }, [status, run]);

  const retry = useCallback(() => {
    setStatus(cursor.current ? 'idle' : 'loading');
    void run(cursor.current);
  }, [run]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || status !== 'idle' || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: '600px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [status, loadMore, items.length]);

  return { items, status, loadingMore, loadMore, retry, sentinelRef };
}
