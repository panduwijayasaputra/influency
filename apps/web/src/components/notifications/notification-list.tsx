'use client';

import { Bell } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { NotificationItem } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { fetchNotificationsPage, markNotificationsRead } from '@/lib/api/notifications';
import { formatRelativeTime } from '@/lib/relative-time';
import { usePagedList } from '@/lib/use-paged-list';
import { cn, initials } from '@/lib/utils';

/** Notifikasi (US-067): my notifications, newest first; opening the page marks them read. */
export function NotificationList() {
  const { items, status, loadingMore, retry, sentinelRef } = usePagedList(
    fetchNotificationsPage,
    'notifications',
  );
  const [now] = useState(() => new Date());
  const marked = useRef(false);

  // Mark everything up to the newest loaded item as read, once. Rows keep their unread look for this visit.
  const newest = items[0]?.id;
  useEffect(() => {
    if (!newest || marked.current) return;
    marked.current = true;
    markNotificationsRead(newest).catch(() => {});
  }, [newest]);

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-1 px-4 pt-2 pb-3">
        <span className="self-start rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-primary-ink">
          Perlu konfirmasi
        </span>
        <p className="text-sm text-muted-foreground">Daftar notifikasi belum final.</p>
      </div>
      {status === 'loading' && items.length === 0 ? (
        <p role="status" className="px-4 py-6 text-sm text-muted-foreground">
          Memuat notifikasi…
        </p>
      ) : status === 'error' && items.length === 0 ? (
        <LoadError onRetry={retry} />
      ) : items.length === 0 ? (
        <p className="px-4 py-12 text-center text-sm text-muted-foreground">
          Belum ada notifikasi.
        </p>
      ) : (
        <ul className="flex flex-col divide-y border-y">
          {items.map((item) => (
            <li key={item.id}>
              <NotificationRow item={item} now={now} />
            </li>
          ))}
        </ul>
      )}
      <div ref={sentinelRef} className="px-4 py-6 text-center text-sm text-muted-foreground">
        {loadingMore && <p role="status">Memuat…</p>}
        {status === 'error' && items.length > 0 && <LoadError onRetry={retry} />}
      </div>
    </div>
  );
}

function NotificationRow({ item, now }: { item: NotificationItem; now: Date }) {
  const { actor } = item;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex min-h-16 items-start gap-3 px-4 py-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset',
        item.read ? 'bg-card' : 'bg-accent/40',
      )}
    >
      {actor?.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
        <img src={actor.avatarUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
        >
          {actor ? initials(actor.displayName) : <Bell className="size-5" />}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm leading-snug">
          {!item.read && <span className="sr-only">Belum dibaca: </span>}
          {actor && <b className="font-bold">{actor.displayName}</b>} {item.text}
        </span>
        <time dateTime={item.createdAt} className="text-xs text-muted-foreground">
          {formatRelativeTime(item.createdAt, now)}
        </time>
      </span>
    </Link>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <p className="text-sm text-muted-foreground">Gagal memuat notifikasi.</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}
