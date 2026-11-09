import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PostCardPost } from '@/components/post-card/post-card';
import { Toaster } from '@/components/ui/toast';
import { CommentsSheet } from './comments-sheet';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const creator = {
  slug: 'ana',
  displayName: 'Ana',
  avatarUrl: null,
  plan: { priceCoins: 300, durationDays: 30 } as const,
};
const post = (viewer: PostCardPost['viewer'], extra: Partial<PostCardPost> = {}) =>
  ({ id: 'p1', viewer, access: 'full', commentCount: 3, ...extra }) as unknown as PostCardPost;
const list = {
  items: [
    {
      id: '0190a000-0000-7000-8000-000000000101',
      body: 'mantap',
      createdAt: '2026-11-03T05:00:00.000Z',
      author: { displayName: 'Budi' },
      canDelete: false,
      canEdit: false,
      canPin: false,
    },
  ],
  nextCursor: null,
  canComment: true,
};

function setup(
  open: boolean,
  viewer: PostCardPost['viewer'] = null,
  extra: Partial<PostCardPost> = {},
) {
  return render(
    <CommentsSheet
      post={post(viewer, extra)}
      creator={creator}
      open={open}
      onOpenChange={vi.fn()}
      size="compact"
      count={3}
    />,
    { wrapper: Toaster },
  );
}
afterEach(() => vi.unstubAllGlobals());

describe('CommentsSheet', () => {
  it('fetches only when opened, then shows the list and the composer inline', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(list)));
    vi.stubGlobal('fetch', fetchMock);
    const { rerender } = setup(false);
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(
      <CommentsSheet
        post={post({
          liked: false,
          saved: false,
          canLike: true,
          canReport: true,
          canTip: false,
          subscribed: false,
        })}
        creator={creator}
        open
        onOpenChange={vi.fn()}
        size="compact"
        count={3}
      />,
    );
    expect(await screen.findByText('mantap')).toBeInTheDocument();
    expect(screen.getByLabelText('Tulis komentar').closest('div.border-t')).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Komentar · 3' }).className).toContain('h-[40dvh]');
  });

  it('Escape closes the comment menu only, not the sheet', async () => {
    const onOpenChange = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(Response.json({ ...list, items: [{ ...list.items[0], canDelete: true }] })),
      ),
    );
    render(
      <CommentsSheet
        post={post({
          liked: false,
          saved: false,
          canLike: true,
          canReport: true,
          canTip: false,
          subscribed: false,
        })}
        creator={creator}
        open
        onOpenChange={onOpenChange}
        size="compact"
        count={3}
      />,
      { wrapper: Toaster },
    );
    const trigger = await screen.findByRole('button', { name: /Aksi lainnya/ });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(screen.getByRole('dialog', { name: 'Komentar · 3' })).toBeInTheDocument();
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

  it('tall size is used from a card', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(Response.json(list))),
    );
    render(
      <CommentsSheet
        post={post(null)}
        creator={creator}
        open
        onOpenChange={vi.fn()}
        size="tall"
        count={0}
      />,
      { wrapper: Toaster },
    );
    expect(screen.getByRole('dialog', { name: 'Komentar · 0' }).className).toContain('h-[85dvh]');
  });

  describe('locked premium post', () => {
    const locked = { access: 'locked', offer: { priceCoins: 8 }, caption: 'Rahasia' } as const;

    it('never fetches and shows only the ways to get access', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      setup(
        true,
        {
          liked: false,
          saved: false,
          canLike: true,
          canReport: true,
          canTip: false,
          subscribed: false,
        },
        locked,
      );
      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.getByText('Komentar khusus pendukung')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Buka post · 8 Koin' })).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /^Langganan · 300 Koin \/ 30 hari/ }),
      ).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Komentar' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Tulis komentar')).toBeNull();
    });

    it('shows no Langganan CTA when the creator\x27s plan is unknown', () => {
      vi.stubGlobal('fetch', vi.fn());
      render(
        <CommentsSheet
          post={post(
            {
              liked: false,
              saved: false,
              canLike: true,
              canReport: true,
              canTip: false,
              subscribed: false,
            },
            locked,
          )}
          creator={{ ...creator, plan: null }}
          open
          onOpenChange={vi.fn()}
          size="compact"
          count={3}
        />,
        { wrapper: Toaster },
      );
      expect(screen.getByRole('button', { name: 'Buka post · 8 Koin' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Langganan/ })).toBeNull();
    });

    it('Buka opens the unlock sheet over the comments sheet', () => {
      vi.stubGlobal('fetch', vi.fn());
      setup(
        true,
        {
          liked: false,
          saved: false,
          canLike: true,
          canReport: true,
          canTip: false,
          subscribed: false,
        },
        locked,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Buka post · 8 Koin' }));
      expect(screen.getByRole('button', { name: 'Buka dengan 8 Koin' })).toBeInTheDocument();
    });

    it('guest: both CTAs go to login returning to the post, with no fetch', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      setup(true, null, locked);
      const href = '/login?returnTo=%2Fana%2Fposts%2Fp1';
      expect(screen.getByRole('link', { name: 'Buka post · 8 Koin' })).toHaveAttribute(
        'href',
        href,
      );
      expect(screen.getByRole('link', { name: /^Langganan · 300/ })).toHaveAttribute('href', href);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
