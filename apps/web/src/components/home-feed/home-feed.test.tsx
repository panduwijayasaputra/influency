import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HomeFeedItem, HomeFeedPage } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { fetchHomeFeedPage } from '@/lib/api/home-feed';
import { fetchRecommendedCreators } from '@/lib/api/recommended-creators';
import { HomeFeed } from './home-feed';

vi.mock('@/lib/api/home-feed', () => ({ fetchHomeFeedPage: vi.fn() }));
vi.mock('@/lib/api/recommended-creators', () => ({ fetchRecommendedCreators: vi.fn() }));
vi.mock('./creator-untukmu', () => ({
  CreatorUntukmu: ({ creators }: { creators: unknown[] }) =>
    creators.length > 0 ? <section aria-label="Creator untukmu">saran</section> : null,
}));
// PostCard pulls in media and comments; the feed is what is under test here.
vi.mock('@/components/post-card/post-card', () => ({
  PostCard: ({ post, linkCreator }: { post: HomeFeedItem; linkCreator?: boolean }) => (
    <article data-link={String(linkCreator)}>{post.id}</article>
  ),
}));

// Like the real observer, observe() reports the current visibility; intersect() changes it and notifies.
let visible = false;
let notify: (isIntersecting: boolean) => void = () => {};
const intersect = (isIntersecting: boolean) => {
  visible = isIntersecting;
  notify(isIntersecting);
};
beforeEach(() => {
  visible = false;
  vi.mocked(fetchHomeFeedPage).mockReset();
  vi.mocked(fetchRecommendedCreators).mockReset().mockResolvedValue([SUGGESTION]);
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private cb: (e: { isIntersecting: boolean }[]) => void;
      constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
        this.cb = cb;
        notify = (isIntersecting) => cb([{ isIntersecting }]);
      }
      observe() {
        if (visible) this.cb([{ isIntersecting: true }]);
      }
      disconnect() {}
    },
  );
});

const SUGGESTION = {
  slug: 'raka',
  displayName: 'Raka',
  avatarUrl: null,
  bannerUrl: null,
  followerCount: 0,
};
const item = (id: string) =>
  ({ id, creator: { slug: 'nadia', displayName: 'Nadia', avatarUrl: null } }) as HomeFeedItem;
const page = (ids: string[], nextCursor: string | null): HomeFeedPage => ({
  items: ids.map(item),
  nextCursor,
});
const renderFeed = () => render(<HomeFeed />, { wrapper: Toaster });

describe('HomeFeed', () => {
  it('shows a skeleton, then the posts with a creator link', async () => {
    vi.mocked(fetchHomeFeedPage).mockResolvedValue(page(['a', 'b'], null));
    renderFeed();
    expect(screen.getByLabelText('Memuat postingan')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByText('a')).toHaveAttribute('data-link', 'true');
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('Kamu sudah melihat semua postingan.')).toBeInTheDocument();
  });

  it('loads the next page near the end, without duplicates', async () => {
    vi.mocked(fetchHomeFeedPage)
      .mockResolvedValueOnce(page(['a', 'b'], '2'))
      .mockResolvedValueOnce(page(['b', 'c'], null));
    renderFeed();
    await screen.findByText('a');
    expect(fetchHomeFeedPage).toHaveBeenCalledTimes(1);
    act(() => intersect(true));
    await screen.findByText('c');
    expect(fetchHomeFeedPage).toHaveBeenLastCalledWith('2');
    expect(screen.getAllByText('b')).toHaveLength(1);
  });

  it('keeps loaded posts when page 2 fails and retries the same cursor', async () => {
    vi.mocked(fetchHomeFeedPage)
      .mockResolvedValueOnce(page(['a'], '1'))
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(page(['b'], null));
    renderFeed();
    await screen.findByText('a');
    act(() => intersect(true));
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await screen.findByText('b');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(fetchHomeFeedPage).toHaveBeenLastCalledWith('1');
  });

  it('shows an error when the first page fails and retries it', async () => {
    vi.mocked(fetchHomeFeedPage)
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(page(['a'], null));
    renderFeed();
    expect(await screen.findByText('Postingan belum bisa dimuat.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(screen.getByText('a')).toBeInTheDocument());
  });

  it('shows the empty state with a Jelajahi link', async () => {
    vi.mocked(fetchHomeFeedPage).mockResolvedValue(page([], null));
    renderFeed();
    expect(await screen.findByText('Belum ada postingan')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jelajahi' })).toHaveAttribute('href', '/discover');
  });

  describe('Creator untukmu placement', () => {
    const block = () => screen.findByRole('region', { name: 'Creator untukmu' });
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

    it('sits after the 5th post', async () => {
      vi.mocked(fetchHomeFeedPage).mockResolvedValue(page(ids(6), '6'));
      renderFeed();
      const section = await block();
      const posts = screen.getAllByRole('article');
      expect(posts).toHaveLength(6);
      expect(posts[4]!.nextElementSibling).toBe(section);
      expect(screen.getAllByRole('region', { name: 'Creator untukmu' })).toHaveLength(1);
    });

    it('goes after the last post of a short feed that has ended', async () => {
      vi.mocked(fetchHomeFeedPage).mockResolvedValue(page(ids(3), null));
      renderFeed();
      const section = await block();
      expect(screen.getAllByRole('article')[2]!.nextElementSibling).toBe(section);
    });

    it('waits while a short feed still has pages to load', async () => {
      vi.mocked(fetchHomeFeedPage).mockResolvedValue(page(ids(3), '3'));
      renderFeed();
      await screen.findByText('p3');
      await waitFor(() => expect(fetchRecommendedCreators).toHaveBeenCalled());
      expect(screen.queryByRole('region', { name: 'Creator untukmu' })).toBeNull();
    });

    it('is fetched once, so a followed card is not reshuffled by a refetch', async () => {
      vi.mocked(fetchHomeFeedPage)
        .mockResolvedValueOnce(page(ids(6), '6'))
        .mockResolvedValueOnce(page(['p7'], null));
      renderFeed();
      await block();
      intersect(true);
      await screen.findByText('p7');
      expect(fetchRecommendedCreators).toHaveBeenCalledTimes(1);
    });

    it('shows in the empty state', async () => {
      vi.mocked(fetchHomeFeedPage).mockResolvedValue(page([], null));
      renderFeed();
      expect(await block()).toBeInTheDocument();
    });

    it('is hidden when there are no suggestions or the request fails', async () => {
      vi.mocked(fetchRecommendedCreators).mockRejectedValue(new Error('503'));
      vi.mocked(fetchHomeFeedPage).mockResolvedValue(page(ids(6), null));
      renderFeed();
      await screen.findByText('p6');
      await waitFor(() => expect(fetchRecommendedCreators).toHaveBeenCalled());
      expect(screen.queryByRole('region', { name: 'Creator untukmu' })).toBeNull();
    });
  });
});
