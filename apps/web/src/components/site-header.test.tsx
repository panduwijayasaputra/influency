import { render, screen } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { UserMenu } from './site-header';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const as = (roles: MeResponse['roles']) =>
  vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', displayName: 'Ana', roles });

describe('UserMenu', () => {
  it('shows "Masuk" when logged out', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await UserMenu());
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: /Saldo/ })).toBeNull();
  });

  it('falls back to "Masuk" when the API is down', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('GET /auth/me failed: 503'));
    render(await UserMenu());
    expect(screen.getByRole('link', { name: 'Masuk' })).toBeInTheDocument();
  });

  it('shows the Koin balance and the account menu button when logged in', async () => {
    as(['USER']);
    render(await UserMenu());
    expect(screen.getByRole('link', { name: /^Saldo: \d+ Koin$/ })).toHaveAttribute(
      'href',
      '/wallet',
    );
    // Menu items by role: account-menu.test.tsx.
    expect(screen.getByRole('button', { name: 'Menu akun' })).toHaveTextContent('A');
    expect(screen.queryByRole('link', { name: 'Masuk' })).toBeNull();
  });
});
