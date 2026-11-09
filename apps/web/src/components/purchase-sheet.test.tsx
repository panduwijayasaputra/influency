import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/errors';
import { fetchWallet } from '@/lib/api/wallet';
import { PurchaseSheet } from './purchase-sheet';

vi.mock('@/lib/api/wallet', () => ({ fetchWallet: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchWallet).mockReset();
});

type OnConfirm = (key: string, price: number) => Promise<void>;
const ui = (priceCoins: number, onConfirm: OnConfirm, extra: { disclosure?: string } = {}) => (
  <PurchaseSheet
    trigger={<button type="button">Buka</button>}
    kicker="Buka post"
    title="Buka post"
    rows={[]}
    priceCoins={priceCoins}
    ctaLabel="Buka sekarang"
    returnPath="/ana/posts/p1"
    onConfirm={onConfirm}
    {...extra}
  />
);
const open = (priceCoins: number, onConfirm: OnConfirm = vi.fn().mockResolvedValue(undefined)) => {
  render(ui(priceCoins, onConfirm), { wrapper: Toaster });
  fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
  return onConfirm;
};
const cta = () => screen.getByRole('button', { name: 'Buka sekarang' });
const ready = () => waitFor(() => expect(cta()).toBeEnabled());

describe('PurchaseSheet balance', () => {
  it('does not fetch the balance until the sheet opens, then disables the CTA while loading', async () => {
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    render(ui(50, vi.fn()), { wrapper: Toaster });
    expect(fetchWallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
    expect(cta()).toBeDisabled();
    await ready();
    expect(screen.getByRole('dialog')).toHaveTextContent('100 Koin');
  });

  it('links to the wallet with the real shortfall and a return path', async () => {
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 30 });
    open(50);
    const link = await screen.findByRole('link', { name: 'Isi Koin · kurang 20 Koin' });
    expect(link).toHaveAttribute('href', '/wallet?returnTo=%2Fana%2Fposts%2Fp1');
  });

  it('keeps the CTA disabled when the balance cannot be loaded', async () => {
    vi.mocked(fetchWallet).mockImplementation(() => Promise.reject(new Error('x')));
    open(50);
    await waitFor(() => expect(fetchWallet).toHaveBeenCalled());
    expect(cta()).toBeDisabled();
  });

  it('shows the disclosure when given', async () => {
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    render(ui(50, vi.fn(), { disclosure: 'Sudah lewat Langganan' }), { wrapper: Toaster });
    fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
    expect(await screen.findByText('Sudah lewat Langganan')).toBeInTheDocument();
  });
});

describe('PurchaseSheet confirm', () => {
  it('confirms once on a double click and closes on success', async () => {
    let resolve!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    open(50, onConfirm);
    await ready();
    const btn = cta();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith(expect.any(String), 50);
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('keeps the same key on retry after an error and uses a new one on reopen', async () => {
    const onConfirm = vi
      .fn<OnConfirm>()
      .mockRejectedValueOnce(new ApiError('REQUEST_IN_PROGRESS', 'm'))
      .mockRejectedValueOnce(new ApiError('REQUEST_IN_PROGRESS', 'm'))
      .mockResolvedValueOnce();
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    open(50, onConfirm);
    await ready();
    fireEvent.click(cta());
    expect(await screen.findByRole('alert')).toHaveTextContent('Permintaan sebelumnya');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(onConfirm.mock.calls[1]![0]).toBe(onConfirm.mock.calls[0]![0]);
    await screen.findByRole('button', { name: 'Coba lagi' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
    await ready();
    fireEvent.click(cta());
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(3));
    expect(onConfirm.mock.calls[2]![0]).not.toBe(onConfirm.mock.calls[0]![0]);
  });

  it('shows the shortfall the server reports', async () => {
    const onConfirm = vi
      .fn<OnConfirm>()
      .mockRejectedValue(new ApiError('INSUFFICIENT_COINS', 'm', { required: 50, available: 40 }));
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    open(50, onConfirm);
    await ready();
    fireEvent.click(cta());
    expect(await screen.findByRole('link', { name: 'Isi Koin · kurang 10 Koin' })).toBeVisible();
  });

  it('asks again at the new price with a new key after OFFER_CHANGED', async () => {
    const onConfirm = vi
      .fn<OnConfirm>()
      .mockRejectedValueOnce(new ApiError('OFFER_CHANGED', 'm', { priceCoins: 60 }))
      .mockResolvedValueOnce();
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    open(50, onConfirm);
    await ready();
    fireEvent.click(cta());
    expect(await screen.findByRole('alert')).toHaveTextContent('Harga berubah menjadi 60 Koin');
    fireEvent.click(screen.getByRole('button', { name: 'Lanjutkan · 60 Koin' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(2));
    expect(onConfirm.mock.calls[1]![1]).toBe(60);
    expect(onConfirm.mock.calls[1]![0]).not.toBe(onConfirm.mock.calls[0]![0]);
  });
});
