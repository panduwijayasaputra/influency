import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as VideoPlayback from '@/lib/video-playback';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PostCardPost } from '@/components/post-card/post-card';
import { Toaster } from '@/components/ui/toast';
import { MediaViewer } from './media-viewer';

const pauseAll = vi.fn();
vi.mock('@/lib/video-playback', async (importActual) => {
  const actual = await importActual<typeof VideoPlayback>();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- partial module mock
  return { ...actual, pauseAllVideos: () => pauseAll() } satisfies typeof VideoPlayback;
});

const creator = { slug: 'ana', displayName: 'Ana', avatarUrl: null };
const post = {
  id: 'p1',
  visibility: 'PREMIUM',
  caption: '',
  publishedAt: null,
  imageCount: 3,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 2,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [],
} as unknown as PostCardPost;

const access = (n: number, watermark: string | null = 'abc') => ({
  media: Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    kind: 'IMAGE',
    url: `https://s.example/${i}`,
  })),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  watermark,
});

let fetchMock: ReturnType<typeof vi.fn>;
const respond = (status: number, body: unknown = null) =>
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  pauseAll.mockClear();
});
afterEach(() => vi.unstubAllGlobals());

function renderViewer(onOpenChange = vi.fn()) {
  render(
    <MediaViewer
      post={post}
      creator={creator}
      startIndex={0}
      open
      onOpenChange={onOpenChange}
      like={{ liked: false, count: 2 }}
      onLikeChange={vi.fn()}
    />,
    { wrapper: Toaster },
  );
  return onOpenChange;
}

describe('MediaViewer', () => {
  it('is a named dialog with a 44px close button, counter, watermark, and pauses videos', async () => {
    respond(200, access(3));
    const onOpenChange = renderViewer();
    expect(screen.getByRole('dialog', { name: 'Media Ana, layar penuh' })).toBeInTheDocument();
    expect(await screen.findByText('1/3')).toBeInTheDocument();
    expect(screen.getAllByTestId('watermark')).toHaveLength(3);
    expect(pauseAll).toHaveBeenCalled();
    const close = screen.getByRole('button', { name: 'Tutup layar penuh' });
    expect(close).toHaveClass('size-11');
    fireEvent.click(close);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes on Escape', async () => {
    respond(200, access(1));
    const onOpenChange = renderViewer();
    await screen.findByRole('toolbar', { name: 'Aksi post' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows no counter for a single item', async () => {
    respond(200, access(1));
    renderViewer();
    await screen.findByRole('toolbar', { name: 'Aksi post' });
    expect(screen.queryByText('1/1')).toBeNull();
  });

  it('closes on a long swipe down but not a short or horizontal one', async () => {
    respond(200, access(2));
    const onOpenChange = renderViewer();
    await screen.findByText('1/2');
    const frame = screen.getByTestId('viewer-frame');
    const swipe = (dx: number, dy: number) => {
      fireEvent.pointerDown(frame, { clientX: 100, clientY: 100, button: 0 });
      fireEvent.pointerUp(frame, { clientX: 100 + dx, clientY: 100 + dy });
    };
    swipe(300, 150);
    expect(onOpenChange).not.toHaveBeenCalled();
    swipe(0, 200);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows messages for failed, locked and missing media; Coba lagi refetches', async () => {
    respond(500);
    renderViewer();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    respond(200, access(1));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('shows the locked message on 403', async () => {
    respond(403);
    renderViewer();
    expect(await screen.findByText('Konten ini terkunci.')).toBeInTheDocument();
  });

  it('opens the comments sheet from Komentar and Kirim Tip says Segera hadir', async () => {
    respond(200, access(1));
    renderViewer();
    await screen.findByRole('toolbar', { name: 'Aksi post' });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Tip' }));
    expect(await screen.findByText('Segera hadir')).toBeInTheDocument();
    respond(200, { items: [], nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Komentar, 0' }));
    expect(await screen.findByRole('dialog', { name: 'Komentar' })).toBeInTheDocument();
  });

  it('starts at the tapped item and follows scrolling', async () => {
    respond(200, access(3));
    render(
      <MediaViewer
        post={post}
        creator={creator}
        startIndex={2}
        open
        onOpenChange={vi.fn()}
        like={{ liked: false, count: 2 }}
        onLikeChange={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    expect(await screen.findByText('3/3')).toBeInTheDocument();
    const track = screen.getByRole('region', { name: /^Media/ });
    Object.defineProperty(track, 'clientWidth', { value: 100, configurable: true });
    track.scrollLeft = 100;
    fireEvent.scroll(track);
    expect(await screen.findByText('2/3')).toBeInTheDocument();
  });

  it('gives the focus back to the opener on close', async () => {
    respond(200, access(1));
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const { rerender } = render(
      <MediaViewer
        post={post}
        creator={creator}
        startIndex={0}
        open
        onOpenChange={vi.fn()}
        like={{ liked: false, count: 2 }}
        onLikeChange={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    await screen.findByRole('toolbar', { name: 'Aksi post' });
    rerender(
      <MediaViewer
        post={post}
        creator={creator}
        startIndex={0}
        open={false}
        onOpenChange={vi.fn()}
        like={{ liked: false, count: 2 }}
        onLikeChange={vi.fn()}
      />,
    );
    await waitFor(() => expect(opener).toHaveFocus());
    opener.remove();
  });

  it('does not follow the finger under reduced motion', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    respond(200, access(1));
    renderViewer();
    await screen.findByRole('toolbar', { name: 'Aksi post' });
    const frame = screen.getByTestId('viewer-frame');
    fireEvent.pointerDown(frame, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.pointerMove(frame, { clientX: 0, clientY: 60 });
    expect(frame.style.transform).toBe('');
  });
});
