import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostCardPost } from '@/components/post-card/post-card';
import { ViewerComments } from './viewer-comments';

const creator = { slug: 'ana', displayName: 'Ana', avatarUrl: null };
const post = (viewer: PostCardPost['viewer']) => ({ id: 'p1', viewer }) as unknown as PostCardPost;
const list = {
  items: [
    {
      id: '0190a000-0000-7000-8000-000000000101',
      body: 'mantap',
      createdAt: '2026-11-03T05:00:00.000Z',
      author: { displayName: 'Budi' },
      canDelete: false,
    },
  ],
  nextCursor: null,
  canComment: true,
};

function setup(open: boolean, viewer: PostCardPost['viewer'] = null) {
  return render(
    <ViewerComments post={post(viewer)} creator={creator} open={open} onOpenChange={vi.fn()} />,
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('ViewerComments', () => {
  it('fetches only when opened, then shows the list and the composer inline', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(list)));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = setup(false);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(
      <ViewerComments
        post={post({ liked: false, canLike: true, canReport: true })}
        creator={creator}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(await screen.findByText('mantap')).toBeInTheDocument();
    expect(screen.getByLabelText('Tulis komentar').closest('div.border-t')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Komentar' }).className).toContain('h-[40dvh]');
  });

  it('explains a locked post (403)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))),
    );
    setup(true);
    expect(
      await screen.findByText('Buka post ini untuk melihat dan menulis komentar.'),
    ).toBeInTheDocument();
  });

  it('shows an error with Coba lagi that refetches', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 500 }))
      .mockResolvedValueOnce(Response.json(list));
    vi.stubGlobal('fetch', fetchMock);
    setup(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('mantap')).toBeInTheDocument();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('guest: login link returning to the post', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json({ ...list, canComment: false }))),
    );
    setup(true);
    expect(await screen.findByRole('link', { name: 'Masuk untuk berkomentar' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fana%2Fposts%2Fp1',
    );
  });
});
