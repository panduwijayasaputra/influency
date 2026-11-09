import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoverVideo, DiscoverVideosPage } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { fetchDiscoverVideosPage } from '@/lib/api/discover';
import { useMediaAccess } from '@/lib/use-media-access';
import { pauseAllVideos } from '@/lib/video-playback';
import { DiscoverView } from './discover-view';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/api/discover', () => ({ fetchDiscoverVideosPage: vi.fn() }));
vi.mock('@/lib/use-media-access', () => ({ useMediaAccess: vi.fn() }));
vi.mock('@/lib/use-near-viewport', () => ({ useNearViewport: () => true }));
vi.mock('@/lib/video-playback', () => ({ pauseAllVideos: vi.fn() }));
vi.mock('@/components/post-video', () => ({
  PostVideo: ({ item }: { item: { id: string } }) => <video data-testid={`video-${item.id}`} />,
}));

beforeEach(() => {
  replace.mockReset();
  vi.mocked(pauseAllVideos).mockReset();
  vi.mocked(fetchDiscoverVideosPage).mockReset();
  vi.mocked(useMediaAccess)
    .mockReset()
    .mockReturnValue({ state: { kind: 'loading' }, retry: vi.fn() });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

const reel = (id: string, slug: string, following = false): DiscoverVideo => ({
  id,
  visibility: 'FREE',
  caption: `Caption ${slug}`,
  publishedAt: '2026-11-09T00:00:00.000Z',
  imageCount: 0,
  videoCount: 1,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [{ kind: 'VIDEO', durationSeconds: 10 }],
  creator: { slug, displayName: `Creator ${slug}`, avatarUrl: null },
  follow: { following, followerCount: 12400 },
});
const page = (items: DiscoverVideo[], nextCursor: string | null = null): DiscoverVideosPage => ({
  items,
  nextCursor,
});

const renderView = (initialTab: 'video' | 'cari' = 'video', viewerSlug: string | null = null) =>
  render(<DiscoverView initialTab={initialTab} viewerSlug={viewerSlug} />, { wrapper: Toaster });

describe('DiscoverView', () => {
  it('selects Video by default and Cari from the URL', () => {
    vi.mocked(fetchDiscoverVideosPage).mockResolvedValue(page([]));
    const { unmount } = renderView();
    expect(screen.getByRole('tab', { name: 'Video' })).toHaveAttribute('aria-selected', 'true');
    unmount();
    renderView('cari');
    expect(screen.getByRole('tab', { name: 'Cari' })).toHaveAttribute('aria-selected', 'true');
  });

  it('switches tabs in the URL and pauses videos when leaving Video', () => {
    vi.mocked(fetchDiscoverVideosPage).mockResolvedValue(page([]));
    renderView();
    fireEvent.click(screen.getByRole('tab', { name: 'Cari' }));
    expect(replace).toHaveBeenCalledWith('/discover?tab=cari', { scroll: false });
    expect(pauseAllVideos).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('tab', { name: 'Video' }));
    expect(replace).toHaveBeenLastCalledWith('/discover', { scroll: false });
  });

  it('renders each reel with creator, followers, caption and profile link', async () => {
    vi.mocked(fetchDiscoverVideosPage).mockResolvedValue(page([reel('p1', 'raka', true)]));
    renderView();
    const link = await screen.findByRole('link', { name: 'Buka profil Creator raka' });
    expect(link).toHaveAttribute('href', '/raka');
    expect(screen.getByText('Caption raka')).toBeInTheDocument();
    expect(screen.getByLabelText('12.400 pengikut')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Diikuti/ })).toBeInTheDocument();
  });

  it('plays the video from media access', async () => {
    vi.mocked(useMediaAccess).mockReturnValue({
      state: {
        kind: 'ready',
        access: {
          media: [
            {
              id: 'm1',
              kind: 'VIDEO',
              url: 'https://v/m1.m3u8',
              posterUrl: null,
              player: 'hls',
              durationSeconds: 10,
            },
          ],
          expiresAt: '2026-11-09T01:00:00.000Z',
          watermark: null,
        },
      },
      retry: vi.fn(),
    } as unknown as ReturnType<typeof useMediaAccess>);
    vi.mocked(fetchDiscoverVideosPage).mockResolvedValue(page([reel('p1', 'raka')]));
    renderView();
    expect(await screen.findByTestId('video-m1')).toBeInTheDocument();
    expect(useMediaAccess).toHaveBeenCalledWith('p1', true);
  });

  it('hides Ikuti on the viewer’s own videos', async () => {
    vi.mocked(fetchDiscoverVideosPage).mockResolvedValue(
      page([reel('p1', 'raka'), reel('p2', 'nadia')]),
    );
    renderView('video', 'nadia');
    await screen.findByRole('link', { name: 'Buka profil Creator nadia' });
    expect(screen.getAllByRole('button', { name: /Ikuti/ })).toHaveLength(1);
  });

  it('shows the empty state', async () => {
    vi.mocked(fetchDiscoverVideosPage).mockResolvedValue(page([]));
    renderView();
    expect(await screen.findByText('Belum ada video.')).toBeInTheDocument();
  });

  it('retries after an error', async () => {
    vi.mocked(fetchDiscoverVideosPage)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue(page([reel('p1', 'raka')]));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Buka profil Creator raka' })).toBeInTheDocument(),
    );
  });
});
