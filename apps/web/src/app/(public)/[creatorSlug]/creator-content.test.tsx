import { fireEvent, render, screen } from '@testing-library/react';
import type { PublicPost } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { CreatorContent } from './creator-content';

const replace = vi.fn();
let query = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace }),
  usePathname: () => '/ana',
  useSearchParams: () => new URLSearchParams(query),
}));

const CREATOR = { slug: 'ana', displayName: 'Ana Putri', avatarUrl: null };
// Locked posts never call media-access, so no fetch stubs are needed.
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
const POSTS = [locked('Terbaru'), locked('Lama')];
const renderContent = () =>
  render(<CreatorContent posts={POSTS} creator={CREATOR} />, { wrapper: Toaster });

beforeEach(() => {
  replace.mockClear();
  query = '';
});

describe('CreatorContent', () => {
  it('shows Postingan by default: a card per post, in order, no grid controls', () => {
    renderContent();
    expect(screen.getByRole('tab', { name: 'Postingan' })).toHaveAttribute('aria-selected', 'true');
    const cards = screen.getAllByRole('article');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveTextContent('Terbaru');
    expect(screen.queryByRole('radiogroup', { name: 'Akses' })).toBeNull();
  });

  it('shows the Grid for ?tab=grid, without PostCards', () => {
    query = 'tab=grid';
    renderContent();
    expect(screen.getByRole('tab', { name: 'Grid' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('radiogroup', { name: 'Akses' })).toBeInTheDocument();
    expect(screen.queryByRole('article')).toBeNull();
  });

  it('falls back to Postingan for an unknown tab', () => {
    query = 'tab=x';
    renderContent();
    expect(screen.getByRole('tab', { name: 'Postingan' })).toHaveAttribute('aria-selected', 'true');
  });

  it('writes the tab to the URL without scrolling', () => {
    renderContent();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Grid' }));
    expect(replace).toHaveBeenCalledWith('/ana?tab=grid', { scroll: false });
    query = 'tab=grid';
    replace.mockClear();
    renderContent();
    fireEvent.mouseDown(screen.getAllByRole('tab', { name: 'Postingan' })[1]!);
    expect(replace).toHaveBeenCalledWith('/ana', { scroll: false });
  });
});
