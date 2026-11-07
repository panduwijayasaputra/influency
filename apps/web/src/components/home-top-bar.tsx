'use client';

import { Bell, Search } from 'lucide-react';
import Link from 'next/link';
import { BrandLogo } from '@/components/brand-logo';
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

export const SHOW_NEAR_TOP_PX = 56;
export const SCROLL_DELTA_PX = 4;

/** Design rule: always shown near the top; hides on scroll down, shows on scroll up (ignoring jitter ≤ 4 px). */
export function nextHidden(hidden: boolean, y: number, dy: number): boolean {
  if (y < SHOW_NEAR_TOP_PX) return false;
  if (dy > SCROLL_DELTA_PX) return true;
  if (dy < -SCROLL_DELTA_PX) return false;
  return hidden;
}

export const ICON_BUTTON_CLASS =
  'relative flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function toTop(e: MouseEvent) {
  // Only rendered on Home, so the logo always means "back to the top".
  e.preventDefault();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/** Home-only top bar: logo, Cari, Notifikasi, account entry. Hides on scroll down. */
export function HomeTopBar({
  hasUnread = false,
  account,
}: {
  hasUnread?: boolean;
  /** The signed-in account entry (AccountDrawer); Home is signed-in only. */
  account: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const dy = y - lastY.current;
      lastY.current = y;
      setHidden((h) => nextHidden(h, y, dy));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      data-hidden={hidden}
      onFocusCapture={() => setHidden(false)}
      className="sticky top-0 z-30 border-b bg-card transition-transform duration-200 ease-out data-[hidden=true]:-translate-y-full motion-reduce:transition-none"
    >
      <div className="mx-auto flex h-14 w-full max-w-feed items-center justify-between pr-1.5 pl-3.5">
        <Link
          href="/"
          aria-label="Influency, ke atas Beranda"
          onClick={toTop}
          className="flex h-11 items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-0.5">
          <Link href="/discover" aria-label="Cari" className={ICON_BUTTON_CLASS}>
            <Search aria-hidden className="size-5.5" />
          </Link>
          <Link
            href="/notifications"
            aria-label={hasUnread ? 'Notifikasi, ada aktivitas baru' : 'Notifikasi'}
            className={ICON_BUTTON_CLASS}
          >
            <Bell aria-hidden className="size-5.5" />
            {hasUnread && (
              <span
                aria-hidden
                data-testid="unread-dot"
                className="absolute top-2.5 right-2.5 size-2 rounded-full border-2 border-card bg-primary"
              />
            )}
          </Link>
          {account}
        </div>
      </div>
    </header>
  );
}
