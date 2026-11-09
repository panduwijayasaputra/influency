import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWallet } from '@/lib/api/wallet';
import { useWalletBalance } from './use-wallet-balance';

vi.mock('@/lib/api/wallet', () => ({ fetchWallet: vi.fn() }));
const mocked = vi.mocked(fetchWallet);

beforeEach(() => mocked.mockReset());

describe('useWalletBalance', () => {
  it('loads the balance', async () => {
    mocked.mockResolvedValue({ balanceCoins: 42 });
    const { result } = renderHook(() => useWalletBalance());
    expect(result.current.balance).toBeNull();
    await waitFor(() => expect(result.current.balance).toBe(42));
  });

  it('does not request while disabled', async () => {
    renderHook(() => useWalletBalance(false));
    await new Promise((r) => setTimeout(r, 10));
    expect(mocked).not.toHaveBeenCalled();
  });

  it('reports an error and recovers on reload', async () => {
    mocked.mockRejectedValueOnce(new Error('x')).mockResolvedValueOnce({ balanceCoins: 5 });
    const { result } = renderHook(() => useWalletBalance());
    await waitFor(() => expect(result.current.error).toBe(true));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.balance).toBe(5));
    expect(result.current.error).toBe(false);
  });
});
