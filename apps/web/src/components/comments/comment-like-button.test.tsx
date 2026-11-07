import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { CommentLikeButton } from './comment-like-button';

afterEach(() => vi.unstubAllGlobals());

function setup(props: Partial<Parameters<typeof CommentLikeButton>[0]> = {}) {
  return render(
    <CommentLikeButton postId="p1" commentId="c1" path="/ana/posts/p1" loggedIn {...props} />,
    { wrapper: Toaster },
  );
}

describe('CommentLikeButton', () => {
  it('guest: a login link returning to the post, no request', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setup({ loggedIn: false, likeCount: 2 });
    expect(screen.getByRole('link', { name: 'Masuk untuk menyukai · 2 suka' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fana%2Fposts%2Fp1',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('not live (no likeCount): says Segera hadir and sends nothing', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Suka komentar' }));
    expect(await screen.findByText('Segera hadir')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('live: flips at once, then settles on the server result', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => (resolve = r)));
    vi.stubGlobal('fetch', fetchMock);
    setup({ likeCount: 3, liked: false });
    fireEvent.click(screen.getByRole('button', { name: 'Suka komentar · 3' }));
    const pressed = screen.getByRole('button', { name: 'Batal suka komentar · 4' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(pressed).toBeDisabled();
    fireEvent.click(pressed);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => resolve(Response.json({ liked: true, likeCount: 7 })));
    expect(await screen.findByRole('button', { name: 'Batal suka komentar · 7' })).toBeEnabled();
  });

  it('live, liked: unlikes with DELETE and decrements', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ liked: false, likeCount: 1 })));
    vi.stubGlobal('fetch', fetchMock);
    setup({ likeCount: 2, liked: true });
    fireEvent.click(screen.getByRole('button', { name: 'Batal suka komentar · 2' }));
    expect(await screen.findByRole('button', { name: 'Suka komentar · 1' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/posts/p1/comments/c1/likes', {
      method: 'DELETE',
    });
  });

  it('rolls back and toasts when the request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 500 }))),
    );
    setup({ likeCount: 3, liked: false });
    fireEvent.click(screen.getByRole('button', { name: 'Suka komentar · 3' }));
    expect(await screen.findByText('Gagal menyukai komentar. Coba lagi.')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Suka komentar · 3' })).toBeEnabled(),
    );
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  });
});
