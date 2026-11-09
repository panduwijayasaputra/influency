import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { Me } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/profile/profile-summary', () => ({
  ProfileSummary: ({ user }: { user: { displayName: string } }) => (
    <p>profile {user.displayName}</p>
  ),
}));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const user = {
  id: 'u1',
  displayName: 'Ana',
  username: 'ana',
  roles: ['USER' as const],
  bio: null,
  creatorSlug: null,
  onboardingCompleted: true,
};

describe('Profil page', () => {
  it('shows the profile of a normal user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    render(await Me());
    expect(screen.getByText('profile Ana')).toBeInTheDocument();
  });

  it('sends an approved creator to their own creator page', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      ...user,
      roles: ['USER', 'CREATOR'],
      creatorSlug: 'ana-studio',
      onboardingCompleted: true,
    });
    await expect(Me()).rejects.toThrow('redirect:/ana-studio');
  });

  it('sends a logged-out visitor to login and back', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(Me()).rejects.toThrow('redirect:/login?returnTo=%2Fme');
  });
});
