import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { LibraryItem, LibraryPage } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { fetchLibraryPage } from '@/lib/api/library';
import { LibraryView } from './library-view';

vi.mock('@/lib/api/library', () => ({ fetchLibraryPage: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const item = (id: string, over: Partial<LibraryItem> = {}): LibraryItem => ({
  id,
  visibility: 'FREE',
  caption: `caption ${id}`,
  publishedAt: '2026-11-01T00:00:00.000Z',
  imageCount: 1,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  likeCount: 0,
  access: 'full',
  viewer: null,
  commentCount: 0,
  media: [{ kind: 'IMAGE', durationSeconds: null }],
  creator: { slug: 'ana', displayName: 'Ana', avatarUrl: null },
  saved: true,
  purchased: false,
  addedAt: '2026-11-08T00:00:00.000Z',
  ...over,
});
const page = (items: LibraryItem[], creators: LibraryPage['creators'] = []): LibraryPage => ({
  items,
  nextCursor: null,
  creators,
});

const renderView = () => render(<LibraryView />, { wrapper: Toaster });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response('{}', { status: 404 }))),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

describe('LibraryView', () => {
  it('has the Disimpan / Dibeli filter and no "Liked" option', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(page([item('a')]));
    renderView();
    await screen.findByRole('button', { name: /^Post ·/ });
    const group = screen.getByRole('group', { name: 'Disimpan atau dibeli' });
    expect(group).toHaveTextContent('SemuaDisimpanDibeli');
    expect(screen.queryByText(/disukai|liked/i)).toBeNull();
  });

  it('tags a bought item "Dibeli" and a saved-only item "Disimpan"', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(
      page([item('a', { saved: true, purchased: true }), item('b')]),
    );
    renderView();
    await screen.findAllByRole('button', { name: /^Post ·/ });
    expect(screen.getAllByText('Dibeli', { selector: 'span' })).toHaveLength(1);
    expect(screen.getAllByText('Disimpan', { selector: 'span' })).toHaveLength(1);
  });

  it('asks the data function for each filter and resets the list', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(
      page([item('a')], [{ slug: 'ana', displayName: 'Ana' }]),
    );
    renderView();
    await screen.findByRole('button', { name: /^Post ·/ });
    expect(fetchLibraryPage).toHaveBeenLastCalledWith({
      relation: 'all',
      media: 'all',
      sort: 'recent',
      creator: undefined,
      cursor: undefined,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Dibeli' }));
    await waitFor(() =>
      expect(fetchLibraryPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ relation: 'purchased' }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Video' }));
    await waitFor(() =>
      expect(fetchLibraryPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ media: 'video' }),
      ),
    );
    fireEvent.change(screen.getByLabelText('Urutkan'), { target: { value: 'oldest' } });
    await waitFor(() =>
      expect(fetchLibraryPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ sort: 'oldest' }),
      ),
    );
    fireEvent.change(screen.getByLabelText('Filter creator'), { target: { value: 'ana' } });
    await waitFor(() =>
      expect(fetchLibraryPage).toHaveBeenLastCalledWith(
        expect.objectContaining({ creator: 'ana' }),
      ),
    );
  });

  it('shows a locked premium tile as a link to the post page without requesting media', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(
      page([
        item('p', {
          visibility: 'PREMIUM',
          access: 'locked',
          offer: { priceCoins: 8 },
          previewUrl: '/pv',
        }),
      ]),
    );
    renderView();
    const tile = await screen.findByRole('link', { name: /terkunci/ });
    expect(tile).toHaveAttribute('href', '/ana/posts/p');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('switches to the vertical view with post cards', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(page([item('a')]));
    renderView();
    await screen.findByRole('button', { name: /^Post ·/ });
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan vertikal' }));
    expect(await screen.findByText('caption a')).toBeInTheDocument();
  });

  it('explains an empty collection and an empty filter result', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(page([]));
    renderView();
    expect(await screen.findByText('Belum ada apa-apa')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Dibeli' }));
    expect(await screen.findByText('Tidak ada hasil')).toBeInTheDocument();
  });

  it('shows an error and retries', async () => {
    vi.mocked(fetchLibraryPage)
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce(page([item('a')]));
    renderView();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('button', { name: /^Post ·/ })).toBeInTheDocument();
  });

  it('shows a skeleton while loading', () => {
    vi.mocked(fetchLibraryPage).mockReturnValue(new Promise(() => {}));
    renderView();
    expect(screen.getByLabelText('Memuat koleksi')).toBeInTheDocument();
  });

  it('says saving never unlocks a premium post', async () => {
    vi.mocked(fetchLibraryPage).mockResolvedValue(page([item('a')]));
    renderView();
    expect(await screen.findByText(/tidak membukanya/)).toBeInTheDocument();
  });
});
