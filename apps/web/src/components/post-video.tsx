'use client';

import { Play, Volume2, VolumeX } from 'lucide-react';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { MediaAccessItem } from '@influency/shared';
import { cn } from '@/lib/utils';
import {
  AUTOPLAY_VISIBLE_RATIO,
  claimPlayback,
  prefersTapToPlay,
  releasePlayback,
  usePlaybackActive,
} from '@/lib/video-playback';

type VideoItem = Extract<MediaAccessItem, { kind: 'VIDEO' }>;
type HlsInstance = { destroy(): void };

const OVERLAY_BUTTON =
  'absolute bottom-3 z-10 flex size-11 items-center justify-center rounded-full bg-black/60 text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

const noSubscribe = () => () => {};

/** m:ss; minutes keep counting past an hour (75:03). */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A post video (US-009, LOCKED Option B): muted inline autoplay while it is the active slide, at least
 * AUTOPLAY_VISIBLE_RATIO on screen and the tab is visible, one video at a time (lib/video-playback). The source is only
 * attached on the first play (poster before that), so unwatched videos load no bytes. Reduced motion, data saving or a
 * blocked autoplay switch to tap-to-play.
 */
export function PostVideo({
  item,
  active = true,
  nativeControls = false,
  className,
}: {
  item: VideoItem;
  /** False for a carousel slide that isn't shown. */
  active?: boolean;
  /** The browser's own controls (seeking on the post page) instead of the card overlay. */
  nativeControls?: boolean;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLVideoElement>(null);
  const hls = useRef<HlsInstance | null>(null);
  const attachedUrl = useRef<string | null>(null);
  // Reduced motion / data saving, read in the browser only (false during SSR and hydration).
  const prefersTap = useSyncExternalStore(noSubscribe, prefersTapToPlay, () => false);
  const [blocked, setBlocked] = useState(false);
  // A tap allows one playback; once it pauses, tap-to-play needs a tap again.
  const [tapped, setTapped] = useState(false);
  const [visible, setVisible] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const [userPaused, setUserPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [duration, setDuration] = useState(item.durationSeconds);

  const tapMode = (prefersTap || blocked) && !tapped;
  const { url, player } = item;
  const wants = active && visible && pageVisible && !tapMode && !userPaused && !failed;
  const playing = usePlaybackActive(id) && wants;
  const [wasPlaying, setWasPlaying] = useState(false);
  if (playing !== wasPlaying) {
    // Adjusting state on a prop/store change during render (no effect): a stopped tap-started video needs a tap again.
    setWasPlaying(playing);
    if (!playing) setTapped(false);
  }

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const shown = !!entry?.isIntersecting && entry.intersectionRatio >= AUTOPLAY_VISIBLE_RATIO;
        setVisible(shown);
        if (!shown) setUserPaused(false);
      },
      { threshold: AUTOPLAY_VISIBLE_RATIO },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const update = () => setPageVisible(document.visibilityState !== 'hidden');
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  useEffect(() => {
    if (!wants) return;
    claimPlayback(id);
    return () => releasePlayback(id);
  }, [wants, id]);

  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);

  useEffect(() => () => hls.current?.destroy(), []);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    if (!playing) {
      if (!video.paused) video.pause();
      return;
    }
    let live = true;

    /** Attaches (or, after a URL refresh, reattaches at the same position) the source; false if it can't play here. */
    async function attach(el: HTMLVideoElement, url: string): Promise<boolean> {
      if (attachedUrl.current === url) return true;
      const resumeAt = attachedUrl.current ? el.currentTime : 0;
      hls.current?.destroy();
      hls.current = null;
      if (player === 'hls' && !el.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('hls.js');
        if (!Hls.isSupported()) {
          setFailed(true);
          return false;
        }
        const instance = new Hls({ startPosition: resumeAt || -1 });
        instance.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) setFailed(true);
        });
        instance.loadSource(url);
        instance.attachMedia(el);
        hls.current = instance;
      } else {
        el.src = url;
        if (resumeAt) {
          el.addEventListener('loadedmetadata', () => (el.currentTime = resumeAt), { once: true });
        }
      }
      attachedUrl.current = url;
      return true;
    }

    void (async () => {
      if (!(await attach(video, url)) || !live) return;
      try {
        await video.play();
      } catch (error) {
        if (live && error instanceof DOMException && error.name === 'NotAllowedError') {
          setBlocked(true);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [playing, url, player]);

  function toggle() {
    if (playing) {
      setUserPaused(true);
      return;
    }
    if (tapMode) setTapped(true);
    setUserPaused(false);
    claimPlayback(id);
  }

  return (
    <>
      <video
        ref={ref}
        muted={muted}
        playsInline
        loop
        preload="none"
        poster={item.posterUrl ?? undefined}
        controls={nativeControls}
        controlsList="nodownload"
        disablePictureInPicture
        onContextMenu={(event) => event.preventDefault()}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          if (duration === null && Number.isFinite(seconds)) setDuration(Math.round(seconds));
        }}
        onError={() => setFailed(true)}
        className={cn('w-full bg-black', nativeControls ? 'aspect-video' : undefined, className)}
      />
      {failed ? (
        <p className="absolute inset-0 flex items-center justify-center bg-black/60 px-4 text-center text-sm text-white">
          Video tidak dapat diputar.
        </p>
      ) : (
        !nativeControls && (
          <>
            <button
              type="button"
              aria-label={playing ? 'Jeda video' : 'Putar video'}
              onClick={toggle}
              className="absolute inset-0 flex items-center justify-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            >
              {!playing && (tapMode || userPaused) && (
                <span className="flex size-14 items-center justify-center rounded-full bg-black/60 text-white">
                  <Play aria-hidden className="size-7 fill-current" />
                </span>
              )}
            </button>
            {duration !== null && duration > 0 && (
              <span className="absolute bottom-3 left-3 z-10 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold text-white tabular-nums">
                {formatDuration(duration)}
              </span>
            )}
            <button
              type="button"
              aria-label={muted ? 'Nyalakan suara' : 'Matikan suara'}
              onClick={() => setMuted((m) => !m)}
              className={cn(OVERLAY_BUTTON, 'right-3')}
            >
              {muted ? (
                <VolumeX aria-hidden className="size-5" />
              ) : (
                <Volume2 aria-hidden className="size-5" />
              )}
            </button>
          </>
        )
      )}
    </>
  );
}
