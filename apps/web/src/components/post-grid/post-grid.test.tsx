import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import type { PublicPost } from '@influency/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { GridTile } from './grid-tile';
import { filterPosts, PostGrid } from './post-grid';

const SIGNED_URL = 'https://storage.example/signed/one?sig=x';

const post = (id: string, overrides: Partial<PublicPost> = {}): PublicPost => ({
  id,
  visibility: 'FREE',
  caption: '',
  publishedAt: new Date().toISOString(),
  imageCount: 1,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [{ kind: 'IMAGE', durationSeconds: null }],
  ...overrides,
});
const VIDEO = {
  imageCount: 0,
  videoCount: 1,
  media: [{ kind: 'VIDEO' as const, durationSeconds: 65 }],
};
const locked = {
  visibility: 'PREMIUM' as const,
  access: 'locked' as const,
  offer: { priceCoins: 8 },
};

const FREE_IMAGE = post('free-image');
const FREE_VIDEO = post('free-video', VIDEO);
const PREMIUM_IMAGE = post('premium-image', { ...locked, previewUrl: '/preview/pi' });
const PREMIUM_VIDEO = post('premium-video', { ...locked, ...VIDEO, previewUrl: '/preview/pv' });
const MIXED = post('mixed', {
  imageCount: 1,
  videoCount: 1,
  media: [
    { kind: 'IMAGE', durationSeconds: null },
    { kind: 'VIDEO', durationSeconds: 5 },
  ],
});
const ALL = [FREE_IMAGE, FREE_VIDEO, PREMIUM_IMAGE, PREMIUM_VIDEO, MIXED];

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      Response.json({
        media: [
          url.includes('free-video')
            ? {
                id: 'm',
                kind: 'VIDEO',
                url: 'v',
                posterUrl: `${SIGNED_URL}-poster`,
                player: 'hls',
                durationSeconds: 65,
              }
            : { id: 'm', kind: 'IMAGE', url: SIGNED_URL },
        ],
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        watermark: null,
      }),
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe() {
        this.cb([{ isIntersecting: true } as IntersectionObserverEntry], this as never);
      }
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const ids = (posts: PublicPost[]) => posts.map((p) => p.id);

describe('filterPosts', () => {
  it.each([
    ['ALL', 'ALL', ids(ALL)],
    ['IMAGE', 'ALL', ['free-image', 'premium-image', 'mixed']],
    ['VIDEO', 'ALL', ['free-video', 'premium-video']],
    ['ALL', 'FREE', ['free-image', 'free-video', 'mixed']],
    ['ALL', 'PREMIUM', ['premium-image', 'premium-video']],
    ['IMAGE', 'FREE', ['free-image', 'mixed']],
    ['VIDEO', 'PREMIUM', ['premium-video']],
  ] as const)('media %s + access %s', (media, access, expected) => {
    expect(ids(filterPosts(ALL, media, access))).toEqual(expected);
  });
});

describe('PostGrid', () => {
  const renderGrid = (posts = ALL) =>
    render(
      <PostGrid posts={posts} creator={{ slug: 'ana', displayName: 'Nama', avatarUrl: null }} />,
    );

  it('filters by Media and Akses together and explains an empty result', () => {
    renderGrid([FREE_IMAGE, PREMIUM_VIDEO]);
    // Accessible tiles are buttons (viewer), locked ones links (detail).
    expect(screen.getAllByRole('button', { name: /^Post ·/ })).toHaveLength(1);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    fireEvent.change(screen.getByLabelText('Media'), { target: { value: 'VIDEO' } });
    expect(screen.getAllByRole('link')).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio', { name: 'Gratis' }));
    expect(screen.getByRole('radio', { name: 'Gratis' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('Tidak ada yang cocok')).toBeInTheDocument();
    expect(screen.getByText('Coba filter lain.')).toBeInTheDocument();
  });

  it('shows a locked tile as a preview, without calling media-access', () => {
    const { container } = renderGrid([PREMIUM_IMAGE]);
    const tile = screen.getByRole('link', { name: /terkunci/ });
    expect(tile).toHaveAttribute('href', '/ana/posts/premium-image');
    expect(container.querySelector('img')).toHaveAttribute('src', '/preview/pi');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the full-screen viewer from an accessible tile and returns focus on close', async () => {
    render(
      <PostGrid
        posts={[FREE_IMAGE]}
        creator={{ slug: 'ana', displayName: 'Nama', avatarUrl: null }}
      />,
      { wrapper: Toaster },
    );
    const tile = screen.getByRole('button', { name: /^Post ·/ });
    tile.focus();
    fireEvent.click(tile);
    expect(
      await screen.findByRole('dialog', { name: 'Media Nama, layar penuh' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tutup layar penuh' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(tile).toHaveFocus();
  });

  it('loads an accessible image tile through media-access', async () => {
    const { container } = renderGrid([FREE_IMAGE]);
    await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', SIGNED_URL));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/posts/free-image/media-access');
  });

  it('shows the poster and duration on an accessible video tile', async () => {
    const { container } = renderGrid([FREE_VIDEO]);
    await waitFor(() =>
      expect(container.querySelector('img')).toHaveAttribute('src', `${SIGNED_URL}-poster`),
    );
    expect(screen.getByText('1:05')).toBeInTheDocument();
  });

  it('shows a video badge without a time when the duration is unknown', () => {
    renderGrid([post('v', { ...VIDEO, media: [{ kind: 'VIDEO', durationSeconds: null }] })]);
    expect(screen.queryByText(/\d:\d\d/)).toBeNull();
  });

  it('never puts media URLs in the server-rendered markup', () => {
    const html = renderToString(
      <PostGrid posts={ALL} creator={{ slug: 'ana', displayName: 'Nama', avatarUrl: null }} />,
    );
    expect(html).not.toContain('storage.example');
    expect(html).not.toContain('media-access');
  });
});

describe('GridTile tag and aspect', () => {
  const creator = { slug: 'ana', displayName: 'Nama', avatarUrl: null };

  it('shows the tag and the portrait ratio, moving the video badge up', () => {
    render(
      <GridTile
        post={FREE_VIDEO}
        href="/ana/posts/free-video"
        creator={creator}
        tag="Dibeli"
        aspect="portrait"
      />,
      { wrapper: Toaster },
    );
    const tile = screen.getByRole('button', { name: /^Post ·/ });
    expect(tile).toHaveClass('aspect-[3/4]');
    expect(screen.getByText('Dibeli')).toBeInTheDocument();
    expect(screen.getByText('1:05')).toHaveClass('top-1.5');
  });

  it('keeps the square tile without a tag by default', () => {
    render(<GridTile post={FREE_VIDEO} href="/x" creator={creator} />, { wrapper: Toaster });
    expect(screen.getByRole('button', { name: /^Post ·/ })).toHaveClass('aspect-square');
    expect(screen.getByText('1:05')).toHaveClass('bottom-1.5');
  });
});
