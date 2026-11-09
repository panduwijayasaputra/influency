import Link from 'next/link';
import type { ReactNode } from 'react';
import { initials } from '@/lib/utils';

/** A creator as a card (banner, avatar, name, @slug, 2-line bio) that opens the creator profile. */
export function CreatorCard({
  creator,
  bannerClassName = 'h-24',
  badge,
  ariaLabel,
}: {
  creator: {
    slug: string;
    displayName: string;
    avatarUrl: string | null;
    bannerUrl: string | null;
    bio: string | null;
  };
  bannerClassName?: string;
  /** Overlay at the top-right of the banner (Langganan: "Aktif · 12 hari lagi"). */
  badge?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={`/${creator.slug}`}
      aria-label={ariaLabel ?? `Buka ${creator.displayName}`}
      className="relative flex flex-col overflow-hidden rounded-2xl border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={`block bg-linear-to-br from-primary/70 to-brand/60 ${bannerClassName}`}
        aria-hidden
      >
        {creator.bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
          <img src={creator.bannerUrl} alt="" className="size-full object-cover" />
        )}
      </span>
      {badge && (
        <span className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1">{badge}</span>
      )}
      <span className="flex flex-col gap-1 px-3.5 pb-3.5">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
          <img
            src={creator.avatarUrl}
            alt=""
            className="-mt-7 size-14 rounded-full border-[3px] border-card object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="-mt-7 flex size-14 items-center justify-center rounded-full border-[3px] border-card bg-primary text-base font-extrabold text-primary-foreground"
          >
            {initials(creator.displayName)}
          </span>
        )}
        <span className="mt-1 text-[15px] font-extrabold">{creator.displayName}</span>
        <span className="text-[13px] text-muted-foreground">@{creator.slug}</span>
        {creator.bio && (
          <span className="line-clamp-2 text-[13.5px] leading-snug text-foreground/80">
            {creator.bio}
          </span>
        )}
      </span>
    </Link>
  );
}
