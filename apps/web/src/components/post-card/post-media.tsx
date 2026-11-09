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

const FRAME = 'relative aspect-4/5 w-full overflow-hidden rounded-2xl bg-muted';

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
  /** Called after a successful unlock so the card can re-render with its media. */
  onUnlocked: () => void;
};

/** The card's media: locked premium preview (never media-access), or lazily loaded media in a carousel. */
export function PostMedia({ like, onLikeChange, ...props }: Props) {
  const { post, creator } = props;
  if (post.access === 'locked') return <LockedMedia post={post} />;
  return <AccessibleMedia post={post} creator={creator} like={like} onLikeChange={onLikeChange} />;
}

function LockedMedia({ post }: Pick<Props, 'post'>) {
  return (
    <div className="px-4">
      <div
        className={FRAME}
        role="img"
        aria-label={`Post premium, preview diburamkan. ${mediaSummary(post)}`}
      >
        <PremiumCover previewUrl={post.previewUrl} className="size-full" />
        <span aria-hidden className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5 p-5 text-center text-white">
          <span className="flex size-14 items-center justify-center rounded-full bg-white text-primary-ink">
            <Lock aria-hidden className="size-6" />
          </span>
          <span className="text-[17px] font-extrabold">Post premium</span>
          <span className="text-[13.5px] font-semibold">{mediaSummary(post)}</span>
        </div>
      </div>
    </div>
  );
}

/** Full-width "Buka post · N Koin" under the actions of a locked post (guests go to login). */
export function UnlockCta({
  post,
  creatorName,
  postHref,
  loginUrl,
  detail,
  onUnlocked,
}: Pick<Props, 'post' | 'postHref' | 'loginUrl' | 'detail' | 'onUnlocked'> & {
  creatorName: string;
}) {
  const cta = (
    <span className="flex h-12.5 w-full items-center justify-center gap-2 rounded-[14px] bg-primary text-[15px] font-extrabold text-primary-foreground">
      <Lock aria-hidden className="size-4.5" />
      Buka post · {post.offer?.priceCoins ?? 0} Koin
    </span>
  );
  return (
    <div className="px-4 pb-2">
      {post.viewer === null ? (
        <Link
          href={loginUrl}
          className="block rounded-[14px] focus-visible:ring-2 focus-visible:ring-ring"
        >
          {cta}
        </Link>
      ) : (
        <PostUnlockSheet
          post={post}
          creatorName={creatorName}
          returnPath={postHref}
          onUnlocked={onUnlocked}
          subscribedToCreator={post.viewer?.subscribed === true}
          trigger={
            <button
              type="button"
              className="block w-full rounded-[14px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              {cta}
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

  if (state.kind !== 'ready') {
    return (
      <div ref={ref} className="px-4">
        <div className={cn(FRAME, 'flex items-center justify-center')}>
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
      </div>
    );
  }

  const { media, watermark } = state.access;
  if (media.length === 0) return null;
  const total = media.length;
  return (
    <div ref={ref} className="flex flex-col gap-2.5">
      <div
        role={total > 1 ? 'region' : undefined}
        aria-roledescription={total > 1 ? 'carousel' : undefined}
        aria-label={total > 1 ? `Media ${index + 1}/${total}` : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          const slide = el.firstElementChild as HTMLElement | null;
          // Slide width + the 8px gap is one step.
          const step = (slide?.offsetWidth ?? el.clientWidth) + 8;
          setIndex(Math.min(total - 1, Math.round(el.scrollLeft / Math.max(1, step))));
        }}
        className="flex snap-x snap-mandatory scroll-pl-4 [scrollbar-width:none] gap-2 overflow-x-auto px-4"
      >
        {media.map((item, i) => (
          <div
            key={item.id}
            aria-roledescription={total > 1 ? 'slide' : undefined}
            aria-label={total > 1 ? `${i + 1} dari ${total}` : undefined}
            className={cn(FRAME, 'shrink-0 snap-start', total > 1 ? 'basis-[86%]' : 'basis-full')}
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
            {total > 1 && (
              <span className="pointer-events-none absolute top-2.5 right-2.5 flex h-6 items-center rounded-xl bg-black/60 px-2 text-xs font-bold text-white">
                {i + 1}/{total}
              </span>
            )}
          </div>
        ))}
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
              className={cn(
                'h-1.5 rounded-full transition-all',
                i === index ? 'bg-primary-strong w-4.5' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
