import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse, NotificationPreferences } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import {
  connectTelegram,
  fetchNotificationPreferences,
  updateNotificationPreferences,
} from '@/lib/api/notification-preferences';
import { readAutoplayEnabled } from '@/lib/autoplay-preference';
import { SettingsView } from './settings-view';

const logout = vi.fn();
vi.mock('@/components/use-logout', () => ({
  useLogout: () => ({ logout, pending: false, failed: false }),
}));
vi.mock('@/lib/api/notification-preferences', () => ({
  connectTelegram: vi.fn(),
  fetchNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

const PREFS: NotificationPreferences = {
  newPost: true,
  commentReply: true,
  commentLike: false,
  subscriptionReminder: true,
  earnings: true,
  telegram: { status: 'unavailable', allowed: false },
};
const USER: MeResponse = {
  id: 'u1',
  displayName: 'Ana',
  username: 'ana',
  roles: ['USER'],
  bio: null,
  creatorSlug: null,
  onboardingCompleted: true,
};
const CREATOR: MeResponse = { ...USER, roles: ['USER', 'CREATOR'], creatorSlug: 'ana' };

beforeEach(() => {
  localStorage.clear();
  logout.mockReset();
  vi.mocked(fetchNotificationPreferences).mockReset().mockResolvedValue(PREFS);
  vi.mocked(updateNotificationPreferences).mockReset();
});

const renderView = (user: MeResponse = USER) =>
  render(<SettingsView user={user} version="1.2.3" />, { wrapper: Toaster });

describe('SettingsView', () => {
  it('shows a plain user the user rows only', async () => {
    renderView();
    expect(screen.getByRole('link', { name: /Edit Profil/ })).toHaveAttribute('href', '/me');
    expect(screen.getByText('@ana · Terhubung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Rekening Pencairan' })).toBeNull();
    await screen.findByRole('switch', { name: 'Postingan baru' });
    expect(screen.queryByRole('switch', { name: 'Aktivitas penghasilan' })).toBeNull();
    expect(screen.getByText('Influency · versi 1.2.3')).toBeInTheDocument();
  });

  it('shows an approved creator the studio rows and the earnings toggle', async () => {
    renderView(CREATOR);
    expect(screen.getByRole('link', { name: /Edit Profil/ })).toHaveAttribute(
      'href',
      '/studio/profile',
    );
    expect(screen.getByRole('link', { name: 'Rekening Pencairan' })).toHaveAttribute(
      'href',
      '/studio/payout-accounts',
    );
    expect(await screen.findByRole('switch', { name: 'Aktivitas penghasilan' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('starts with the default toggles and Telegram not yet available', async () => {
    renderView();
    expect(await screen.findByRole('switch', { name: 'Suka pada komentarmu' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByRole('switch', { name: 'Balasan komentar' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Segera hadir')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hubungkan' })).toBeDisabled();
  });

  it('saves a toggle', async () => {
    vi.mocked(updateNotificationPreferences).mockResolvedValue({ ...PREFS, commentLike: true });
    renderView();
    fireEvent.click(await screen.findByRole('switch', { name: 'Suka pada komentarmu' }));
    expect(updateNotificationPreferences).toHaveBeenCalledWith({ commentLike: true });
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Suka pada komentarmu' })).toHaveAttribute(
        'aria-checked',
        'true',
      ),
    );
  });

  it('rolls a toggle back with a toast when saving fails', async () => {
    vi.mocked(updateNotificationPreferences).mockRejectedValue(new Error('down'));
    renderView();
    const toggle = await screen.findByRole('switch', { name: 'Postingan baru' });
    fireEvent.click(toggle);
    expect(await screen.findByText('Gagal menyimpan pengaturan.')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Postingan baru' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('saves the autoplay choice on this device', () => {
    renderView();
    const toggle = screen.getByRole('switch', { name: 'Putar video otomatis' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(toggle);
    expect(readAutoplayEnabled()).toBe(false);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('opens placeholders, legal pages and logs out', async () => {
    renderView();
    fireEvent.click(screen.getByRole('button', { name: 'Akun diblokir' }));
    expect(await screen.findByRole('dialog', { name: 'Akun diblokir' })).toHaveTextContent(
      'Perlu konfirmasi',
    );
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Syarat Layanan' }));
    expect(await screen.findByRole('dialog', { name: 'Syarat' })).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Keluar' }));
    expect(logout).toHaveBeenCalled();
  });

  it.each([
    [USER, 'Nasib Koin yang belum terpakai'],
    [CREATOR, 'Penghasilan tertunda'],
  ])('shows the delete-account rules without deleting anything', async (user, text) => {
    renderView(user);
    fireEvent.click(screen.getByRole('button', { name: 'Hapus akun' }));
    const dialog = await screen.findByRole('dialog', { name: 'Hapus akun?' });
    expect(dialog).toHaveTextContent(text);
    expect(dialog).toHaveTextContent('Perlu konfirmasi');
    expect(within(dialog).queryByRole('button', { name: /^Hapus/ })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Batal' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(updateNotificationPreferences).not.toHaveBeenCalled();
  });

  describe('Pesan Telegram', () => {
    const notConnected = {
      ...PREFS,
      telegram: { status: 'not_connected' as const, allowed: false },
    };

    it('fetches a one-time link and offers it to open', async () => {
      vi.mocked(fetchNotificationPreferences).mockResolvedValue(notConnected);
      vi.mocked(connectTelegram).mockResolvedValue({
        url: 'https://t.me/InfluencyBot?start=abc',
        expiresAt: '2026-11-09T10:00:00.000Z',
      });
      renderView();
      fireEvent.click(await screen.findByRole('button', { name: 'Hubungkan' }));
      const open = await screen.findByRole('link', { name: 'Buka Telegram' });
      expect(open).toHaveAttribute('href', 'https://t.me/InfluencyBot?start=abc');
      expect(open).toHaveAttribute('target', '_blank');
      expect(screen.getByText(/Tekan Start di Telegram/)).toBeInTheDocument();
    });

    it('shows a toast when the link cannot be made', async () => {
      vi.mocked(fetchNotificationPreferences).mockResolvedValue(notConnected);
      vi.mocked(connectTelegram).mockRejectedValue(new Error('409'));
      renderView();
      fireEvent.click(await screen.findByRole('button', { name: 'Hubungkan' }));
      expect(
        await screen.findByText('Telegram belum bisa dihubungkan. Coba lagi nanti.'),
      ).toBeInTheDocument();
    });

    it('refreshes when the user comes back from Telegram, then shows the switch', async () => {
      vi.mocked(fetchNotificationPreferences)
        .mockResolvedValueOnce(notConnected)
        .mockResolvedValue({ ...PREFS, telegram: { status: 'connected', allowed: true } });
      renderView();
      await screen.findByRole('button', { name: 'Hubungkan' });
      document.dispatchEvent(new Event('visibilitychange'));
      expect(await screen.findByRole('switch', { name: 'Pesan Telegram' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });
  });
});
