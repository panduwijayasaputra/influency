import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { ProfileActions } from './profile-actions';

const renderActions = (props: Partial<Parameters<typeof ProfileActions>[0]> = {}) =>
  render(<ProfileActions creatorName="Ana" {...props} />, { wrapper: Toaster });

describe('ProfileActions', () => {
  it('toggles Ikuti locally with a Segera hadir toast', () => {
    renderActions();
    fireEvent.click(screen.getByRole('button', { name: 'Ikuti' }));
    expect(screen.getByRole('button', { name: 'Diikuti' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Segera hadir')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Diikuti' }));
    expect(screen.getByRole('button', { name: 'Ikuti' })).toHaveAttribute('aria-pressed', 'false');
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
