import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Payout, PayoutQuote } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/errors';
import { quotePayout, requestPayout } from '@/lib/api/payouts';
import { PayoutRequestSheet } from './payout-request-sheet';

vi.mock('@/lib/api/payouts', () => ({ quotePayout: vi.fn(), requestPayout: vi.fn() }));

const DESTINATION = { bankCode: 'BCA', bankName: 'BCA', last4: '4821', holderName: 'Nadia Kirana' };
const quoteFor = (amountIdr: number, over: Partial<PayoutQuote> = {}): PayoutQuote => ({
  amountIdr,
  feeIdr: 2_500,
  netIdr: amountIdr - 2_500,
  feeIsPlaceholder: true,
  availableIdr: 248_500,
  destination: DESTINATION,
  ...over,
});
const PAYOUT: Payout = {
  id: '0190a000-0000-7000-8000-000000000999',
  amountIdr: 248_500,
  feeIdr: 2_500,
  netIdr: 246_000,
  feeIsPlaceholder: true,
  status: 'REQUESTED',
  destination: DESTINATION,
  requestedAt: '2026-11-09T00:00:00.000Z',
  updatedAt: '2026-11-09T00:00:00.000Z',
};

const onRequested = vi.fn();
const onStale = vi.fn();
const onOpenChange = vi.fn();
const renderSheet = (availableIdr = 248_500) =>
  render(
    <PayoutRequestSheet
      open
      onOpenChange={onOpenChange}
      availableIdr={availableIdr}
      onRequested={onRequested}
      onStale={onStale}
    />,
    { wrapper: Toaster },
  );
const amountInput = () => screen.getByLabelText('Jumlah pencairan (Rp)');
const confirm = () => screen.getByRole('button', { name: 'Ajukan pencairan' });
const waitForQuote = async () =>
  await waitFor(() => expect(screen.getByText('Kamu terima')).toBeVisible(), { timeout: 2000 });

beforeEach(() => {
  vi.mocked(quotePayout).mockImplementation((amount) => Promise.resolve(quoteFor(amount)));
  vi.mocked(requestPayout).mockResolvedValue(PAYOUT);
});
afterEach(() => vi.clearAllMocks());

describe('PayoutRequestSheet', () => {
  it('starts with the whole balance and shows the quote: fee with its placeholder pill, net, destination', async () => {
    renderSheet();
    expect(amountInput()).toHaveValue('248500');
    await waitForQuote();
    expect(screen.getByText('Rp2.500')).toBeVisible();
    expect(screen.getByText('Perlu konfirmasi')).toBeVisible();
    expect(screen.getByText('Rp246.000')).toBeVisible();
    expect(screen.getByText(/BCA •••• 4821 · a\.n\. Nadia Kirana/)).toBeVisible();
    expect(
      screen.getByText(
        'Diproses manual setiap Jumat hari kerja. Waktu masuk ke rekening tidak dijamin.',
      ),
    ).toBeVisible();
    expect(confirm()).toBeEnabled();
  });

  it('"Semua" resets the amount to the full balance', () => {
    renderSheet();
    fireEvent.change(amountInput(), { target: { value: '120000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Semua' }));
    expect(amountInput()).toHaveValue('248500');
  });

  it('keeps only digits when typing or pasting a formatted amount', () => {
    renderSheet();
    fireEvent.change(amountInput(), { target: { value: 'Rp 120.000' } });
    expect(amountInput()).toHaveValue('120000');
  });

  it.each([
    ['below the minimum', '99999', 'Minimal pencairan Rp100.000.'],
    ['above the balance', '248501', 'Melebihi saldo tersedia Rp248.500.'],
    ['empty', '', 'Masukkan jumlah dalam rupiah.'],
  ])('blocks an amount %s and does not ask for a quote', async (_label, value, message) => {
    renderSheet();
    fireEvent.change(amountInput(), { target: { value } });
    expect(screen.getByText(message)).toBeVisible();
    expect(confirm()).toBeDisabled();
    await act(() => new Promise((r) => setTimeout(r, 400)));
    expect(vi.mocked(quotePayout)).not.toHaveBeenCalledWith(Number(value));
  });

  it('accepts exactly the minimum', async () => {
    renderSheet();
    fireEvent.change(amountInput(), { target: { value: '100000' } });
    await waitForQuote();
    expect(confirm()).toBeEnabled();
  });

  it('blocks confirming when the net would be zero or less', async () => {
    vi.mocked(quotePayout).mockImplementation((amount) =>
      Promise.resolve(quoteFor(amount, { feeIdr: amount, netIdr: 0 })),
    );
    renderSheet();
    await waitFor(() =>
      expect(screen.getByText('Jumlah terlalu kecil setelah biaya transfer.')).toBeVisible(),
    );
    expect(confirm()).toBeDisabled();
  });

  it('sends the amount and the fee that was shown, then closes, toasts and refreshes', async () => {
    renderSheet();
    await waitForQuote();
    fireEvent.click(confirm());
    await waitFor(() => expect(onRequested).toHaveBeenCalledWith(PAYOUT));
    expect(vi.mocked(requestPayout)).toHaveBeenCalledWith(
      { amountIdr: 248_500, expectedFeeIdr: 2_500 },
      expect.any(String),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(await screen.findByText('Pencairan diajukan')).toBeVisible();
  });

  it('sends one request on a double click', async () => {
    let finish: (p: Payout) => void = () => undefined;
    vi.mocked(requestPayout).mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderSheet();
    await waitForQuote();
    const button = confirm();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(vi.mocked(requestPayout)).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Mengajukan…' })).toBeDisabled();
    await act(() => {
      finish(PAYOUT);
      return Promise.resolve();
    });
  });

  it('reuses the Idempotency-Key when retrying the same request after a failure', async () => {
    vi.mocked(requestPayout).mockRejectedValueOnce(new Error('network'));
    renderSheet();
    await waitForQuote();
    fireEvent.click(confirm());
    expect(await screen.findByText('Gagal mengajukan pencairan. Coba lagi.')).toBeVisible();
    fireEvent.click(confirm());
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    const [first, second] = vi.mocked(requestPayout).mock.calls;
    expect(first?.[1]).toBe(second?.[1]);
  });

  it('uses a new Idempotency-Key once the amount changed', async () => {
    vi.mocked(requestPayout).mockRejectedValueOnce(new Error('network'));
    renderSheet();
    await waitForQuote();
    fireEvent.click(confirm());
    await screen.findByText('Gagal mengajukan pencairan. Coba lagi.');
    fireEvent.change(amountInput(), { target: { value: '120000' } });
    await waitFor(() => expect(screen.getByText('Rp117.500')).toBeVisible(), { timeout: 2000 });
    fireEvent.click(confirm());
    await waitFor(() => expect(onRequested).toHaveBeenCalled());
    const [first, second] = vi.mocked(requestPayout).mock.calls;
    expect(first?.[1]).not.toBe(second?.[1]);
  });

  it.each([
    ['PAYOUT_FEE_CHANGED', 'Biaya transfer berubah. Periksa lagi sebelum mengajukan.'],
    ['PAYOUT_EXCEEDS_AVAILABLE', 'Jumlah melebihi saldo tersedia.'],
  ])(
    'on %s shows the error, refetches the quote and starts a new attempt',
    async (code, message) => {
      vi.mocked(requestPayout).mockRejectedValueOnce(new ApiError(code, message));
      renderSheet();
      await waitForQuote();
      fireEvent.click(confirm());
      expect(await screen.findByText(message)).toBeVisible();
      expect(onStale).toHaveBeenCalled();
      expect(onRequested).not.toHaveBeenCalled();
      await waitFor(() => expect(vi.mocked(quotePayout).mock.calls.length).toBeGreaterThan(1), {
        timeout: 2000,
      });
      await waitForQuote();
      fireEvent.click(confirm());
      await waitFor(() => expect(onRequested).toHaveBeenCalled());
      const [first, second] = vi.mocked(requestPayout).mock.calls;
      expect(first?.[1]).not.toBe(second?.[1]);
    },
  );
});
