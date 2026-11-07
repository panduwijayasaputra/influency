import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostCardPost } from '@/components/post-card/post-card';
import { Toaster } from '@/components/ui/toast';
import { ViewerActions } from './viewer-actions';

const creator = { slug: 'ana', displayName: 'Ana', avatarUrl: null };
const post = (viewer: PostCardPost['viewer']) =>
  ({ id: 'p1', commentCount: 4, likeCount: 2, viewer }) as unknown as PostCardPost;
const SIGNED_IN = { liked: false, canLike: true, canReport: true };

function setup(viewer: PostCardPost['viewer']) {
  const props = { onLikeChange: vi.fn(), onOpenComments: vi.fn() };
  render(
    <ViewerActions
      post={post(viewer)}
      creator={creator}
      like={{ liked: false, count: 2 }}
      {...props}
    />,
    { wrapper: Toaster },
  );
  return props;
}

afterEach(() => vi.unstubAllGlobals());

describe('ViewerActions', () => {
  it('signed in: Suka reports the result, Komentar opens, Bagikan copies, Kirim Tip is coming soon', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ liked: true, likeCount: 3 }))),
    );
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const { onLikeChange, onOpenComments } = setup(SIGNED_IN);
    fireEvent.click(screen.getByRole('button', { name: 'Suka · 2 suka' }));
    await waitFor(() => expect(onLikeChange).toHaveBeenCalledWith({ liked: true, count: 3 }));
    fireEvent.click(screen.getByRole('button', { name: 'Komentar, 4' }));
    expect(onOpenComments).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Bagikan post' }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('http://localhost:3000/ana/posts/p1'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Tip' }));
    expect(await screen.findByText('Segera hadir')).toBeInTheDocument();
  });

  it('guest: Suka and Bagikan go to login for this post; Komentar and Kirim Tip still work', () => {
    const { onOpenComments } = setup(null);
    const login = '/login?returnTo=%2Fana%2Fposts%2Fp1';
    expect(screen.getByRole('link', { name: /Masuk untuk menyukai/ })).toHaveAttribute(
      'href',
      login,
    );
    expect(screen.getByRole('link', { name: 'Bagikan' })).toHaveAttribute('href', login);
    fireEvent.click(screen.getByRole('button', { name: 'Komentar, 4' }));
    expect(onOpenComments).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Kirim Tip' })).toBeInTheDocument();
  });

  it('keeps every control at least 44px', () => {
    setup(SIGNED_IN);
    for (const el of screen.getAllByRole('button')) {
      expect(el.className).toMatch(/\b(h-11|size-11|min-h-11)\b|\bh-9\b/);
    }
  });
});
