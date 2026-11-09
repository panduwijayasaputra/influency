import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/errors';
import { sendTip } from '@/lib/api/purchases';
import { fetchWallet } from '@/lib/api/wallet';
import { parseTipAmount, TipSheet } from './tip-sheet';

vi.mock('@/lib/api/wallet', () => ({ fetchWallet: vi.fn() }));
vi.mock('@/lib/api/purchases', () => ({ sendTip: vi.fn() }));

const creator = { slug: 'ana', displayName: 'Ana Putri', avatarUrl: null };

beforeEach(() => {
  vi.mocked(fetchWallet).mockReset().mockResolvedValue({ balanceCoins: 200 });
  vi.mocked(sendTip).mockReset();
});

const open = async (postId?: string) => {
  render(
    <TipSheet
      creator={creator}
      postId={postId}
      returnPath="/ana"
      trigger={<button type="button">Tip</button>}
    />,
    { wrapper: Toaster },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Tip' }));
  await screen.findByText('200 Koin');
};
const send = () => screen.getByRole('button', { name: /^Kirim \d+ Koin$|^Coba lagi$/ });
const typeAmount = (v: string) =>
  fireEvent.change(screen.getByLabelText('Jumlah lain'), { target: { value: v } });

describe('parseTipAmount', () => {
  it.each([
    [10, '', 10],
    [10, '1', 1],
    [10, '1000', 1000],
    [10, '0', null],
    [10, '1001', null],
    [10, '2.5', null],
    [10, 'abc', null],
    [10, '-3', null],
  ])('preset %i + custom %j → %j', (preset, custom, expected) => {
    expect(parseTipAmount(preset, custom)).toBe(expected);
  });
});

describe('TipSheet', () => {
  it('shows the creator, the presets with 10 selected, the balance and the no-fee note', async () => {
    await open();
    const dialog = screen.getByRole('dialog', { name: 'Kirim Tip' });
    expect(dialog).toHaveTextContent('Ana Putri');
    expect(dialog).toHaveTextContent('@ana');
    expect(dialog).toHaveTextContent('Perlu konfirmasi');
    expect(dialog).toHaveTextContent('Influency tidak memotong biaya tip');
    for (const n of [5, 10, 25, 50, 100]) {
      expect(screen.getByRole('button', { name: String(n) })).toHaveAttribute(
        'aria-pressed',
        String(n === 10),
      );
    }
  });

  it.each(['0', '1001', '2.5', 'x'])('disables Kirim for the invalid amount %j', async (v) => {
    await open();
    typeAmount(v);
    expect(screen.getByRole('alert')).toHaveTextContent('Tip 1–1.000 Koin, bilangan bulat');
    expect(screen.getByRole('button', { name: 'Kirim Koin' })).toBeDisabled();
  });

  it('accepts 1 Koin', async () => {
    await open();
    typeAmount('1');
    expect(screen.getByRole('button', { name: 'Kirim 1 Koin' })).toBeEnabled();
  });

  it('accepts 1.000 Koin as valid, and asks to top up when the balance is lower', async () => {
    await open();
    typeAmount('1000');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('link', { name: 'Isi Koin · kurang 800 Koin' })).toBeVisible();
  });

  it('sends the chosen preset once on a double click, then closes with a toast', async () => {
    let resolve!: () => void;
    vi.mocked(sendTip).mockImplementation(
      () =>
        new Promise((r) => {
          resolve = () => r({ tipId: 't', amountCoins: 25, balanceCoins: 175 });
        }),
    );
    await open('p1');
    fireEvent.click(screen.getByRole('button', { name: '25' }));
    const btn = send();
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(sendTip).toHaveBeenCalledTimes(1);
    expect(sendTip).toHaveBeenCalledWith({ postId: 'p1' }, 25, expect.any(String));
    expect(btn).toBeDisabled();
    resolve();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText(/Tip 25 Koin terkirim ke Ana Putri/)).toBeInTheDocument();
  });

  it('a profile tip targets the creator slug', async () => {
    vi.mocked(sendTip).mockResolvedValue({ tipId: 't', amountCoins: 10, balanceCoins: 190 });
    await open();
    fireEvent.click(send());
    await waitFor(() =>
      expect(sendTip).toHaveBeenCalledWith({ creatorSlug: 'ana' }, 10, expect.any(String)),
    );
  });

  it('keeps the key on retry, and uses a new one when the amount changes', async () => {
    vi.mocked(sendTip).mockRejectedValue(new ApiError('REQUEST_IN_PROGRESS', 'm'));
    await open();
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toHaveTextContent('Permintaan sebelumnya');
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    await waitFor(() => expect(sendTip).toHaveBeenCalledTimes(2));
    const [, , k1] = vi.mocked(sendTip).mock.calls[0]!;
    expect(vi.mocked(sendTip).mock.calls[1]![2]).toBe(k1);
    fireEvent.click(screen.getByRole('button', { name: '50' }));
    fireEvent.click(send());
    await waitFor(() => expect(sendTip).toHaveBeenCalledTimes(3));
    expect(vi.mocked(sendTip).mock.calls[2]![2]).not.toBe(k1);
  });

  it('links to Dompet with the shortfall when the balance is too low', async () => {
    vi.mocked(fetchWallet).mockResolvedValue({ balanceCoins: 4 });
    render(
      <TipSheet creator={creator} returnPath="/ana" trigger={<button type="button">Tip</button>} />,
      { wrapper: Toaster },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tip' }));
    const link = await screen.findByRole('link', { name: 'Isi Koin · kurang 6 Koin' });
    expect(link).toHaveAttribute('href', '/wallet?returnTo=%2Fana');
  });

  it('shows the shortfall the server reports', async () => {
    vi.mocked(sendTip).mockRejectedValue(
      new ApiError('INSUFFICIENT_COINS', 'm', { required: 10, available: 7 }),
    );
    await open();
    fireEvent.click(send());
    expect(await screen.findByRole('link', { name: 'Isi Koin · kurang 3 Koin' })).toBeVisible();
  });

  it('shows the API message when the tip is not allowed', async () => {
    vi.mocked(sendTip).mockRejectedValue(new ApiError('TIP_NOT_ALLOWED', 'm'));
    await open();
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tip hanya untuk kreator yang kamu dukung.',
    );
  });
});
