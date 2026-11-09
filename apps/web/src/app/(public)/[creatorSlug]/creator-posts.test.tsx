import { fireEvent, render, screen } from '@testing-library/react';
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

async function renderFeed(posts: PublicPost[] | null | Error, isOwner = false) {
  if (posts instanceof Error) vi.mocked(getPublicPosts).mockRejectedValue(posts);
  else vi.mocked(getPublicPosts).mockResolvedValue(posts && { posts });
  return render(await CreatorPosts({ creator: CREATOR, isOwner }), { wrapper: Toaster });
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

  describe('owner entry points (creator-studio US-054)', () => {
    it('offers Post Baru and an Edit item on each card', async () => {
      const post = locked('Milikku');
      await renderFeed([post], true);
      expect(screen.getByRole('link', { name: 'Post Baru' })).toHaveAttribute(
        'href',
        '/studio/posts/new',
      );
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
      expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
        'href',
        `/studio/posts/${post.id}`,
      );
    });

    it('still offers Post Baru when there are no posts yet', async () => {
      await renderFeed([], true);
      expect(screen.getByRole('link', { name: 'Post Baru' })).toBeInTheDocument();
      expect(screen.getByText('Belum ada konten yang dipublikasikan.')).toBeInTheDocument();
    });

    it('shows neither to anyone else', async () => {
      await renderFeed([locked('Bukan milikku')]);
      expect(screen.queryByRole('link', { name: 'Post Baru' })).toBeNull();
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
      await screen.findByRole('menuitem', { name: 'Bagikan' });
      expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    });
  });

  it('survives an API outage', async () => {
    await renderFeed(new Error('down'));
    expect(screen.getByText('Konten belum bisa dimuat.')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});
