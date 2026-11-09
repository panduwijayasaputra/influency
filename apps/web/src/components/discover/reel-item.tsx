'use client';

import Link from 'next/link';
import { useRef } from 'react';
import type { DiscoverVideo } from '@influency/shared';
import { ExpandableText } from '@/components/expandable-text';
import { FollowButton } from '@/components/follow-button';
import { PostVideo } from '@/components/post-video';
import { formatCompactNumber, formatNumber } from '@/lib/format';
import { useMediaAccess } from '@/lib/use-media-access';
import { useNearViewport } from '@/lib/use-near-viewport';
import { initials } from '@/lib/utils';

/** One full-screen reel: the post's first video + creator overlay (avatar, name, followers, caption, Ikuti). */
export function ReelItem({ video, showFollow }: { video: DiscoverVideo; showFollow: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref);
  const { state } = useMediaAccess(video.id, near);
  const media =
    state.kind === 'ready' ? state.access.media.find((m) => m.kind === 'VIDEO') : undefined;
  const { creator, follow } = video;
  const profile = `/${creator.slug}`;

  return (
    <section
      ref={ref}
      aria-label={`Video dari ${creator.displayName}`}
      className="relative h-full snap-start snap-always overflow-hidden bg-[#141418]"
    >
      {media && media.kind === 'VIDEO' ? (
        <PostVideo item={media} className="h-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 bg-linear-to-b from-[#2b2b33] to-[#141418]" />
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-b from-transparent to-black/65" />
      <div className="absolute inset-x-0 bottom-16 z-20 flex flex-col gap-2 px-4 text-white">
        <div className="flex items-center gap-3">
          <Link
            href={profile}
            aria-label={`Buka profil ${creator.displayName}`}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-full focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
          >
            {creator.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
              <img
                src={creator.avatarUrl}
                alt=""
                className="size-10 shrink-0 rounded-full border-2 border-white object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-white bg-white/20 text-sm font-bold"
              >
                {initials(creator.displayName)}
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="truncate font-bold">{creator.displayName}</span>
              <span
                className="text-xs text-white/80"
                aria-label={`${formatNumber(follow.followerCount)} pengikut`}
              >
                {formatCompactNumber(follow.followerCount)} pengikut
              </span>
            </span>
          </Link>
          {showFollow && (
            <FollowButton
              slug={creator.slug}
              creatorName={creator.displayName}
              initialFollowing={follow.following}
              onDark
            />
          )}
        </div>
        {video.caption && <ExpandableText text={video.caption} className="text-sm" />}
      </div>
    </section>
  );
}
