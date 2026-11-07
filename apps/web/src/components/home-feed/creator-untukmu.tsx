'use client';

import Link from 'next/link';
import { type PointerEvent, useRef, useState } from 'react';
import type { RecommendedCreator } from '@influency/shared';
import { FollowButton } from '@/components/follow-button';
import { initials } from '@/lib/utils';

const PAGE_SIZE = 3;
const DRAG_THRESHOLD_PX = 5;

function pagesOf(creators: RecommendedCreator[]): RecommendedCreator[][] {
  const pages: RecommendedCreator[][] = [];
  for (let i = 0; i < creators.length; i += PAGE_SIZE) pages.push(creators.slice(i, i + PAGE_SIZE));
  return pages;
}

function CreatorCard({ creator }: { creator: RecommendedCreator }) {
  return (
    <div className="relative h-50 shrink-0 overflow-hidden rounded-2xl bg-linear-to-br from-primary/70 to-brand/60">
      {creator.bannerUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
        <img
          src={creator.bannerUrl}
          alt=""
          draggable={false}
          className="absolute inset-0 size-full object-cover"
        />
      )}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-3/5 bg-linear-to-b from-transparent to-black/60"
      />
      <div className="absolute inset-x-3.5 bottom-3.5 flex items-center gap-2.5 text-white">
        <Link
          href={`/${creator.slug}`}
          draggable={false}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
        >
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
            <img
              src={creator.avatarUrl}
              alt=""
              draggable={false}
              className="size-10 shrink-0 rounded-full border-2 border-white object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-white bg-primary text-sm font-extrabold text-primary-foreground"
            >
              {initials(creator.displayName)}
            </span>
          )}
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-extrabold">{creator.displayName}</span>
            <span className="truncate text-xs text-white/90">@{creator.slug}</span>
          </span>
        </Link>
        <FollowButton
          slug={creator.slug}
          creatorName={creator.displayName}
          onDark
          className="h-9 px-4 text-xs"
        />
      </div>
    </div>
  );
}

/** "Creator untukmu": pages of 3 full-width cards you swipe or drag, with page dots (US-023). */
export function CreatorUntukmu({ creators }: { creators: RecommendedCreator[] }) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const [page, setPage] = useState(0);
  const pages = pagesOf(creators);
  if (pages.length === 0) return null;

  // Touch scrolls natively; a mouse drag moves scrollLeft by hand (snap settles it on release).
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || !track.current) return;
    drag.current = { x: e.clientX, left: track.current.scrollLeft, moved: false };
  };
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || !track.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > DRAG_THRESHOLD_PX) d.moved = true;
    if (d.moved) track.current.scrollLeft = d.left - dx;
  };
  const onPointerUp = () => {
    // Left in place until the click that follows a drag has been swallowed (see onClickCapture).
    setTimeout(() => (drag.current = null), 0);
  };

  return (
    <section aria-label="Creator untukmu" className="flex flex-col gap-3 bg-card py-4">
      <div className="flex items-center justify-between pr-2 pl-4">
        <h2 className="text-base font-extrabold">Creator untukmu</h2>
        <Link
          href="/discover"
          className="flex min-h-11 items-center px-2 text-sm font-bold text-brand"
        >
          Jelajahi
        </Link>
      </div>
      <div
        ref={track}
        aria-roledescription="carousel"
        aria-label="Creator untukmu, geser untuk lainnya"
        onScroll={(e) => {
          const el = e.currentTarget;
          setPage(Math.round(el.scrollLeft / el.clientWidth));
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={(e) => {
          if (drag.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className="flex snap-x snap-mandatory [scrollbar-width:none] gap-2.5 overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden"
      >
        {pages.map((items, i) => (
          <div
            key={i}
            role="group"
            aria-roledescription="slide"
            aria-label={`Halaman ${i + 1} dari ${pages.length}`}
            className="flex shrink-0 basis-full snap-start flex-col gap-2.5"
          >
            {items.map((creator) => (
              <CreatorCard key={creator.slug} creator={creator} />
            ))}
          </div>
        ))}
      </div>
      {pages.length > 1 && (
        <div aria-hidden className="flex justify-center gap-1.5">
          {pages.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full bg-foreground/25 transition-all ${i === page ? 'w-4 bg-foreground/70' : 'w-1.5'}`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
