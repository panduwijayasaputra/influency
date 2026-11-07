import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PublicPost } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getPublicPosts } from '@/lib/api/public-posts';
import { DEMO_KOIN_BALANCE, DEMO_PURCHASE_MESSAGE } from '@/lib/demo';
import { CreatorPosts } from './creator-posts';

vi.mock('@/lib/api/public-posts', () => ({ getPublicPosts: vi.fn() }));

const post = (overrides: Partial<PublicPost>): PublicPost => ({
  id: crypto.randomUUID(),
  visibility: 'FREE',
  caption: 'Halo',
  publishedAt: '2026-11-03T05:00:00.000Z',
  imageCount: 0,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  ...overrides,
});

async function renderFeed(posts: PublicPost[] | null | Error) {
  if (posts instanceof Error) vi.mocked(getPublicPosts).mockRejectedValue(posts);
  else vi.mocked(getPublicPosts).mockResolvedValue(posts && { posts });
  return render(await CreatorPosts({ slug: 'claudiandreya', creatorName: 'Claudia Andreya' }), {
    wrapper: Toaster,
  });
}

const tiles = () => screen.queryAllByRole('article');

describe('CreatorPosts', () => {
  afterEach(() => vi.clearAllMocks());

  it('shows free and premium tiles with their price, media and cover', async () => {
    const { container } = await renderFeed([
      post({
        caption: 'Premium satu',
        visibility: 'PREMIUM',
        videoCount: 1,
        offer: { priceCoins: 8 },
      }),
      post({ caption: 'Gratis satu', imageCount: 2 }),
    ]);
    const [premium, free] = tiles() as [HTMLElement, HTMLElement];
    expect(free).toHaveTextContent('Gratis satu');
    expect(free).toHaveTextContent('2 foto');
    expect(free).toHaveTextContent('3 Nov 2026');
    expect(free).not.toHaveTextContent('Koin');
    expect(premium).toHaveTextContent('Premium satu');
    expect(premium).toHaveTextContent('1 video');
    expect(premium).toHaveTextContent('8 Koin · Premium');
    expect(premium).not.toHaveTextContent('hari');
    expect(container.querySelector('img, video')).toBeNull();
    expect(within(premium).getByTestId('locked-placeholder')).toBeInTheDocument();
    expect(within(free).queryByTestId('locked-placeholder')).toBeNull();
    expect(getPublicPosts).toHaveBeenCalledWith('claudiandreya');
  });

  it('filters tiles with the Semua / Gratis / Premium chips', async () => {
    await renderFeed([
      post({ caption: 'Premium satu', visibility: 'PREMIUM', offer: { priceCoins: 8 } }),
      post({ caption: 'Gratis satu' }),
    ]);
    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true');
    expect(tiles()).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Gratis' }));
    expect(screen.getByRole('button', { name: 'Gratis' })).toHaveAttribute('aria-pressed', 'true');
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]).toHaveTextContent('Gratis satu');

    fireEvent.click(screen.getByRole('button', { name: 'Premium' }));
    expect(tiles()).toHaveLength(1);
    expect(tiles()[0]).toHaveTextContent('Premium satu');
  });

  it('shows an empty message when a filter matches no posts', async () => {
    await renderFeed([post({ caption: 'Gratis satu' })]);
    fireEvent.click(screen.getByRole('button', { name: 'Premium' }));
    expect(tiles()).toHaveLength(0);
    expect(screen.getByText('Belum ada konten di kategori ini.')).toBeInTheDocument();
  });

  it('shows the generated preview on a premium tile', async () => {
    const previewUrl = '/api/v1/creators/claudiandreya/posts/p/preview/x';
    const { container } = await renderFeed([
      post({ visibility: 'PREMIUM', offer: { priceCoins: 5 }, previewUrl }),
    ]);
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(tiles()[0]!.querySelector('img')).toHaveAttribute('src', previewUrl);
    expect(screen.queryByTestId('locked-placeholder')).toBeNull();
  });

  it('links free tiles to the post; premium tiles open the unlock sheet', async () => {
    const free = post({});
    const premium = post({ caption: 'Rahasia', visibility: 'PREMIUM', offer: { priceCoins: 5 } });
    await renderFeed([free, premium]);
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      `/claudiandreya/posts/${free.id}`,
    ]);

    fireEvent.click(screen.getByRole('button', { name: /Rahasia/ }));
    const sheet = screen.getByRole('dialog', { name: 'Rahasia' });
    expect(sheet).toHaveTextContent('Post premium · Claudia Andreya');
    expect(sheet).toHaveTextContent('Masa aksesPermanen');
    expect(sheet).toHaveTextContent('Harga5 Koin');
    expect(within(sheet).getByRole('link', { name: 'Lihat detail post' })).toHaveAttribute(
      'href',
      `/claudiandreya/posts/${premium.id}`,
    );
    // Buying is a demo: no request; the sheet closes with a toast.
    fireEvent.click(within(sheet).getByRole('button', { name: 'Buka dengan 5 Koin' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('listitem')).toHaveTextContent(DEMO_PURCHASE_MESSAGE);
  });

  it('sends the viewer to top up when the price exceeds the balance', async () => {
    const priceCoins = DEMO_KOIN_BALANCE + 30;
    await renderFeed([post({ caption: 'Mahal', visibility: 'PREMIUM', offer: { priceCoins } })]);
    fireEvent.click(screen.getByRole('button', { name: /Mahal/ }));
    const sheet = screen.getByRole('dialog', { name: 'Mahal' });
    expect(within(sheet).queryByRole('button', { name: /^Buka dengan/ })).toBeNull();
    expect(within(sheet).getByRole('link', { name: 'Isi Koin · kurang 30 Koin' })).toHaveAttribute(
      'href',
      '/wallet',
    );
  });

  it('shows the like count only when a post has likes', async () => {
    await renderFeed([post({ caption: 'Populer', likeCount: 3 }), post({ caption: 'Belum' })]);
    expect(screen.getByText(/· 3 suka$/)).toBeInTheDocument();
    expect(screen.getAllByText(/suka/)).toHaveLength(1);
  });

  it('shows "Tanpa caption" for an empty caption', async () => {
    await renderFeed([post({ caption: '', imageCount: 1 })]);
    expect(screen.getByText('Tanpa caption')).toBeInTheDocument();
  });

  it.each([[[]], [null]])('shows the empty state for %j', async (posts) => {
    await renderFeed(posts);
    expect(screen.getByText('Belum ada konten yang dipublikasikan.')).toBeInTheDocument();
  });

  it('survives an API outage', async () => {
    await renderFeed(new Error('down'));
    expect(screen.getByText('Konten belum bisa dimuat.')).toBeInTheDocument();
  });
});
