import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { ProfileActions } from './profile-actions';

vi.mock('@/lib/api/creator-follow', () => ({ setFollow: vi.fn() }));

const renderActions = (props: Partial<Parameters<typeof ProfileActions>[0]> = {}) =>
  render(<ProfileActions slug="ana" creatorName="Ana" {...props} />, { wrapper: Toaster });

describe('ProfileActions', () => {
  it('calls the follow API from Ikuti and says Langganan is unaffected on unfollow', async () => {
    vi.mocked(setFollow).mockResolvedValue({ following: true, followerCount: 1 });
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti' }));
    expect(setFollow).toHaveBeenCalledWith('ana', true);
    vi.mocked(setFollow).mockResolvedValue({ following: false, followerCount: 0 });
    fireEvent.click(await screen.findByRole('button', { name: 'Diikuti' }));
    expect(setFollow).toHaveBeenLastCalledWith('ana', false);
    expect(await screen.findByText(/Langganan tidak terpengaruh/)).toBeInTheDocument();
  });

  it('opens the demo subscription sheet from Langganan', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: /Langganan · \d+ Koin/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('30 hari');
  });

  it('shows Berlangganan with the days left instead of Langganan', () => {
    renderActions({ subscribedDaysLeft: 12 });
    expect(screen.getByRole('button', { name: /Berlangganan/ })).toHaveTextContent(
      '12 hari lagi (demo)',
    );
    expect(screen.queryByRole('button', { name: /^Langganan/ })).toBeNull();
  });

  it('sends a guest to login from both actions', () => {
    renderActions({ loginHref: '/login?returnTo=%2Fana' });
    for (const name of ['Ikuti', 'Langganan']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', '/login?returnTo=%2Fana');
    }
  });
});
