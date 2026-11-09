import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MediaAccessResponse } from '@influency/shared';
import { PostMediaViewer } from './post-media-viewer';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const URL = `/api/v1/posts/${POST_ID}/media-access`;

const access = (n: number, expiresAt: string, watermark: string | null = 'a1b2c3d4') =>
  ({
    media: [
      { id: 'i', kind: 'IMAGE', url: `https://r2.example/img?v=${n}` },
      {
        id: 's',
        kind: 'VIDEO',
        url: `https://customer-x.cloudflarestream.com/t${n}/manifest/video.m3u8`,
        posterUrl: `https://customer-x.cloudflarestream.com/t${n}/thumbnails/thumbnail.jpg`,
        player: 'hls',
        durationSeconds: 65,
      },
      {
        id: 'v',
        kind: 'VIDEO',
        url: `/api/v1/dev-storage/post-video/x?v=${n}`,
        posterUrl: null,
        player: 'video',
        durationSeconds: null,
      },
    ],
    expiresAt,
    watermark,
  }) satisfies MediaAccessResponse;

function stubFetch(...responses: Response[]) {
  const fetchMock = vi.fn((..._args: unknown[]) =>
    Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PostMediaViewer', () => {
  // PostVideo watches visibility; these tests only render, so an inert observer is enough.
  beforeEach(() => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders images and no-download videos with posters, native controls and the watermark', async () => {
    const fetchMock = stubFetch(
      Response.json(access(1, new Date(Date.now() + 1800_000).toISOString())),
    );
    const { container } = render(<PostMediaViewer postId={POST_ID} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(URL, { cache: 'no-store' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://r2.example/img?v=1');
    expect(container.querySelector('iframe')).toBeNull();
    const [stream, file] = container.querySelectorAll('video');
    expect(stream).toHaveAttribute('poster', expect.stringContaining('/t1/thumbnails/'));
    expect(file).not.toHaveAttribute('poster');
    for (const video of [stream!, file!]) {
      expect(video).toHaveAttribute('controls');
      expect(video.getAttribute('controlslist')).toBe('nodownload');
      // Not attached until it plays (lazy).
      expect(video.getAttribute('src')).toBeNull();
    }
    expect(screen.getAllByTestId('watermark')).toHaveLength(3);
    expect(screen.getAllByTestId('watermark')[0]!.textContent).toBe('influency · a1b2c3d4');
  });

  it('shows no watermark for anonymous viewers', async () => {
    stubFetch(Response.json(access(1, new Date(Date.now() + 1800_000).toISOString(), null)));
    const { container } = render(<PostMediaViewer postId={POST_ID} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(screen.queryByTestId('watermark')).toBeNull();
  });

  it.each([
    [403, 'Konten ini terkunci.'],
    [404, 'Media tidak tersedia.'],
  ])('%i shows "%s" and no media', async (status, message) => {
    stubFetch(
      Response.json(
        { error: { code: 'X', message: 'x', requestId: 'r', details: null } },
        { status },
      ),
    );
    const { container } = render(<PostMediaViewer postId={POST_ID} />);
    expect(await screen.findByText(message)).toBeTruthy();
    expect(container.querySelector('img, iframe, video')).toBeNull();
  });

  it('offers a retry after a failure', async () => {
    const fetchMock = stubFetch(
      new Response(null, { status: 500 }),
      Response.json(access(1, new Date(Date.now() + 1800_000).toISOString())),
    );
    const { container } = render(<PostMediaViewer postId={POST_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fetches fresh URLs a minute before they expire and stops on unmount', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-04T00:00:00.000Z'), shouldAdvanceTime: true });
    const fetchMock = stubFetch(
      Response.json(access(1, '2026-11-04T00:30:00.000Z')),
      Response.json(access(2, '2026-11-04T01:00:00.000Z')),
    );
    const { container, unmount } = render(<PostMediaViewer postId={POST_ID} />);
    await waitFor(() => expect(container.querySelector('img')).not.toBeNull());
    await act(() => vi.advanceTimersByTimeAsync(29 * 60_000 - 1_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2_000));
    await waitFor(() =>
      expect(container.querySelector('img')?.getAttribute('src')).toBe(
        'https://r2.example/img?v=2',
      ),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    unmount();
    await act(() => vi.advanceTimersByTimeAsync(60 * 60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
