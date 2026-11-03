import { render, screen } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { AdminGate } from './admin-gate';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const as = (roles: MeResponse['roles'] | null) =>
  vi.mocked(getCurrentUser).mockResolvedValue(roles && { id: 'u1', displayName: 'Ana', roles });

describe('AdminGate', () => {
  it('redirects logged-out visitors to login, returning to /admin', async () => {
    as(null);
    await expect(AdminGate({ children: 'secret' })).rejects.toThrow(
      'redirect:/login?returnTo=%2Fadmin',
    );
  });

  it('denies a non-admin', async () => {
    as(['USER', 'CREATOR']);
    render(await AdminGate({ children: 'secret' }));
    expect(screen.getByText('Anda tidak memiliki akses.')).toBeInTheDocument();
    expect(screen.queryByText('secret')).not.toBeInTheDocument();
  });

  it('renders children for an admin', async () => {
    as(['USER', 'ADMIN']);
    render(await AdminGate({ children: 'secret' }));
    expect(screen.getByText('secret')).toBeInTheDocument();
  });
});
