import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MeResponse, RecommendedCreator } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { completeOnboarding, saveMyProfile } from '@/lib/api/onboarding';
import { fetchRecommendedCreators } from '@/lib/api/recommended-creators';
import { UserPath } from './user-path';

vi.mock('@/lib/api/onboarding', () => ({ saveMyProfile: vi.fn(), completeOnboarding: vi.fn() }));
vi.mock('@/lib/api/recommended-creators', () => ({ fetchRecommendedCreators: vi.fn() }));
vi.mock('@/lib/api/creator-follow', () => ({ setFollow: vi.fn() }));

const creator = (slug: string): RecommendedCreator => ({
  slug,
  displayName: `Creator ${slug}`,
  avatarUrl: null,
  bannerUrl: null,
  followerCount: 3,
});
const user: { displayName: string; username: string | null; bio: string | null } = {
  displayName: 'Bima Santoso',
  username: 'bima',
  bio: 'Hai',
};
const onExit = vi.fn();
const setup = (over: Partial<typeof user> = {}) =>
  render(<UserPath user={{ ...user, ...over }} returnTo="/ana" onExit={onExit} />, {
    wrapper: Toaster,
  });
const next = () => fireEvent.click(screen.getByRole('button', { name: /Lanjut|Selesai/ }));

beforeEach(() => {
  vi.mocked(saveMyProfile)
    .mockReset()
    .mockResolvedValue({} as MeResponse);
  vi.mocked(completeOnboarding).mockReset().mockResolvedValue();
  vi.mocked(fetchRecommendedCreators)
    .mockReset()
    .mockResolvedValue([creator('ana'), creator('budi')]);
  vi.mocked(setFollow).mockReset();
  onExit.mockClear();
});

async function toFollowStep() {
  next();
  await screen.findByRole('heading', { name: 'Ikuti beberapa creator' });
}

describe('UserPath Profil step', () => {
  it('prefills, shows the username read-only, and hides it when absent', () => {
    setup();
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('Bima Santoso');
    expect(screen.getByLabelText('Bio (opsional)')).toHaveValue('Hai');
    expect(screen.getByText('@bima')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('bima')).toBeNull();
  });

  it('hides the username row when there is none', () => {
    setup({ username: null });
    expect(screen.queryByText('Username Telegram')).toBeNull();
  });

  it('blocks Lanjut on an empty name', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Nama tampilan'), { target: { value: '  ' } });
    next();
    expect(screen.getByText('Masukkan nama tampilan.')).toBeInTheDocument();
    expect(saveMyProfile).not.toHaveBeenCalled();
  });

  it('keeps the input and shows an alert when saving fails, then moves on after a success', async () => {
    vi.mocked(saveMyProfile).mockRejectedValueOnce(new Error('x'));
    setup();
    fireEvent.change(screen.getByLabelText('Nama tampilan'), { target: { value: 'Bima S' } });
    next();
    expect(await screen.findByText('Gagal menyimpan profil. Coba lagi.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('Bima S');
    next();
    await screen.findByRole('heading', { name: 'Ikuti beberapa creator' });
    expect(saveMyProfile).toHaveBeenLastCalledWith({ displayName: 'Bima S', bio: 'Hai' });
  });

  it('Back on the first step leaves the path', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Kembali' }));
    expect(onExit).toHaveBeenCalled();
  });
});

describe('UserPath Ikuti step', () => {
  it('lists suggestions and counts only successful follows', async () => {
    vi.mocked(setFollow).mockImplementation((slug) =>
      Promise.resolve(slug === 'ana' ? { following: true, followerCount: 4 } : null),
    );
    setup();
    await toFollowStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Ikuti Creator ana' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Diikuti Creator ana' })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti Creator budi' }));
    await screen.findByText('Gagal memperbarui. Coba lagi.');
    next();
    expect(await screen.findByText(/Kamu mengikuti 1 creator/)).toBeInTheDocument();
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Mulai menjelajah' })).toHaveAttribute('href', '/ana');
  });

  it('shows an empty message and an error with retry', async () => {
    vi.mocked(fetchRecommendedCreators).mockResolvedValueOnce([]);
    setup();
    await toFollowStep();
    expect(await screen.findByText(/Belum ada saran creator/)).toBeInTheDocument();
  });

  it('retries a failed suggestion load', async () => {
    vi.mocked(fetchRecommendedCreators).mockRejectedValueOnce(new Error('x'));
    setup();
    await toFollowStep();
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByText('@ana')).toBeInTheDocument();
  });

  it('Lewati completes onboarding with the generic message', async () => {
    setup();
    await toFollowStep();
    fireEvent.click(screen.getByRole('button', { name: 'Lewati' }));
    expect(await screen.findByText(/Beranda kamu sudah siap/)).toBeInTheDocument();
    expect(completeOnboarding).toHaveBeenCalledTimes(1);
  });

  it('stays on the step with a toast when completing fails', async () => {
    vi.mocked(completeOnboarding).mockRejectedValueOnce(new Error('x'));
    setup();
    await toFollowStep();
    next();
    expect(await screen.findByText('Gagal menyelesaikan. Coba lagi.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ikuti beberapa creator' })).toBeInTheDocument();
  });

  it('has no Koin or purchase action', async () => {
    setup();
    await toFollowStep();
    expect(screen.queryByText(/Koin|Buka|Berlangganan$/)).toBeNull();
  });
});
