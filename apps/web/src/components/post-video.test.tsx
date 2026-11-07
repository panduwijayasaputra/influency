import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MediaAccessItem } from '@influency/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pauseAllVideos } from '@/lib/video-playback';
import { formatDuration, PostVideo } from './post-video';

const hls = vi.hoisted(() => ({
  instances: [] as { config: unknown; source?: string; destroyed: boolean }[],
}));
vi.mock('hls.js', () => ({
  default: class {
    static isSupported = () => true;
    static Events = { ERROR: 'hlsError' };
    record: (typeof hls.instances)[number];
    constructor(config: unknown) {
      this.record = { config, destroyed: false };
      hls.instances.push(this.record);
    }
    on() {}
    loadSource(url: string) {
      this.record.source = url;
    }
    attachMedia() {}
    destroy() {
      this.record.destroyed = true;
    }
  },
}));

type Video = Extract<MediaAccessItem, { kind: 'VIDEO' }>;
const item = (overrides: Partial<Video> = {}): Video => ({
  id: 'v1',
  kind: 'VIDEO',
  url: '/api/v1/dev-storage/post-video/a?sig=1',
  posterUrl: '/api/v1/dev-storage/post-video-thumb/a.jpg?sig=1',
  player: 'video',
  durationSeconds: 65,
  ...overrides,
});

// Controllable IntersectionObserver: show(el, ratio) reports that element's visibility.
let observers: { cb: IntersectionObserverCallback; el?: Element }[] = [];
const show = (el: Element, ratio: number) =>
  act(() => {
    for (const o of observers.filter((o) => o.el === el)) {
      o.cb(
        [{ isIntersecting: ratio > 0, intersectionRatio: ratio } as IntersectionObserverEntry],
        o as never,
      );
    }
  });

let play: ReturnType<typeof vi.fn<(this: HTMLMediaElement) => Promise<void>>>;
let pause: ReturnType<typeof vi.fn<(this: HTMLMediaElement) => void>>;
let canPlayHls = '';
let reducedMotion = false;

beforeEach(() => {
  observers = [];
  hls.instances = [];
  canPlayHls = '';
  reducedMotion = false;
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      record: (typeof observers)[number];
      constructor(cb: IntersectionObserverCallback) {
        this.record = { cb };
        observers.push(this.record);
      }
      observe(el: Element) {
        this.record.el = el;
      }
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
  play = vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    return Promise.resolve();
  });
  pause = vi.fn(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(pause);
  vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation(
    () => canPlayHls as CanPlayTypeResult,
  );
});
afterEach(() => {
  act(() => pauseAllVideos());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const videoOf = (container: HTMLElement) => container.querySelector('video')!;

describe('PostVideo', () => {
  it('shows only the poster until mostly visible, then autoplays muted and inline', async () => {
    const { container } = render(<PostVideo item={item()} />);
    const video = videoOf(container);
    expect(video).toHaveAttribute('poster', item().posterUrl);
    expect(video).toHaveAttribute('preload', 'none');
    show(video, 0.3);
    expect(video.getAttribute('src')).toBeNull();
    expect(play).not.toHaveBeenCalled();
    show(video, 0.7);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.getAttribute('src')).toBe(item().url);
    show(video, 0);
    expect(pause).toHaveBeenCalled();
  });

  it('plays one video at a time', async () => {
    const { container } = render(
      <>
        <PostVideo item={item()} />
        <PostVideo item={item({ id: 'v2', url: '/b' })} />
      </>,
    );
    const [first, second] = container.querySelectorAll('video');
    show(first!, 1);
    await waitFor(() => expect(first!.paused).toBe(false));
    show(second!, 1);
    await waitFor(() => expect(second!.paused).toBe(false));
    expect(first!.paused).toBe(true);
  });

  it('never plays an inactive carousel slide', () => {
    const { container } = render(<PostVideo item={item()} active={false} />);
    show(videoOf(container), 1);
    expect(play).not.toHaveBeenCalled();
  });

  it('pauses when the tab goes to the background, or when everything is paused', async () => {
    const { container } = render(<PostVideo item={item()} />);
    const video = videoOf(container);
    show(video, 1);
    await waitFor(() => expect(video.paused).toBe(false));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    expect(video.paused).toBe(true);
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await waitFor(() => expect(video.paused).toBe(false));
    act(() => pauseAllVideos());
    expect(video.paused).toBe(true);
  });

  it('falls back to tap-to-play when the browser blocks autoplay', async () => {
    play.mockImplementationOnce(() => Promise.reject(new DOMException('no', 'NotAllowedError')));
    const { container } = render(<PostVideo item={item()} />);
    show(videoOf(container), 1);
    const button = await screen.findByRole('button', { name: 'Putar video' });
    expect(button.querySelector('svg')).not.toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Jeda video' })).toBeInTheDocument();
  });

  it('waits for a tap with reduced motion', async () => {
    reducedMotion = true;
    const { container } = render(<PostVideo item={item()} />);
    show(videoOf(container), 1);
    expect(play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Putar video' }));
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    // Scrolled away and back: still no autoplay, it needs another tap.
    show(videoOf(container), 0);
    show(videoOf(container), 1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Putar video' })).toBeInTheDocument();
  });

  it('toggles sound and shows the duration', () => {
    const { container } = render(<PostVideo item={item()} />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Nyalakan suara' }));
    expect(videoOf(container).muted).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Matikan suara' }));
    expect(videoOf(container).muted).toBe(true);
  });

  it('plays HLS through hls.js, or natively where supported', async () => {
    const hlsItem = item({
      player: 'hls',
      url: 'https://c.cloudflarestream.com/t/manifest/video.m3u8',
    });
    const { container, unmount } = render(<PostVideo item={hlsItem} />);
    show(videoOf(container), 1);
    await waitFor(() => expect(hls.instances[0]?.source).toBe(hlsItem.url));
    unmount();
    expect(hls.instances[0]!.destroyed).toBe(true);

    canPlayHls = 'maybe';
    const native = render(<PostVideo item={hlsItem} />);
    const video = videoOf(native.container);
    show(video, 1);
    await waitFor(() => expect(video.getAttribute('src')).toBe(hlsItem.url));
    expect(hls.instances).toHaveLength(1);
  });

  it('keeps the position when the URL is refreshed while playing', async () => {
    const hlsItem = item({ player: 'hls', url: 'https://c/t1/manifest/video.m3u8' });
    const { container, rerender } = render(<PostVideo item={hlsItem} />);
    const video = videoOf(container);
    show(video, 1);
    await waitFor(() => expect(hls.instances).toHaveLength(1));
    video.currentTime = 12;
    rerender(<PostVideo item={{ ...hlsItem, url: 'https://c/t2/manifest/video.m3u8' }} />);
    await waitFor(() => expect(hls.instances).toHaveLength(2));
    expect(hls.instances[0]!.destroyed).toBe(true);
    expect(hls.instances[1]).toMatchObject({
      source: 'https://c/t2/manifest/video.m3u8',
      config: { startPosition: 12 },
    });
  });

  it('uses native controls without the overlay on request', () => {
    const { container } = render(<PostVideo item={item()} nativeControls />);
    expect(videoOf(container)).toHaveAttribute('controls');
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('formatDuration', () => {
  it.each([
    [5, '0:05'],
    [65, '1:05'],
    [4503, '75:03'],
  ])('%i s → %s', (s, out) => expect(formatDuration(s)).toBe(out));
});
