import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatorSearchResult } from '@influency/shared';
import { searchCreators } from '@/lib/api/discover';
import { addRecentCreator } from '@/lib/recent-creators';
import { CreatorSearch } from './creator-search';

vi.mock('@/lib/api/discover', () => ({ searchCreators: vi.fn() }));

const creator = (slug: string): CreatorSearchResult => ({
  slug,
  displayName: `Creator ${slug}`,
  avatarUrl: null,
});

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  vi.mocked(searchCreators).mockReset();
});
afterEach(() => vi.useRealTimers());

const type = (value: string) =>
  fireEvent.change(screen.getByLabelText('Cari creator'), { target: { value } });
const settle = async () => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
};

describe('CreatorSearch', () => {
  it('focuses the input when asked', () => {
    render(<CreatorSearch autoFocus />);
    expect(screen.getByLabelText('Cari creator')).toHaveFocus();
  });

  it('shows matching creators after the debounce', async () => {
    vi.mocked(searchCreators).mockResolvedValue([creator('raka')]);
    render(<CreatorSearch />);
    type('rak');
    expect(searchCreators).not.toHaveBeenCalled();
    await settle();
    expect(searchCreators).toHaveBeenCalledWith('rak');
    const results = screen.getByRole('region', { name: 'Hasil pencarian' });
    expect(results).toHaveTextContent('@raka');
    expect(screen.getByRole('link', { name: /Creator raka/ })).toHaveAttribute('href', '/raka');
  });

  it('says when nothing matches', async () => {
    vi.mocked(searchCreators).mockResolvedValue([]);
    render(<CreatorSearch />);
    type('zzz');
    await settle();
    expect(screen.getByText('Tidak ada creator yang cocok dengan “zzz”.')).toBeInTheDocument();
  });

  it('ignores a slow answer for an older query', async () => {
    let resolveOld: (v: CreatorSearchResult[]) => void = () => {};
    vi.mocked(searchCreators)
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce([creator('nadia')]);
    render(<CreatorSearch />);
    type('ra');
    await settle();
    type('na');
    await settle();
    await act(() => {
      resolveOld([creator('raka')]);
      return Promise.resolve();
    });
    expect(screen.getByRole('region', { name: 'Hasil pencarian' })).toHaveTextContent('@nadia');
    expect(screen.queryByText('@raka')).toBeNull();
  });

  it('offers a retry when the search fails', async () => {
    vi.mocked(searchCreators)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue([creator('raka')]);
    render(<CreatorSearch />);
    type('raka');
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await settle();
    expect(screen.getByRole('region', { name: 'Hasil pencarian' })).toHaveTextContent('@raka');
  });

  it('shows the hint when nothing was viewed yet', () => {
    render(<CreatorSearch />);
    expect(screen.getByText('Creator yang kamu lihat akan muncul di sini.')).toBeInTheDocument();
  });

  it('lists recently viewed creators, expands and removes them', () => {
    for (const slug of ['a', 'b', 'c', 'd', 'e', 'f']) addRecentCreator(creator(slug));
    render(<CreatorSearch />);
    const recent = screen.getByRole('region', { name: 'Baru dilihat' });
    expect(recent.querySelectorAll('a')).toHaveLength(5);
    expect(recent.querySelector('a')).toHaveAttribute('href', '/f');
    fireEvent.click(screen.getByRole('button', { name: 'Lihat semua' }));
    expect(recent.querySelectorAll('a')).toHaveLength(6);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus Creator f dari baru dilihat' }));
    expect(recent.querySelectorAll('a')).toHaveLength(5);
    expect(recent.querySelector('a')).toHaveAttribute('href', '/e');
  });
});
