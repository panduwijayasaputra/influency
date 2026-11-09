'use client';

import { X } from 'lucide-react';
import { Dialog } from 'radix-ui';
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { CommentsSheet } from '@/components/comments/comments-sheet';
import { MediaItemView } from '@/components/post-media-viewer';
import type { PostCardCreator, PostCardPost } from '@/components/post-card/post-card';
import { SWIPE_CLOSE_PX, SWIPE_CLOSE_VELOCITY } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { useMediaAccess } from '@/lib/use-media-access';
import { pauseAllVideos } from '@/lib/video-playback';
import { ViewerActions } from './viewer-actions';

export type MediaViewerProps = {
  /** Accessible posts only: callers never open the viewer for locked ones. */
  post: PostCardPost;
  creator: PostCardCreator;
  startIndex: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  like: { liked: boolean; count: number };
  onLikeChange: (next: { liked: boolean; count: number }) => void;
};

const NO_DRAG_TARGETS = 'video, button, a, textarea, input';
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Full-screen 9:16 viewer (US-013): swipe between media, swipe down / X / Escape to close.
 * shortcut: mouse drag between slides isn't supported (arrow keys and touch/trackpad scroll only); add pointer drag if desktop asks.
 * shortcut: opening refetches media-access (one extra call per open); reuse the card's loaded access if 429s show up.
 */
export function MediaViewer({
  post,
  creator,
  startIndex,
  open,
  onOpenChange,
  like,
  onLikeChange,
}: MediaViewerProps) {
  const { state, retry } = useMediaAccess(post.id, open);
  const [index, setIndex] = useState(startIndex);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [dragY, setDragY] = useState(0);
  const drag = useRef<{ x: number; y: number; t: number } | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);
  const ready = state.kind === 'ready';

  useEffect(() => {
    if (open) pauseAllVideos();
  }, [open]);

  // Land on the tapped slide once the track exists.
  useLayoutEffect(() => {
    const el = trackRef.current;
    if (ready && el) el.scrollLeft = startIndex * el.clientWidth;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the media first appears
  }, [ready]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.currentTarget.scrollBy({
      left: dir * e.currentTarget.clientWidth,
      behavior: reducedMotion() ? 'auto' : 'smooth',
    });
  }

  function endDrag(e: PointerEvent) {
    const start = drag.current;
    drag.current = null;
    setDragY(0);
    if (!start) return;
    const dx = Math.abs(e.clientX - start.x);
    const dy = e.clientY - start.y;
    const velocity = dy / (e.timeStamp - start.t || 1);
    if (dy > dx && (dy > SWIPE_CLOSE_PX || velocity > SWIPE_CLOSE_VELOCITY)) onOpenChange(false);
  }

  let body;
  if (state.kind === 'ready') {
    const { media, watermark } = state.access;
    body = (
      <div
        ref={trackRef}
        role={media.length > 1 ? 'region' : undefined}
        aria-roledescription={media.length > 1 ? 'carousel' : undefined}
        aria-label={media.length > 1 ? `Media ${index + 1}/${media.length}` : undefined}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(
            Math.min(media.length - 1, Math.round(el.scrollLeft / Math.max(1, el.clientWidth))),
          );
        }}
        className="flex size-full touch-pan-x snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto"
      >
        {media.map((item, i) => (
          <div key={item.id} className="relative size-full shrink-0 snap-center">
            <MediaItemView
              item={item}
              watermark={watermark}
              active={i === index}
              nativeControls
              className="aspect-auto size-full object-contain"
            />
          </div>
        ))}
      </div>
    );
  } else if (state.kind === 'failed') {
    body = (
      <div className="flex size-full flex-col items-center justify-center gap-2">
        <p className="text-sm">Gagal memuat media.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-foreground"
          onClick={retry}
        >
          Coba lagi
        </Button>
      </div>
    );
  } else {
    const message =
      state.kind === 'locked'
        ? 'Konten ini terkunci.'
        : state.kind === 'missing'
          ? 'Media tidak tersedia.'
          : 'Memuat media…';
    body = <p className="flex size-full items-center justify-center text-sm">{message}</p>;
  }
  const total = state.kind === 'ready' ? state.access.media.length : 0;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          onOpenAutoFocus={() => {
            returnFocus.current = document.activeElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (returnFocus.current as HTMLElement | null)?.focus?.();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black text-white focus:outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 motion-reduce:animate-none"
        >
          <Dialog.Title className="sr-only">{`Media ${creator.displayName}, layar penuh`}</Dialog.Title>
          <Dialog.Description className="sr-only">
            Geser untuk melihat media lain. Tekan Escape untuk menutup.
          </Dialog.Description>
          <div
            data-testid="viewer-frame"
            style={dragY && !reducedMotion() ? { transform: `translateY(${dragY}px)` } : undefined}
            onPointerDown={(e) => {
              if (e.button !== 0 || (e.target as Element).closest(NO_DRAG_TARGETS)) return;
              drag.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
            }}
            onPointerMove={(e) => {
              if (drag.current) setDragY(Math.max(0, e.clientY - drag.current.y));
            }}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="relative flex aspect-9/16 h-dvh max-w-full flex-col bg-black"
          >
            <div className="relative min-h-0 flex-1">{body}</div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Tutup layar penuh"
                style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
                className="absolute left-3 z-20 flex size-11 items-center justify-center rounded-full bg-black/60 text-white focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
              >
                <X aria-hidden className="size-5" />
              </button>
            </Dialog.Close>
            {total > 1 && (
              <span
                aria-live="polite"
                style={{ top: 'calc(0.75rem + env(safe-area-inset-top))' }}
                className="absolute right-3 z-20 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold"
              >
                {index + 1}/{total}
              </span>
            )}
            <ViewerActions
              post={post}
              creator={creator}
              like={like}
              onLikeChange={onLikeChange}
              onOpenComments={() => setCommentsOpen(true)}
            />
          </div>
          {/* Outside the frame: events from the portalled sheet bubble through React and must not start a drag. */}
          <CommentsSheet
            post={post}
            creator={creator}
            open={commentsOpen}
            onOpenChange={setCommentsOpen}
            size="compact"
            count={post.commentCount}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
