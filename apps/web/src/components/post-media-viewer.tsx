'use client';

import type { SyntheticEvent } from 'react';
import type { MediaAccessItem } from '@influency/shared';
import { PostVideo } from '@/components/post-video';
import { Button } from '@/components/ui/button';
import { useMediaAccess } from '@/lib/use-media-access';
import { cn } from '@/lib/utils';

const MESSAGES = {
  idle: 'Memuat media…',
  loading: 'Memuat media…',
  locked: 'Konten ini terkunci.',
  missing: 'Media tidak tersedia.',
  failed: 'Gagal memuat media.',
} as const;

const blockMenu = (event: SyntheticEvent) => event.preventDefault();

/**
 * Viewable media of a post. URLs come from GET /posts/:id/media-access (server-side access check) in the browser
 * only, so they never end up in SSR HTML, and are refreshed before they expire. The watermark deters casual sharing;
 * it doesn't stop screen recording (docs/media-protection.md).
 */
export function PostMediaViewer({ postId }: { postId: string }) {
  const { state, retry } = useMediaAccess(postId);

  if (state.kind !== 'ready') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{MESSAGES[state.kind]}</p>
        {state.kind === 'failed' && (
          <Button type="button" variant="outline" size="sm" onClick={retry}>
            Coba lagi
          </Button>
        )}
      </div>
    );
  }

  const { media, watermark } = state.access;
  if (media.length === 0) return <p className="text-sm text-muted-foreground">Belum ada media.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {media.map((item) => (
        <li key={item.id} className="relative overflow-hidden rounded-md bg-muted">
          <MediaItemView item={item} watermark={watermark} nativeControls />
        </li>
      ))}
    </ul>
  );
}

/** One viewable media item (image or PostVideo) with the watermark overlay. Shared with PostCard. */
export function MediaItemView({
  item,
  watermark,
  className,
  active,
  nativeControls,
}: {
  item: MediaAccessItem;
  watermark: string | null;
  /** Sizing for the media element; PostCard fills its 4:5 frame. */
  className?: string;
  /** Videos: false for a carousel slide that isn't shown (it never plays). */
  active?: boolean;
  /** Videos: the browser's own controls instead of the card overlay. */
  nativeControls?: boolean;
}) {
  return (
    <>
      {item.kind === 'IMAGE' ? (
        /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image would fetch and cache it */
        <img
          src={item.url}
          alt=""
          draggable={false}
          onContextMenu={blockMenu}
          className={cn('w-full select-none', className)}
        />
      ) : (
        <PostVideo
          item={item}
          active={active}
          nativeControls={nativeControls}
          className={className}
        />
      )}
      {watermark && (
        <span
          aria-hidden
          data-testid="watermark"
          className="pointer-events-none absolute top-2 right-2 rounded bg-black/30 px-1.5 py-0.5 text-xs text-white/70 select-none"
        >
          influency · {watermark}
        </span>
      )}
    </>
  );
}
