import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import pkg from '../../../../../package.json';
import { Settings } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/components/settings/settings-view', () => ({
  SettingsView: ({ version }: { version: string }) => <p>view {version}</p>,
}));
vi.mock('@/components/page-header', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

describe('Pengaturan page', () => {
  it('shows the settings with the app version to a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
    render(await Settings());
    expect(screen.getByRole('heading', { name: 'Pengaturan' })).toBeInTheDocument();
    expect(screen.getByText(`view ${pkg.version}`)).toBeInTheDocument();
  });

  it('sends a logged-out visitor to login and back', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    await expect(Settings()).rejects.toThrow('redirect:/login?returnTo=%2Faccount%2Fsettings');
  });
});
