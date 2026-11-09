import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { getUnreadCount } from '@/lib/api/notifications.server';
import { Home } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/notifications.server', () => ({
  getUnreadCount: vi.fn(() => Promise.resolve(0)),
}));

const USER = {
  id: 'u1',
  displayName: 'Ana',
  username: 'ana',
  roles: ['USER' as const],
  bio: null,
  creatorSlug: null,
  onboardingCompleted: true,
};
vi.mock('@/components/home-feed/home-feed', () => ({
  HomeFeed: () => <p>feed</p>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

describe('Home', () => {
  it('shows the top bar, drawer and feed to a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
    render(await Home());

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Beranda');
    expect(screen.getByText('feed')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cari' })).toHaveAttribute(
      'href',
      '/discover?tab=cari',
    );
    expect(screen.getByRole('button', { name: 'Buka menu akun' })).toBeInTheDocument();
  });

  it.each([
    ['a guest', () => vi.mocked(getCurrentUser).mockResolvedValue(null)],
    ['an API outage', () => vi.mocked(getCurrentUser).mockRejectedValue(new Error('503'))],
  ])('sends %s to login', async (_label, arrange) => {
    arrange();
    await expect(Home()).rejects.toThrow('redirect:/login');
  });

  it.each([
    [3, 'Notifikasi, ada aktivitas baru', true],
    [0, 'Notifikasi', false],
  ])('shows the unread dot for %i unread', async (count, label, dot) => {
    vi.mocked(getCurrentUser).mockResolvedValue(USER);
    vi.mocked(getUnreadCount).mockResolvedValue(count);
    render(await Home());
    expect(screen.getByRole('link', { name: label })).toHaveAttribute('href', '/notifications');
    expect(screen.queryByTestId('unread-dot') !== null).toBe(dot);
  });
});
