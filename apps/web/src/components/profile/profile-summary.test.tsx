import { fireEvent, render, screen } from '@testing-library/react';
import type { MeResponse } from '@influency/shared';
import { describe, expect, it } from 'vitest';
import { ProfileSummary } from './profile-summary';

const USER: MeResponse = {
  id: 'u1',
  displayName: 'Ana Putri',
  username: 'ana',
  roles: ['USER'],
  bio: 'Suka foto jalan-jalan.',
  creatorSlug: null,
  onboardingCompleted: true,
};

describe('ProfileSummary', () => {
  it('shows initials, name, handle and bio', () => {
    render(<ProfileSummary user={USER} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Ana Putri' })).toBeInTheDocument();
    expect(screen.getByText('@ana')).toBeInTheDocument();
    expect(screen.getByText('Suka foto jalan-jalan.')).toBeInTheDocument();
    expect(screen.getByText('AP')).toBeInTheDocument();
  });

  it('hides the handle and bio when absent, and falls back to one initial', () => {
    render(<ProfileSummary user={{ ...USER, displayName: 'Ana', username: null, bio: null }} />);
    expect(screen.queryByText(/^@/)).toBeNull();
    expect(screen.queryByText('Suka foto jalan-jalan.')).toBeNull();
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('opens an Edit Profil notice marked "Perlu konfirmasi"', () => {
    render(<ProfileSummary user={USER} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Profil' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit Profil' });
    expect(dialog).toHaveTextContent('Perlu konfirmasi');
    expect(dialog).toHaveTextContent('belum diputuskan');
  });

  it('shows only the placeholder below the header: no activity, badges or purchases', () => {
    render(<ProfileSummary user={USER} />);
    expect(
      screen.getByRole('heading', { name: 'Isi di bawah header belum diputuskan' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/koleksi|dibeli|lencana saya/i)).toBeNull();
  });
});
