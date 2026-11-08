import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { fetchWallet } from '@/lib/api/wallet';
import { PurchaseSheet } from './purchase-sheet';

vi.mock('@/lib/api/wallet', () => ({ fetchWallet: vi.fn() }));

beforeEach(() => {
  vi.mocked(fetchWallet).mockReset();
});

const open = (priceCoins: number) => {
  render(
    <PurchaseSheet
      trigger={<button type="button">Buka</button>}
      kicker="Buka post"
      title="Buka post"
      rows={[]}
      priceCoins={priceCoins}
      ctaLabel="Buka sekarang"
    />,
    { wrapper: Toaster },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
};

describe('PurchaseSheet balance', () => {
  it('does not fetch the balance until the sheet opens, then disables the CTA while loading', async () => {
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 100 });
    render(
      <PurchaseSheet
        trigger={<button type="button">Buka</button>}
        kicker="k"
        title="t"
        rows={[]}
        priceCoins={50}
        ctaLabel="Buka sekarang"
      />,
      { wrapper: Toaster },
    );
    expect(fetchWallet).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
    expect(screen.getByRole('button', { name: 'Buka sekarang' })).toBeDisabled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Buka sekarang' })).toBeEnabled(),
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('100 Koin');
  });

  it('links to the wallet with the real shortfall', async () => {
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 30 });
    open(50);
    const link = await screen.findByRole('link', { name: 'Isi Koin · kurang 20 Koin' });
    expect(link).toHaveAttribute('href', '/wallet');
  });

  it('keeps the CTA disabled when the balance cannot be loaded', async () => {
    vi.mocked(fetchWallet).mockImplementation(() => Promise.reject(new Error('x')));
    open(50);
    await waitFor(() => expect(fetchWallet).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Buka sekarang' })).toBeDisabled();
  });
});
