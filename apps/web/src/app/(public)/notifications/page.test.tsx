import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { Notifications } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/notifications/notification-list', () => ({
  NotificationList: () => <p>list</p>,
}));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

describe('Notifikasi page', () => {
  it('shows the title and the list to a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
    render(await Notifications());
    expect(screen.getByRole('heading', { name: 'Notifikasi' })).toBeInTheDocument();
    expect(screen.getByText('list')).toBeInTheDocument();
  });

  it('sends a logged-out visitor to login and back', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(Notifications()).rejects.toThrow('redirect:/login?returnTo=%2Fnotifications');
  });
});
