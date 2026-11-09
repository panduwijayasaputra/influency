import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoinPackage } from '@influency/shared';
import { ApiError, createTopup, startCheckout } from '@/lib/api/wallet';
import { TopupSheet } from './topup-sheet';

vi.mock('@/lib/api/wallet', () => ({
  createTopup: vi.fn(),
  startCheckout: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

const PKG: CoinPackage = { id: '0198a3c0-0000-7000-8000-000000000101', coins: 25, priceIdr: 25000 };
const ORDER = { orderId: '0198a3c0-0000-7000-8000-000000000900', redirectUrl: '/wallet/topups/x' };

beforeEach(() => {
  vi.mocked(createTopup).mockReset();
  vi.mocked(startCheckout).mockReset();
});

const open = () => render(<TopupSheet pkg={PKG} onClose={() => {}} />);

describe('TopupSheet', () => {
  it('shows package, Rp0 fee, total and the sandbox badge', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Beli Koin' });
    expect(dialog).toHaveTextContent('Mode Sandbox — tidak ada uang sungguhan');
    expect(dialog).toHaveTextContent('25 Koin');
    expect(dialog).toHaveTextContent('Biaya layananRp0');
    expect(dialog).toHaveTextContent('Total bayarRp25.000');
  });

  it('creates one order on a double click and starts checkout with its URL', async () => {
    vi.mocked(createTopup).mockResolvedValue(ORDER);
    open();
    const button = screen.getByRole('button', { name: 'Lanjut ke pembayaran' });
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(startCheckout).toHaveBeenCalledWith(ORDER.redirectUrl));
    expect(createTopup).toHaveBeenCalledTimes(1);
    expect(createTopup).toHaveBeenCalledWith(PKG.id, expect.any(String));
  });

  it('shows the error and retries with the same idempotency key', async () => {
    vi.mocked(createTopup)
      .mockRejectedValueOnce(new Error('Layanan sibuk.'))
      .mockResolvedValueOnce(ORDER);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut ke pembayaran' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Layanan sibuk.');
    fireEvent.click(screen.getByRole('button', { name: 'Lanjut ke pembayaran' }));
    await waitFor(() => expect(startCheckout).toHaveBeenCalled());
    const [first, second] = vi.mocked(createTopup).mock.calls;
    expect(second![1]).toBe(first![1]);
  });

  it('keeps the key after REQUEST_IN_PROGRESS but starts over after a gateway failure', async () => {
    vi.mocked(createTopup)
      .mockRejectedValueOnce(new ApiError('REQUEST_IN_PROGRESS', 'Masih diproses.'))
      .mockRejectedValueOnce(new ApiError('PAYMENT_GATEWAY_UNAVAILABLE', 'Layanan tidak tersedia.'))
      .mockResolvedValueOnce(ORDER);
    open();
    const pay = () => fireEvent.click(screen.getByRole('button', { name: 'Lanjut ke pembayaran' }));
    pay();
    await screen.findByText('Masih diproses.');
    pay();
    await screen.findByText('Layanan tidak tersedia.');
    pay();
    await waitFor(() => expect(startCheckout).toHaveBeenCalled());
    const keys = vi.mocked(createTopup).mock.calls.map((c) => c[1]);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });
});
