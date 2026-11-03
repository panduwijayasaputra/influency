import { render, screen, within } from '@testing-library/react';
import type { PublicPost } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getPublicPosts } from '@/lib/api/public-posts';
import { CreatorPosts } from './creator-posts';

vi.mock('@/lib/api/public-posts', () => ({ getPublicPosts: vi.fn() }));

const post = (overrides: Partial<PublicPost>): PublicPost => ({
  id: crypto.randomUUID(),
  visibility: 'FREE',
  caption: 'Halo',
  publishedAt: '2026-11-03T05:00:00.000Z',
  imageCount: 0,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  ...overrides,
});

async function renderFeed(posts: PublicPost[] | null | Error) {
  if (posts instanceof Error) vi.mocked(getPublicPosts).mockRejectedValue(posts);
  else vi.mocked(getPublicPosts).mockResolvedValue(posts && { posts });
  return render(await CreatorPosts({ slug: 'claudiandreya' }));
}

describe('CreatorPosts', () => {
  afterEach(() => vi.clearAllMocks());

  it('splits posts into Gratis and Premium sections', async () => {
    const { container } = await renderFeed([
      post({
        caption: 'Premium satu',
        visibility: 'PREMIUM',
        videoCount: 1,
        offer: { priceCoins: 8 },
      }),
      post({ caption: 'Gratis satu', imageCount: 2 }),
    ]);
    const free = screen.getByRole('region', { name: 'Gratis' });
    const premium = screen.getByRole('region', { name: 'Premium' });
    expect(free).toHaveTextContent('Gratis satu');
    expect(free).toHaveTextContent('2 foto · 3 Nov 2026');
    expect(free).not.toHaveTextContent('Koin');
    expect(premium).toHaveTextContent('Premium satu');
    expect(premium).toHaveTextContent('1 video');
    expect(within(premium).getByText(/8 Koin/)).toHaveTextContent('8 Koin · akses permanen');
    expect(premium).not.toHaveTextContent('hari');
    expect(container.querySelector('img, video')).toBeNull();
    expect(within(premium).getByTestId('locked-placeholder')).toBeInTheDocument();
    expect(within(free).queryByTestId('locked-placeholder')).toBeNull();
    expect(getPublicPosts).toHaveBeenCalledWith('claudiandreya');
  });

  it('shows the generated preview on a premium card', async () => {
    const previewUrl = '/api/v1/creators/claudiandreya/posts/p/preview/x';
    const { container } = await renderFeed([
      post({ visibility: 'PREMIUM', offer: { priceCoins: 5 }, previewUrl }),
    ]);
    const premium = screen.getByRole('region', { name: 'Premium' });
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(premium.querySelector('img')).toHaveAttribute('src', previewUrl);
    expect(within(premium).queryByTestId('locked-placeholder')).toBeNull();
  });

  it('links every card to its post detail page', async () => {
    const posts = [post({}), post({ visibility: 'PREMIUM', offer: { priceCoins: 5 } })];
    await renderFeed(posts);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(
      posts.map((p) => `/claudiandreya/posts/${p.id}`),
    );
  });

  it('shows the like count only when a post has likes', async () => {
    await renderFeed([post({ caption: 'Populer', likeCount: 3 }), post({ caption: 'Belum' })]);
    expect(screen.getByText(/· 3 suka$/)).toBeInTheDocument();
    expect(screen.getAllByText(/suka/)).toHaveLength(1);
  });

  it('shows "Tanpa caption" and omits an empty section', async () => {
    await renderFeed([post({ caption: '', imageCount: 1 })]);
    expect(screen.getByText('Tanpa caption')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Premium' })).toBeNull();
  });

  it.each([[[]], [null]])('shows the empty state for %j', async (posts) => {
    await renderFeed(posts);
    expect(screen.getByText('Belum ada konten yang dipublikasikan.')).toBeInTheDocument();
  });

  it('survives an API outage', async () => {
    await renderFeed(new Error('down'));
    expect(screen.getByText('Konten belum bisa dimuat.')).toBeInTheDocument();
  });
});
