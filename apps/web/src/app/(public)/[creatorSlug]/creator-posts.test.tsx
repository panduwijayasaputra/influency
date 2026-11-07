import { render, screen } from '@testing-library/react';
import type { PublicPost } from '@influency/shared';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getPublicPosts } from '@/lib/api/public-posts';
import { CreatorPosts } from './creator-posts';

vi.mock('@/lib/api/public-posts', () => ({ getPublicPosts: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/claudiandreya',
  useSearchParams: () => new URLSearchParams(),
}));

const CREATOR = { slug: 'claudiandreya', displayName: 'Claudia Andreya', avatarUrl: null };
// Locked premium cards never fetch media, so no fetch/IntersectionObserver stubs are needed.
const locked = (caption: string): PublicPost => ({
  id: crypto.randomUUID(),
  visibility: 'PREMIUM',
  caption,
  publishedAt: '2026-11-03T05:00:00.000Z',
  imageCount: 1,
  videoCount: 0,
  offer: { priceCoins: 5 },
  previewUrl: null,
  likeCount: 0,
  access: 'locked',
  viewer: null,
  commentCount: 0,
  media: [{ kind: 'IMAGE', durationSeconds: null }],
});

async function renderFeed(posts: PublicPost[] | null | Error) {
  if (posts instanceof Error) vi.mocked(getPublicPosts).mockRejectedValue(posts);
  else vi.mocked(getPublicPosts).mockResolvedValue(posts && { posts });
  return render(await CreatorPosts({ creator: CREATOR }), { wrapper: Toaster });
}

describe('CreatorPosts', () => {
  it('renders one PostCard per post, in feed order', async () => {
    await renderFeed([locked('Terbaru'), locked('Lama')]);
    const cards = screen.getAllByRole('article', { name: 'Post oleh Claudia Andreya' });
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Terbaru');
    expect(cards[1]).toHaveTextContent('Lama');
    expect(getPublicPosts).toHaveBeenCalledWith('claudiandreya');
  });

  it.each([[[]], [null]])('shows the empty message for %j', async (posts) => {
    await renderFeed(posts);
    expect(screen.getByText('Belum ada konten yang dipublikasikan.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('survives an API outage', async () => {
    await renderFeed(new Error('down'));
    expect(screen.getByText('Konten belum bisa dimuat.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
