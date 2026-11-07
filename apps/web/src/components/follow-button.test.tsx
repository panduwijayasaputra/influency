import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { FollowButton } from './follow-button';

vi.mock('@/lib/api/creator-follow', () => ({ setFollow: vi.fn() }));

describe('FollowButton', () => {
  beforeEach(() => vi.mocked(setFollow).mockReset());

  it('follows optimistically, disables while pending, then takes the server state', async () => {
    let resolve!: (v: { following: boolean; followerCount: number }) => void;
    vi.mocked(setFollow).mockReturnValue(new Promise((r) => (resolve = r)));
    const onChange = vi.fn();
    render(<FollowButton slug="ana" onChange={onChange} />, { wrapper: Toaster });
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti' }));
    const pressed = screen.getByRole('button', { name: 'Diikuti' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(pressed).toBeDisabled();
    expect(setFollow).toHaveBeenCalledWith('ana', true);
    resolve({ following: true, followerCount: 5 });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Diikuti' })).toBeEnabled());
    expect(onChange).toHaveBeenCalledWith({ following: true, followerCount: 5 });
    expect(screen.queryByText(/Berhenti mengikuti/)).toBeNull();
  });

  it('rolls back with an error toast when the request fails', async () => {
    vi.mocked(setFollow).mockResolvedValue(null);
    render(<FollowButton slug="ana" />, { wrapper: Toaster });
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti' }));
    expect(await screen.findByText('Gagal memperbarui. Coba lagi.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ikuti' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('says a subscription is unaffected when unfollowing', async () => {
    vi.mocked(setFollow).mockResolvedValue({ following: false, followerCount: 0 });
    render(<FollowButton slug="ana" initialFollowing />, { wrapper: Toaster });
    fireEvent.click(screen.getByRole('button', { name: 'Diikuti' }));
    expect(
      await screen.findByText('Berhenti mengikuti. Langganan tidak terpengaruh.'),
    ).toBeInTheDocument();
    expect(setFollow).toHaveBeenCalledWith('ana', false);
  });

  it('names the creator when given one', () => {
    render(<FollowButton slug="ana" creatorName="Ana" initialFollowing />, { wrapper: Toaster });
    expect(screen.getByRole('button', { name: 'Diikuti Ana' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});
