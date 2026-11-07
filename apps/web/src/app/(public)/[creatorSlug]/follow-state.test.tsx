import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { setFollow } from '@/lib/api/creator-follow';
import { FollowerCount, FollowProvider, ProfileFollowButton } from './follow-state';

vi.mock('@/lib/api/creator-follow', () => ({ setFollow: vi.fn() }));

describe('FollowProvider', () => {
  it('shows a compact Indonesian count with the full number for screen readers', () => {
    render(
      <FollowProvider initial={{ following: false, followerCount: 1200 }}>
        <FollowerCount />
      </FollowProvider>,
    );
    const count = screen.getByLabelText(/pengikut/);
    expect(count).toHaveTextContent('1,2 rb pengikut');
    expect(count.getAttribute('aria-label')).toMatch(/^1\.200 pengikut$/);
  });

  it('shows no count when the state is unknown', () => {
    const { container } = render(
      <FollowProvider initial={null}>
        <FollowerCount />
      </FollowProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('updates the count after the button toggles', async () => {
    vi.mocked(setFollow).mockResolvedValue({ following: true, followerCount: 1201 });
    render(
      <FollowProvider initial={{ following: false, followerCount: 1200 }}>
        <FollowerCount />
        <ProfileFollowButton slug="ana" />
      </FollowProvider>,
      { wrapper: Toaster },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti' }));
    expect(await screen.findByLabelText('1.201 pengikut')).toHaveTextContent('1,2 rb pengikut');
  });
});
