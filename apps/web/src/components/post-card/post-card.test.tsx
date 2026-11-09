import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import type { PublicPost } from '@influency/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { fetchPublicPost, purchasePost } from '@/lib/api/purchases';
import { PostCard } from './post-card';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/lib/api/purchases', () => ({ purchasePost: vi.fn(), fetchPublicPost: vi.fn() }));

const CREATOR = { slug: 'ana', displayName: 'Ana Putri', avatarUrl: null };
const SIGNED_IN = {
  liked: false,
  saved: false,
  canLike: true,
  canReport: true,
  canTip: false,
  subscribed: false,
};
const LOGIN = '/login?returnTo=%2Fana';
const SIGNED_URL = 'https://storage.example/signed/one?sig=x';
const PUBLISHED_AT = new Date(Date.now() - 2 * 3600_000).toISOString();

const post = (overrides: Partial<PublicPost> = {}): PublicPost => ({
  id: '0190a000-0000-7000-8000-000000000001',
  visibility: 'FREE',
  caption: 'Halo dari Bali',
  publishedAt: PUBLISHED_AT,
  imageCount: 1,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 3,
  access: 'full',
  viewer: SIGNED_IN,
  commentCount: 4,
  media: [{ kind: 'IMAGE', durationSeconds: null }],
  ...overrides,
});
const lockedPost = (viewer: PublicPost['viewer']) =>
  post({
    visibility: 'PREMIUM',
    access: 'locked',
    caption: 'Rahasia',
    imageCount: 2,
    videoCount: 1,
    offer: { priceCoins: 8 },
    previewUrl: '/api/v1/creators/ana/posts/p/preview/x',
    viewer,
  });

const media = (n: number) => ({
  media: Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    kind: 'IMAGE',
    url: `${SIGNED_URL}${i}`,
  })),
  expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  watermark: 'abc',
});

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve(Response.json(media(3))));
  vi.stubGlobal('fetch', fetchMock);
  // Calls back at once: every card is "near the viewport".
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(private cb: IntersectionObserverCallback) {}
      observe() {
        this.cb(
          [{ isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry],
          this as never,
        );
      }
      disconnect() {}
    },
  );
});
afterEach(() => vi.unstubAllGlobals());

const renderCard = (p: PublicPost) =>
  render(<PostCard post={p} creator={CREATOR} />, { wrapper: Toaster });

describe('PostCard', () => {
  it('shows the creator, handle and publish time, and a Lainnya menu', async () => {
    renderCard(post());
    const card = screen.getByRole('article', { name: 'Post oleh Ana Putri' });
    expect(card).toHaveTextContent('@ana');
    expect(card.querySelector('time')).toHaveAttribute('datetime', PUBLISHED_AT);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
    expect(await screen.findByRole('menuitem', { name: 'Bagikan' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Laporkan' })).toBeInTheDocument();
  });

  it('adds an Edit item to the menu only when given an editHref (the owner profile)', async () => {
    const { unmount } = renderCard(post());
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
    await screen.findByRole('menuitem', { name: 'Bagikan' });
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    unmount();
    render(<PostCard post={post()} creator={CREATOR} editHref="/studio/posts/p1" />, {
      wrapper: Toaster,
    });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
    expect(await screen.findByRole('menuitem', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/studio/posts/p1',
    );
  });

  it('links the creator to their profile only when asked (Home feed)', () => {
    const { unmount } = renderCard(post());
    expect(screen.queryByRole('link', { name: /Ana Putri/ })).toBeNull();
    unmount();
    render(<PostCard post={post()} creator={CREATOR} linkCreator />, { wrapper: Toaster });
    expect(screen.getByRole('link', { name: /Ana Putri/ })).toHaveAttribute('href', '/ana');
  });

  it.each([
    ['a guest', null],
    ['a signed-in user', SIGNED_IN],
  ])('shows %s a locked premium post as a preview only, without fetching media', (_l, viewer) => {
    const { container } = renderCard(lockedPost(viewer));
    expect(screen.getByText('Premium')).toBeInTheDocument();
    expect(screen.getByText('2 foto · 1 video')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      '/api/v1/creators/ana/posts/p/preview/x',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a guest to login from Buka, and opens the purchase sheet for a signed-in user', () => {
    const { unmount } = renderCard(lockedPost(null));
    expect(screen.getByRole('link', { name: /Buka post · 8 Koin/ })).toHaveAttribute('href', LOGIN);
    unmount();
    renderCard(lockedPost(SIGNED_IN));
    fireEvent.click(screen.getByRole('button', { name: /Buka post · 8 Koin/ }));
    expect(screen.getByRole('dialog', { name: 'Rahasia' })).toBeInTheDocument();
  });

  it('unlocking re-renders the card with its media, using the server\x27s answer', async () => {
    vi.mocked(purchasePost).mockResolvedValue({
      purchaseId: '0190a000-0000-7000-8000-0000000000aa',
      postId: lockedPost(SIGNED_IN).id,
      priceCoins: 8,
      balanceCoins: 12,
      alreadyOwned: false,
    });
    vi.mocked(fetchPublicPost).mockResolvedValue({
      ...lockedPost(SIGNED_IN),
      access: 'full',
      status: 'PUBLISHED',
    } as never);
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => {
        const body = url.endsWith('/wallet') ? { balanceCoins: 20 } : media(2);
        return Promise.resolve(Response.json(body));
      }),
    );
    renderCard(lockedPost(SIGNED_IN));
    fireEvent.click(screen.getByRole('button', { name: /Buka post · 8 Koin/ }));
    const confirm = screen.getByRole('button', { name: 'Buka dengan 8 Koin' });
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(purchasePost).toHaveBeenCalledWith(lockedPost(SIGNED_IN).id, 8, expect.any(String)),
    );
    await waitFor(() => expect(screen.getByText('Terbuka')).toBeInTheDocument());
    expect(fetchPublicPost).toHaveBeenCalledWith('ana', lockedPost(SIGNED_IN).id);
  });

  it('takes a newer server post over its local copy (router.refresh)', () => {
    const { rerender } = renderCard(lockedPost(SIGNED_IN));
    expect(screen.getByText('Premium')).toBeInTheDocument();
    rerender(
      <PostCard post={post({ visibility: 'PREMIUM', caption: 'Rahasia' })} creator={CREATOR} />,
    );
    expect(screen.getByText('Terbuka')).toBeInTheDocument();
  });

  it('loads accessible media lazily into a carousel with a position indicator', async () => {
    renderCard(post({ imageCount: 3 }));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/posts/0190a000-0000-7000-8000-000000000001/media-access',
      { cache: 'no-store' },
    );
    const carousel = await screen.findByRole('region', { name: 'Media 1/3' });
    // alt="" images have no img role, so count the elements.
    expect(carousel.querySelectorAll('img')).toHaveLength(3);
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('plays only the video on the shown slide, pausing it when the slide changes', async () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, 'paused', { value: false, configurable: true });
      return Promise.resolve();
    });
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
      this: HTMLMediaElement,
    ) {
      Object.defineProperty(this, 'paused', { value: true, configurable: true });
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({
        ...media(0),
        media: [
          {
            id: 'v',
            kind: 'VIDEO',
            url: '/api/v1/dev-storage/post-video/v?sig=1',
            posterUrl: '/api/v1/dev-storage/post-video-thumb/v.jpg?sig=1',
            player: 'video',
            durationSeconds: 65,
          },
          { id: 'i', kind: 'IMAGE', url: `${SIGNED_URL}i` },
        ],
      }),
    );
    renderCard(post({ imageCount: 1, videoCount: 1 }));
    const carousel = await screen.findByRole('region', { name: 'Media 1/2' });
    const video = carousel.querySelector('video')!;
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1));
    expect(screen.getByText('1:05')).toBeInTheDocument();
    Object.defineProperty(carousel, 'scrollLeft', { value: 400, configurable: true });
    Object.defineProperty(carousel, 'clientWidth', { value: 400, configurable: true });
    fireEvent.scroll(carousel);
    await screen.findByRole('region', { name: 'Media 2/2' });
    expect(video.paused).toBe(true);
    vi.restoreAllMocks();
  });

  it('offers a retry when media fails to load', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    renderCard(post());
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it('marks accessible premium as Terbuka and offers Kirim Tip, but not on your own post', async () => {
    const { unmount } = renderCard(
      post({
        visibility: 'PREMIUM',
        offer: { priceCoins: 5 },
        viewer: { ...SIGNED_IN, canTip: true, subscribed: false },
      }),
    );
    // The chip re-renders once media is ready, so wait for the settled card.
    await screen.findByRole('region', { name: 'Media 1/3' });
    expect(screen.getByText('Terbuka')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kirim Tip' }));
    expect(await screen.findByRole('group', { name: 'Jumlah tip' })).toBeInTheDocument();
    unmount();
    renderCard(
      post({
        visibility: 'PREMIUM',
        offer: { priceCoins: 5 },
        viewer: { ...SIGNED_IN, canReport: false, canTip: false, subscribed: false },
      }),
    );
    expect(screen.queryByRole('button', { name: 'Kirim Tip' })).toBeNull();
  });

  it('saves with Simpan and shows the saved state', async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json({ saved: true })));
    vi.stubGlobal('fetch', fetchMock);
    renderCard(post());
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByText('Disimpan ke Koleksi Saya')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hapus dari Disimpan' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText('Segera hadir')).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/save'), { method: 'PUT' });
  });

  it('starts Simpan in the server state', () => {
    renderCard(post({ viewer: { ...SIGNED_IN, saved: true } }));
    expect(screen.getByRole('button', { name: 'Hapus dari Disimpan' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('turns every guest action into a login link', () => {
    renderCard(post({ viewer: null, visibility: 'PREMIUM', offer: { priceCoins: 5 } }));
    for (const name of ['Bagikan', 'Simpan']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', LOGIN);
    }
    expect(screen.getByRole('link', { name: /Masuk untuk menyukai/ })).toHaveAttribute(
      'href',
      LOGIN,
    );
    // Tipping needs an account, so a guest gets no tip button at all.
    expect(screen.queryByRole('button', { name: 'Kirim Tip' })).toBeNull();
  });

  it('expands a long caption and links it to the post', () => {
    renderCard(post({ caption: `${'Panjang '.repeat(30)}akhir` }));
    const caption = screen.getByText(/akhir/);
    expect(caption).toHaveClass('line-clamp-2');
    expect(caption.closest('a')).toHaveAttribute(
      'href',
      '/ana/posts/0190a000-0000-7000-8000-000000000001',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Selengkapnya' }));
    expect(caption).not.toHaveClass('line-clamp-2');
  });

  it('never puts media URLs in the server-rendered markup', () => {
    const html = renderToString(
      <Toaster>
        <PostCard post={post({ imageCount: 3 })} creator={CREATOR} />
      </Toaster>,
    );
    expect(html).not.toContain('storage.example');
    expect(html).not.toContain('media-access');
  });
});

describe('PostCard detail mode', () => {
  const long = `${'Kalimat panjang. '.repeat(12)}\nBaris dua`;
  const renderDetail = (p: PublicPost | Parameters<typeof PostCard>[0]['post']) =>
    render(<PostCard post={p} creator={CREATOR} detail />, { wrapper: Toaster });

  it('shows the whole caption, with no toggle and no link', () => {
    renderDetail(post({ caption: long }));
    expect(screen.getByText(/Baris dua/)).not.toHaveClass('line-clamp-2');
    expect(screen.queryByRole('button', { name: 'Selengkapnya' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Kalimat panjang/ })).toBeNull();
  });

  it('says Tanpa caption for an empty caption, and the feed shows nothing', () => {
    const { unmount } = renderDetail(post({ caption: '' }));
    expect(screen.getByText('Tanpa caption')).toBeInTheDocument();
    unmount();
    renderCard(post({ caption: '' }));
    expect(screen.queryByText('Tanpa caption')).toBeNull();
  });

  it('points Komentar at the comments below instead of the post page', () => {
    const { unmount } = renderDetail(post());
    expect(screen.getByRole('link', { name: 'Komentar, 4' })).toHaveAttribute('href', '#komentar');
    unmount();
    renderCard(post());
    expect(screen.queryByRole('link', { name: 'Komentar, 4' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Komentar, 4' })).toBeInTheDocument();
  });

  describe('comments sheet', () => {
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
    afterEach(() => vi.unstubAllGlobals());

    it('opens from Komentar without navigating, and closing returns to the card', async () => {
      const fetchMock = vi.fn(() => Promise.resolve(Response.json(list)));
      vi.stubGlobal('fetch', fetchMock);
      renderCard(post());
      expect(screen.queryByRole('dialog')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Komentar, 4' }));
      expect(await screen.findByRole('dialog', { name: 'Komentar · 4' })).toBeInTheDocument();
      expect(await screen.findByText('mantap')).toBeInTheDocument();
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(screen.getByRole('button', { name: 'Komentar, 4' })).toBeInTheDocument();
    });

    it('bumps the card count after a comment is posted', async () => {
      const created = {
        ...list.items[0]!,
        id: '0190a000-0000-7000-8000-000000000102',
        body: 'baru',
      };
      vi.stubGlobal(
        'fetch',
        vi.fn((_url: string, init?: RequestInit) =>
          Promise.resolve(
            init?.method === 'POST' ? Response.json(created, { status: 201 }) : Response.json(list),
          ),
        ),
      );
      renderCard(post());
      fireEvent.click(screen.getByRole('button', { name: 'Komentar, 4' }));
      await screen.findByText('mantap');
      fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: 'baru' } });
      fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
      await screen.findByText('baru');
      expect(screen.getByRole('dialog', { name: 'Komentar · 5' })).toBeInTheDocument();
    });

    it('locked premium: shows the locked state and never asks for comments', () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      renderCard(post({ visibility: 'PREMIUM', access: 'locked', offer: { priceCoins: 8 } }));
      fireEvent.click(screen.getByRole('button', { name: 'Komentar, 4' }));
      expect(screen.getByText('Komentar khusus pendukung')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('guest on a free post reads comments and is sent to login to write', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(() => Promise.resolve(Response.json({ ...list, canComment: false }))),
      );
      renderCard(post({ viewer: null }));
      fireEvent.click(screen.getByRole('button', { name: 'Komentar, 4' }));
      expect(await screen.findByText('mantap')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Masuk untuk berkomentar' })).toBeInTheDocument();
    });
  });

  it('sends a guest back to the post after login', () => {
    renderDetail(post({ viewer: null }));
    expect(screen.getByRole('link', { name: 'Bagikan' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fana%2Fposts%2F0190a000-0000-7000-8000-000000000001',
    );
  });

  it('opens Buka without a detail link on a locked post, and loads no media', () => {
    renderDetail(lockedPost(SIGNED_IN));
    fireEvent.click(screen.getByRole('button', { name: /Buka post · 8 Koin/ }));
    expect(screen.queryByRole('link', { name: 'Lihat detail post' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('renders a never-published post without a time', () => {
    const { container } = renderDetail({ ...post(), publishedAt: null });
    expect(container.querySelector('time')).toBeNull();
    expect(screen.getByText('@ana')).toBeInTheDocument();
  });
});

function stubFetch(impl: (url: string) => Promise<Response>) {
  fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
}

describe('PostCard full-screen viewer', () => {
  it('opens at the tapped slide and returns focus to the button on close', async () => {
    renderCard(post({ imageCount: 3 }));
    const carousel = await screen.findByRole('region', { name: 'Media 1/3' });
    const open = within(carousel).getAllByRole('button', { name: 'Buka layar penuh' })[1]!;
    open.focus();
    fireEvent.click(open);
    const dialog = await screen.findByRole('dialog', { name: 'Media Ana Putri, layar penuh' });
    expect(await within(dialog).findByText('2/3')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tutup layar penuh' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(open).toHaveFocus());
  });

  it('offers a separate Layar penuh button on a video slide', async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json({
          media: [
            {
              id: 'v0',
              kind: 'VIDEO',
              url: 'https://s.example/v.mp4',
              player: 'video',
              posterUrl: null,
              durationSeconds: 5,
            },
          ],
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          watermark: null,
        }),
      ),
    );
    renderCard(
      post({ videoCount: 1, imageCount: 0, media: [{ kind: 'VIDEO', durationSeconds: 5 }] }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Layar penuh' }));
    expect(await screen.findByRole('dialog', { name: /layar penuh/ })).toBeInTheDocument();
  });

  it('keeps the card and viewer likes in sync', async () => {
    stubFetch((url: string) =>
      Promise.resolve(
        url.endsWith('/like')
          ? Response.json({ liked: true, likeCount: 4 })
          : Response.json(media(2)),
      ),
    );
    renderCard(post({ imageCount: 2 }));
    fireEvent.click((await screen.findAllByRole('button', { name: 'Buka layar penuh' }))[0]!);
    const dialog = await screen.findByRole('dialog', { name: /layar penuh/ });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Suka · 3 suka' }));
    await within(dialog).findByRole('button', { name: 'Batal suka · 4 suka' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Tutup layar penuh' }));
    expect(await screen.findByRole('button', { name: 'Batal suka · 4 suka' })).toBeInTheDocument();
  });

  it('never offers the viewer on a locked post', () => {
    renderCard(lockedPost(SIGNED_IN));
    expect(screen.queryByRole('button', { name: /layar penuh/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
