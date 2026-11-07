'use client';

import { Lock, Play } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { PublicPost } from '@influency/shared';
import { PremiumCover } from '@/app/(public)/[creatorSlug]/premium-cover';
import { MediaViewer } from '@/components/media-viewer/media-viewer';
import type { PostCardCreator } from '@/components/post-card/post-card';
import { mediaSummary } from '@/components/post-card/post-media';
import { formatDuration } from '@/components/post-video';
import { useMediaAccess } from '@/lib/use-media-access';
import { useNearViewport } from '@/lib/use-near-viewport';

/** One square of the profile Grid: the post's first media. Accessible → full-screen viewer; locked → the post detail. */
export function GridTile({
  post,
  href,
  creator,
}: {
  post: PublicPost;
  href: string;
  creator: PostCardCreator;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [like, setLike] = useState({ liked: post.viewer?.liked ?? false, count: post.likeCount });
  const locked = post.access === 'locked';
  const first = post.media[0];
  const label = `${locked ? 'Post premium terkunci' : 'Post'} · ${mediaSummary(post)}`;
  const className =
    'relative block aspect-square w-full overflow-hidden bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
  const inner = (
    <>
      {locked ? (
        <>
          <PremiumCover previewUrl={post.previewUrl} className="aspect-square rounded-none" />
          <span className="absolute top-1.5 right-1.5 rounded-full bg-black/50 p-1 text-white">
            <Lock aria-hidden className="size-3.5" />
          </span>
        </>
      ) : (
        <AccessibleThumb post={post} />
      )}
      {first?.kind === 'VIDEO' && (
        <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 text-[11px] font-semibold text-white">
          <Play aria-hidden className="size-3 fill-current" />
          {first.durationSeconds !== null && formatDuration(first.durationSeconds)}
        </span>
      )}
    </>
  );
  if (locked) {
    return (
      <Link href={href} aria-label={label} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => setViewerOpen(true)}
        className={className}
      >
        {inner}
      </button>
      {viewerOpen && (
        <MediaViewer
          post={post}
          creator={creator}
          startIndex={0}
          open
          onOpenChange={setViewerOpen}
          like={like}
          onLikeChange={setLike}
        />
      )}
    </>
  );
}

// shortcut: one media-access call per tile and full-size originals; add a batch thumbnails endpoint if 429s show up.
function AccessibleThumb({ post }: { post: PublicPost }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  const { state } = useMediaAccess(post.id, near);
  const item = state.kind === 'ready' ? state.access.media[0] : undefined;
  const src = item?.kind === 'IMAGE' ? item.url : item?.kind === 'VIDEO' ? item.posterUrl : null;
  return (
    <div ref={ref} className="size-full">
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image would proxy and cache it
        <img src={src} alt="" loading="lazy" className="size-full object-cover" />
      )}
    </div>
  );
}
