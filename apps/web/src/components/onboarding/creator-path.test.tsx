import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { CreatorApplicationResponse } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitCreatorApplication } from '@/lib/api/creator-apply';
import { CreatorPath } from './creator-path';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/api/creator-apply', () => ({ submitCreatorApplication: vi.fn() }));

const rejected: CreatorApplicationResponse = {
  status: 'REJECTED',
  displayName: 'Ana Kreator',
  slug: 'ana',
  bio: 'Hai',
  category: null,
  subscriptionPriceCoins: 120,
  submittedAt: '2026-11-03T00:00:00.000Z',
  rejectionReason: 'x',
};
const setup = (initial?: CreatorApplicationResponse) =>
  render(<CreatorPath initial={initial} backHref="/welcome" />);
const label = (t: string) => screen.getByLabelText(t);
const lanjut = () => fireEvent.click(screen.getByRole('button', { name: 'Lanjut' }));
const fill = (name = 'Ana', slug = 'ana') => {
  fireEvent.change(label('Nama tampilan'), { target: { value: name } });
  fireEvent.change(label('Alamat halaman'), { target: { value: slug } });
};
function toStep(n: 1 | 2 | 3) {
  fill();
  lanjut();
  if (n > 1) lanjut();
  if (n > 2) lanjut();
}
const submit = () => {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
};

beforeEach(() => {
  push.mockClear();
  vi.mocked(submitCreatorApplication).mockReset().mockResolvedValue({ ok: true });
});

describe('Profil step', () => {
  it('validates, lowercases the address and previews it', () => {
    setup();
    lanjut();
    expect(screen.getByText('Nama tampilan wajib diisi.')).toBeInTheDocument();
    fireEvent.change(label('Alamat halaman'), { target: { value: 'Ana_X' } });
    expect(label('Alamat halaman')).toHaveValue('ana_x');
    expect(screen.getByText('influency.com/ana_x')).toBeInTheDocument();
  });

  it.each(['welcome', 'login'])('rejects the reserved address %s', (slug) => {
    setup();
    fill('Ana', slug);
    lanjut();
    expect(
      screen.getByText('Alamat ini dipakai oleh sistem. Pilih alamat lain.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Harga per 30 hari')).toBeNull();
  });

  it('prefills a rejected application and Back on step 1 goes to backHref', () => {
    setup(rejected);
    expect(label('Nama tampilan')).toHaveValue('Ana Kreator');
    expect(label('Alamat halaman')).toHaveValue('ana');
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(push).toHaveBeenCalledWith('/welcome');
  });
});

describe('Langganan step', () => {
  it('shows the Rupiah estimate with the creator share', () => {
    setup();
    toStep(1);
    expect(screen.getByText(/Rp50\.000 per 30 hari/)).toHaveTextContent('Rp42.500');
  });

  it.each(['9', '5001', ''])('blocks %j', (price) => {
    setup();
    toStep(1);
    fireEvent.change(label('Harga per 30 hari'), { target: { value: price } });
    lanjut();
    expect(screen.getByText('Masukkan angka 10–5.000 Koin.')).toBeInTheDocument();
    expect(screen.queryByText('Perlu konfirmasi')).toBeNull();
  });

  it.each(['10', '5000'])('accepts %s', (price) => {
    setup();
    toStep(1);
    fireEvent.change(label('Harga per 30 hari'), { target: { value: price } });
    lanjut();
    expect(screen.getByText('Perlu konfirmasi')).toBeInTheDocument();
  });

  it('keeps digits only and fills from a preset', () => {
    setup();
    toStep(1);
    fireEvent.change(label('Harga per 30 hari'), { target: { value: '1a2' } });
    expect(label('Harga per 30 hari')).toHaveValue('12');
    fireEvent.click(screen.getByRole('button', { name: '100 Koin' }));
    expect(label('Harga per 30 hari')).toHaveValue('100');
  });
});

describe('stored application price', () => {
  it('prefills the Langganan price from the application', () => {
    setup(rejected);
    lanjut();
    expect(label('Harga per 30 hari')).toHaveValue('120');
  });

  it('returns to Langganan when the server rejects the price', async () => {
    vi.mocked(submitCreatorApplication).mockResolvedValue({
      ok: false,
      field: 'subscriptionPriceCoins',
      message: 'Masukkan angka 10–5.000 Koin.',
    });
    setup();
    toStep(3);
    submit();
    expect(await screen.findByText('Masukkan angka 10–5.000 Koin.')).toBeInTheDocument();
    expect(label('Harga per 30 hari')).toBeInTheDocument();
  });
});

describe('Pencairan and Tinjau', () => {
  it('Pencairan collects nothing', () => {
    setup();
    toStep(2);
    expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByText(/Rekening pencairan ditambahkan nanti/)).toBeInTheDocument();
  });

  it('Ubah jumps back to the right step', () => {
    setup();
    toStep(3);
    fireEvent.click(screen.getByRole('button', { name: 'Ubah Langganan' }));
    expect(screen.getByText('Harga per 30 hari')).toBeInTheDocument();
  });

  it('will not submit until the agreement is ticked', () => {
    setup();
    toStep(3);
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
    expect(screen.getByText('Setujui Perjanjian Kreator untuk melanjutkan.')).toBeInTheDocument();
    expect(submitCreatorApplication).not.toHaveBeenCalled();
  });

  it('submits and shows the under-review screen', async () => {
    setup();
    toStep(3);
    submit();
    expect(await screen.findByText('Pengajuanmu sedang ditinjau')).toBeInTheDocument();
    expect(submitCreatorApplication).toHaveBeenCalledWith({
      displayName: 'Ana',
      slug: 'ana',
      bio: '',
      acceptAgreement: true,
      subscriptionPriceCoins: 50,
    });
    expect(screen.getByRole('link', { name: 'Ke beranda' })).toHaveAttribute('href', '/');
  });

  it('returns to Profil with the error when the address is taken', async () => {
    vi.mocked(submitCreatorApplication).mockResolvedValue({
      ok: false,
      field: 'slug',
      message: 'Alamat sudah dipakai.',
    });
    setup();
    toStep(3);
    submit();
    expect(await screen.findByText('Alamat sudah dipakai.')).toBeInTheDocument();
    expect(label('Alamat halaman')).toBeInTheDocument();
  });

  it('shows a generic failure on the review step', async () => {
    vi.mocked(submitCreatorApplication).mockResolvedValue({ ok: false, message: 'Gagal.' });
    setup();
    toStep(3);
    submit();
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Gagal.'));
  });
});
