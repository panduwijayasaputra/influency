import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePagedList } from './use-paged-list';

const page = (ids: string[], nextCursor: string | null) => ({
  items: ids.map((id) => ({ id })),
  nextCursor,
});

describe('usePagedList', () => {
  it('loads the first page, then appends the next without duplicates', async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(page(['a', 'b'], 'c1'))
      .mockResolvedValueOnce(page(['b', 'c'], null));
    const { result } = renderHook(() => usePagedList(load, 'k'));
    await waitFor(() => expect(result.current.status).toBe('idle'));
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);

    act(() => result.current.loadMore());
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(load).toHaveBeenLastCalledWith('c1');

    act(() => result.current.loadMore());
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('shows an error and retries the same page', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('x'))
      .mockResolvedValueOnce(page(['a'], null));
    const { result } = renderHook(() => usePagedList(load, 'k'));
    await waitFor(() => expect(result.current.status).toBe('error'));
    act(() => result.current.retry());
    await waitFor(() => expect(result.current.status).toBe('done'));
    expect(result.current.items).toEqual([{ id: 'a' }]);
  });

  it('resets on a new key and ignores the answer for the old one', async () => {
    let resolveOld: (p: ReturnType<typeof page>) => void = () => {};
    const load = vi
      .fn()
      .mockImplementationOnce(() => new Promise((r) => (resolveOld = r)))
      .mockResolvedValueOnce(page(['new'], null));
    const { result, rerender } = renderHook(({ k }) => usePagedList(load, k), {
      initialProps: { k: 'old' },
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    rerender({ k: 'new' });
    await waitFor(() => expect(result.current.status).toBe('done'));
    await act(() => Promise.resolve(resolveOld(page(['stale'], null))));
    expect(result.current.items).toEqual([{ id: 'new' }]);
  });
});
