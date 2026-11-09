import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { RecommendedCreator } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { CreatorUntukmu } from './creator-untukmu';

vi.mock('@/lib/api/creator-follow', () => ({ setFollow: vi.fn() }));

const creators = (n: number): RecommendedCreator[] =>
  Array.from({ length: n }, (_, i) => ({
    slug: `c${i}`,
    displayName: `Creator ${i}`,
    avatarUrl: null,
    bannerUrl: null,
    followerCount: 0,
  }));
const renderBlock = (n: number) =>
  render(<CreatorUntukmu creators={creators(n)} />, { wrapper: Toaster });

describe('CreatorUntukmu', () => {
  it('renders nothing without suggestions', () => {
    renderBlock(0);
    expect(screen.queryByRole('region', { name: 'Creator untukmu' })).toBeNull();
  });

  it('groups 7 creators into 3 labelled slides of up to 3 cards, with 3 dots', () => {
    const { container } = renderBlock(7);
    expect(screen.getByRole('region', { name: 'Creator untukmu' })).toBeInTheDocument();
    const slides = screen.getAllByRole('group');
    expect(slides.map((s) => s.getAttribute('aria-label'))).toEqual([
      'Halaman 1 dari 3',
      'Halaman 2 dari 3',
      'Halaman 3 dari 3',
    ]);
    expect(slides.map((s) => s.querySelectorAll('a[href^="/c"]').length)).toEqual([3, 3, 1]);
    expect(container.querySelectorAll('[aria-hidden] > span')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Jelajahi' })).toHaveAttribute('href', '/discover');
  });

  it('has no dots for a single page', () => {
    const { container } = renderBlock(2);
    expect(container.querySelector('div[aria-hidden]')).toBeNull();
  });

  it('opens a creator profile from the card', () => {
    renderBlock(1);
    expect(screen.getByRole('link', { name: /Creator 0/ })).toHaveAttribute('href', '/c0');
  });

  it('toggles Ikuti on a card through the follow API', async () => {
    vi.mocked(setFollow).mockResolvedValue({ following: true, followerCount: 1 });
    renderBlock(2);
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti Creator 1' }));
    expect(screen.getByRole('button', { name: 'Diikuti Creator 1' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Ikuti Creator 0' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(setFollow).toHaveBeenCalledWith('c1', true);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Diikuti Creator 1' })).toBeEnabled(),
    );
  });

  it('swallows the click after a mouse drag, but not a plain click', () => {
    renderBlock(2);
    const link = screen.getByRole('link', { name: /Creator 0/ });
    const track = screen.getByRole('group').parentElement!;
    fireEvent.pointerDown(track, { pointerType: 'mouse', clientX: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', clientX: 60 });
    expect(fireEvent.click(link)).toBe(false); // preventDefault called → click was cancelled
    fireEvent.pointerUp(track, { pointerType: 'mouse' });
  });

  it('lets a click through when the mouse barely moved', () => {
    renderBlock(2);
    const link = screen.getByRole('link', { name: /Creator 0/ });
    const track = screen.getByRole('group').parentElement!;
    fireEvent.pointerDown(track, { pointerType: 'mouse', clientX: 100 });
    fireEvent.pointerMove(track, { pointerType: 'mouse', clientX: 102 });
    expect(fireEvent.click(link)).toBe(true);
  });
});
