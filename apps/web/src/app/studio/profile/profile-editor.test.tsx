import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { ProfileEditor } from './profile-editor';

vi.mock('@/lib/api/creator-profile', () => ({ getMyCreatorProfile: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const profile = {
  slug: 'ana',
  displayName: 'Ana Kreator',
  bio: 'Halo semua',
  category: 'Musik',
  avatarUrl: '/api/v1/creators/ana/images/0190a000-0000-7000-8000-000000000001',
  bannerUrl: null,
};

describe('ProfileEditor', () => {
  it('shows the read-only address, images and prefilled fields', async () => {
    vi.mocked(getMyCreatorProfile).mockResolvedValue(profile);
    render(await ProfileEditor());

    expect(screen.getByText('influency.com/ana')).toBeInTheDocument();
    expect(screen.getByText('Alamat halaman belum dapat diubah.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto profil' })).toHaveAttribute(
      'src',
      profile.avatarUrl,
    );
    expect(screen.queryByRole('img', { name: 'Banner' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Nama tampilan')).toHaveValue('Ana Kreator');
    expect(screen.getByLabelText('Bio (opsional)')).toHaveValue('Halo semua');
    expect(screen.getByLabelText('Kategori (opsional)')).toHaveValue('Musik');
  });

  it('shows a notice when the profile is unavailable', async () => {
    vi.mocked(getMyCreatorProfile).mockResolvedValue(null);
    render(await ProfileEditor());
    expect(screen.getByText('Profil kreator tidak ditemukan.')).toBeInTheDocument();
  });
});
