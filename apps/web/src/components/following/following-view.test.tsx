import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { FollowingPage } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFollowingPage } from '@/lib/api/following';
import { FollowingView } from './following-view';

vi.mock('@/lib/api/following', () => ({ fetchFollowingPage: vi.fn() }));

const creator = (slug: string, bio: string | null = null) => ({
  slug,
  displayName: slug.toUpperCase(),
  avatarUrl: null,
  bannerUrl: null,
  bio,
});
const page = (slugs: string[], total = slugs.length): FollowingPage => ({
  creators: slugs.map((s) => creator(s, `bio ${s}`)),
  total,
  nextCursor: null,
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe('FollowingView', () => {
  it('lists creators as links to their profile with the count and the separate-from-subscription note', async () => {
    vi.mocked(fetchFollowingPage).mockResolvedValue(page(['ana', 'bima'], 1234));
    render(<FollowingView />);
    const link = await screen.findByRole('link', { name: 'Buka ANA' });
    expect(link).toHaveAttribute('href', '/ana');
    expect(link).toHaveTextContent('@ana');
    expect(link).toHaveTextContent('bio ana');
    expect(screen.getByText('1.234 creator')).toBeInTheDocument();
    expect(screen.getByText(/terpisah dari berlangganan/)).toBeInTheDocument();
    // No unfollow control on the cards.
    expect(screen.queryByRole('button', { name: /diikuti|berhenti/i })).toBeNull();
  });

  it('refetches with the chosen sort', async () => {
    vi.mocked(fetchFollowingPage).mockResolvedValue(page(['ana']));
    render(<FollowingView />);
    await screen.findByRole('link', { name: 'Buka ANA' });
    fireEvent.change(screen.getByLabelText('Urutkan'), { target: { value: 'name' } });
    await waitFor(() =>
      expect(fetchFollowingPage).toHaveBeenLastCalledWith({ sort: 'name', cursor: undefined }),
    );
  });

  it('switches between two columns and one column', async () => {
    vi.mocked(fetchFollowingPage).mockResolvedValue(page(['ana']));
    render(<FollowingView />);
    const list = (await screen.findByRole('link', { name: 'Buka ANA' })).closest('ul')!;
    expect(list).toHaveClass('grid-cols-2');
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan vertikal' }));
    expect(list).toHaveClass('grid-cols-1');
  });

  it('shows the empty state with a Jelajahi link', async () => {
    vi.mocked(fetchFollowingPage).mockResolvedValue(page([]));
    render(<FollowingView />);
    expect(await screen.findByText('Kamu belum mengikuti siapa pun')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jelajahi' })).toHaveAttribute('href', '/discover');
  });

  it('shows a skeleton, then an error that retries', async () => {
    vi.mocked(fetchFollowingPage)
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(page(['ana']));
    render(<FollowingView />);
    expect(screen.getByLabelText('Memuat creator')).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('link', { name: 'Buka ANA' })).toBeInTheDocument();
  });
});
