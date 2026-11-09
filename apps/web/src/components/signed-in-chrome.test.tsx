import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getCurrentUser } from '@/lib/api/current-user';
import { IfSignedIn } from './if-signed-in';
import { SignedInChrome } from './signed-in-chrome';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('next/navigation', () => ({ usePathname: () => '/discover' }));

const USER = {
  id: 'u1',
  displayName: 'Ana',
  username: null,
  roles: ['USER' as const],
  bio: null,
  creatorSlug: null,
  onboardingCompleted: true,
};
const states = [
  ['a guest', () => vi.mocked(getCurrentUser).mockResolvedValue(null)],
  ['an API outage', () => vi.mocked(getCurrentUser).mockRejectedValue(new Error('503'))],
] as const;

describe('SignedInChrome', () => {
  it('shows the bottom nav to a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(USER);
    render(await SignedInChrome());
    expect(screen.getByRole('navigation', { name: 'Navigasi utama' })).toBeInTheDocument();
  });

  it.each(states)('shows nothing to %s', async (_label, arrange) => {
    arrange();
    expect(await SignedInChrome()).toBeNull();
  });
});

describe('IfSignedIn', () => {
  it('renders its children for a signed-in user', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(USER);
    render(<>{await IfSignedIn({ children: <p>Header</p> })}</>);
    expect(screen.getByText('Header')).toBeInTheDocument();
  });

  it.each(states)('renders nothing for %s', async (_label, arrange) => {
    arrange();
    expect(await IfSignedIn({ children: <p>Header</p> })).toBeNull();
  });
});
