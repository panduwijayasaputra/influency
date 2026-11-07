'use client';

import { Lock, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { PublicPost } from '@influency/shared';
import { PremiumCover } from '@/app/(public)/[creatorSlug]/premium-cover';
import { MediaItemView } from '@/components/post-media-viewer';
import { MediaViewer } from '@/components/media-viewer/media-viewer';
import { PostUnlockSheet } from '@/components/purchase-sheet';
import { Button } from '@/components/ui/button';
import { pauseAllVideos } from '@/lib/video-playback';
import { useMediaAccess } from '@/lib/use-media-access';
import { useNearViewport } from '@/lib/use-near-viewport';
import { cn } from '@/lib/utils';
import type { PostCardCreator, PostCardPost } from './post-card';

const FRAME = 'relative aspect-4/5 w-full overflow-hidden bg-muted';
const CHIP = 'absolute top-3 left-3 z-10 rounded-full px-2.5 py-1 text-xs font-bold';

export function mediaSummary({
  imageCount,
  videoCount,
}: Pick<PublicPost, 'imageCount' | 'videoCount'>): string {
  return [imageCount && `${imageCount} foto`, videoCount && `${videoCount} video`]
    .filter(Boolean)
    .join(' · ');
}

type Props = {
  post: PostCardPost;
  creator: PostCardCreator;
  like: { liked: boolean; count: number };
  onLikeChange: (next: { liked: boolean; count: number }) => void;
  postHref: string;
  /** Where a guest's login returns to (US-007). */
  loginUrl: string;
  /** The post's own page: no "Lihat detail post" link. */
  detail?: boolean;
};

/** The card's media: locked premium preview (never media-access), or lazily loaded media in a carousel. */
export function PostMedia({ like, onLikeChange, ...props }: Props) {
  const { post, creator, postHref, loginUrl, detail } = props;
  if (post.access === 'locked') {
    return (
      <LockedMedia
        post={post}
        creatorName={creator.displayName}
        postHref={postHref}
        loginUrl={loginUrl}
        detail={detail}
      />
    );
  }
  return <AccessibleMedia post={post} creator={creator} like={like} onLikeChange={onLikeChange} />;
}

function LockedMedia({
  post,
  creatorName,
  postHref,
  loginUrl,
  detail,
}: Pick<Props, 'post' | 'postHref' | 'loginUrl' | 'detail'> & { creatorName: string }) {
  const price = post.offer?.priceCoins ?? 0;
  const buka = (
    <span className="flex h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">
      <Lock aria-hidden className="size-4" />
      Buka · {price} Koin
    </span>
  );
  return (
    <div
      className={FRAME}
      role="img"
      aria-label={`Post premium, preview diburamkan. ${mediaSummary(post)}`}
    >
      <PremiumCover previewUrl={post.previewUrl} className="size-full" />
      <span className={cn(CHIP, 'bg-accent text-accent-foreground')}>Premium</span>
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-linear-to-t from-black/60 to-transparent p-3 pt-10">
        <span className="text-sm font-semibold text-white">{mediaSummary(post)}</span>
        {post.viewer === null ? (
          <Link href={loginUrl} className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring">
            {buka}
          </Link>
        ) : (
          <PostUnlockSheet
            post={post}
            creatorName={creatorName}
            trigger={
              <button
                type="button"
                className="rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                {buka}
              </button>
            }
          >
            {!detail && (
              <Button asChild variant="outline" className="h-12">
                <Link href={postHref}>Lihat detail post</Link>
              </Button>
            )}
          </PostUnlockSheet>
        )}
      </div>
    </div>
  );
}

function AccessibleMedia({
  post,
  creator,
  like,
  onLikeChange,
}: Pick<Props, 'post' | 'creator' | 'like' | 'onLikeChange'>) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref);
  const { state, retry } = useMediaAccess(post.id, near);
  const [index, setIndex] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const premiumChip = post.visibility === 'PREMIUM' && (
    <span className={cn(CHIP, 'bg-success-surface text-success')}>Terbuka</span>
  );

  if (state.kind !== 'ready') {
    return (
      <div ref={ref} className={cn(FRAME, 'flex items-center justify-center')}>
        {premiumChip}
        {state.kind === 'failed' ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Gagal memuat media.</p>
            <Button type="button" variant="outline" size="sm" onClick={retry}>
              Coba lagi
            </Button>
          </div>
        ) : state.kind === 'loading' || state.kind === 'idle' ? (
          <span className="sr-only">Memuat media…</span>
        ) : (
          <p className="text-sm text-muted-foreground">Media tidak tersedia.</p>
        )}
      </div>
    );
  }

  const { media, watermark } = state.access;
  if (media.length === 0) return null;
  const total = media.length;
  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div className={FRAME}>
        {premiumChip}
        <div
          role={total > 1 ? 'region' : undefined}
          aria-roledescription={total > 1 ? 'carousel' : undefined}
          aria-label={total > 1 ? `Media ${index + 1}/${total}` : undefined}
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.min(total - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))));
          }}
          className="flex size-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto"
        >
          {media.map((item, i) => (
            <div
              key={item.id}
              aria-roledescription={total > 1 ? 'slide' : undefined}
              aria-label={total > 1 ? `${i + 1} dari ${total}` : undefined}
              className="relative size-full shrink-0 snap-center"
            >
              <MediaItemView
                item={item}
                watermark={watermark}
                active={i === index}
                className="aspect-auto size-full object-cover"
              />
              {item.kind === 'IMAGE' ? (
                <button
                  type="button"
                  aria-label="Buka layar penuh"
                  onClick={() => setViewer(i)}
                  className="absolute inset-0 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
                />
              ) : (
                <button
                  type="button"
                  aria-label="Layar penuh"
                  onClick={() => {
                    pauseAllVideos();
                    setViewer(i);
                  }}
                  className="absolute top-14 right-3 z-10 flex size-11 items-center justify-center rounded-full bg-black/60 text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <Maximize2 aria-hidden className="size-5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {total > 1 && (
          <span className="absolute top-3 right-3 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white">
            {index + 1}/{total}
          </span>
        )}
      </div>
      {viewer !== null && (
        <MediaViewer
          post={post}
          creator={creator}
          startIndex={viewer}
          open
          onOpenChange={(o) => !o && setViewer(null)}
          like={like}
          onLikeChange={onLikeChange}
        />
      )}
      {total > 1 && (
        <div aria-hidden className="flex justify-center gap-1.5">
          {media.map((item, i) => (
            <span
              key={item.id}
              className={cn('size-1.5 rounded-full', i === index ? 'bg-brand' : 'bg-border')}
            />
          ))}
        </div>
      )}
    </div>
  );
}
