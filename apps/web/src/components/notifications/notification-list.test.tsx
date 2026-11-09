import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationItem } from '@influency/shared';
import { fetchNotificationsPage, markNotificationsRead } from '@/lib/api/notifications';
import { NotificationList } from './notification-list';

vi.mock('@/lib/api/notifications', () => ({
  fetchNotificationsPage: vi.fn(),
  markNotificationsRead: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(fetchNotificationsPage).mockReset();
  vi.mocked(markNotificationsRead).mockReset().mockResolvedValue();
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

const n = (id: string, over: Partial<NotificationItem> = {}): NotificationItem => ({
  id: `0190a000-0000-7000-8000-00000000000${id}`,
  type: 'NEW_POST',
  actor: { displayName: 'Nadia Kirana', avatarUrl: null },
  text: 'memposting konten baru.',
  href: '/nadia',
  createdAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  read: false,
  ...over,
});

describe('NotificationList', () => {
  it('renders actor, text, time and link; marks unread rows', async () => {
    vi.mocked(fetchNotificationsPage).mockResolvedValue({
      items: [
        n('1'),
        n('2', {
          actor: null,
          type: 'TOPUP_CREDITED',
          text: 'Top-up berhasil: 50 Koin masuk ke Dompet.',
          href: '/wallet',
          read: true,
        }),
      ],
      nextCursor: null,
    });
    render(<NotificationList />);
    const unread = await screen.findByRole('link', {
      name: /Belum dibaca:\s*Nadia Kirana\s*memposting/,
    });
    expect(unread).toHaveAttribute('href', '/nadia');
    expect(unread).toHaveTextContent('2 jam yang lalu');
    expect(unread.className).toContain('bg-accent');
    const read = screen.getByRole('link', { name: /Top-up berhasil/ });
    expect(read).toHaveAttribute('href', '/wallet');
    expect(read).not.toHaveTextContent('Belum dibaca');
    expect(screen.getByText('Perlu konfirmasi')).toBeInTheDocument();
  });

  it('marks everything read once, up to the newest item', async () => {
    vi.mocked(fetchNotificationsPage).mockResolvedValue({
      items: [n('1'), n('2')],
      nextCursor: null,
    });
    render(<NotificationList />);
    await screen.findAllByRole('link');
    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledTimes(1));
    expect(markNotificationsRead).toHaveBeenCalledWith(n('1').id);
  });

  it('shows the empty state and marks nothing', async () => {
    vi.mocked(fetchNotificationsPage).mockResolvedValue({ items: [], nextCursor: null });
    render(<NotificationList />);
    expect(await screen.findByText('Belum ada notifikasi.')).toBeInTheDocument();
    expect(markNotificationsRead).not.toHaveBeenCalled();
  });

  it('retries after an error', async () => {
    vi.mocked(fetchNotificationsPage)
      .mockRejectedValueOnce(new Error('down'))
      .mockResolvedValue({ items: [n('1')], nextCursor: null });
    render(<NotificationList />);
    fireEvent.click(await screen.findByRole('button', { name: 'Coba lagi' }));
    expect(await screen.findByRole('link', { name: /Nadia Kirana/ })).toBeInTheDocument();
  });
});
