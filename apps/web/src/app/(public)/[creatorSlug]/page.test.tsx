import { render, screen } from '@testing-library/react';
import type { CreatorProfileResponse } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPublicCreator } from '@/lib/api/public-creator';
import CreatorPage, { generateMetadata, LoginCta } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/public-creator', () => ({ getPublicCreator: vi.fn() }));
vi.mock('@/lib/api/public-posts', () => ({ getPublicPosts: vi.fn(() => new Promise(() => {})) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
}));

const CREATOR: CreatorProfileResponse = {
  slug: 'claudiandreya',
  displayName: 'Claudia Andreya',
  bio: 'Halo!\nSelamat datang.',
  category: 'Lifestyle',
  avatarUrl: '/api/v1/creators/claudiandreya/images/0190a000-0000-7000-8000-000000000001',
  bannerUrl: '/api/v1/creators/claudiandreya/images/0190a000-0000-7000-8000-000000000002',
};
const props = (creatorSlug = 'claudiandreya') => ({ params: Promise.resolve({ creatorSlug }) });

describe('CreatorPage', () => {
  beforeEach(() => {
    vi.mocked(getPublicCreator).mockResolvedValue(CREATOR);
    // Keeps the Suspense'd login button on its (empty) fallback.
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => {}));
  });

  it('shows the profile, images, the streaming feed, the subscription card and the tab bar', async () => {
    const { container } = render(await CreatorPage(props()), { wrapper: Toaster });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Claudia Andreya');
    expect(screen.getByText('influency.com/claudiandreya')).toBeInTheDocument();
    expect(screen.getByText('Lifestyle')).toBeInTheDocument();
    expect(screen.getByText(/Selamat datang\./)).toBeInTheDocument();
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      CREATOR.bannerUrl,
      CREATOR.avatarUrl,
    ]);
    // The uncached feed streams in behind its fallback (CreatorPosts has its own tests).
    expect(screen.getByRole('region', { name: 'Konten' })).toHaveTextContent('Memuat konten…');
    expect(screen.getByRole('region', { name: 'Langganan Claudia Andreya' })).toHaveTextContent(
      /Langganan · \d+ Koin \/ \d+ hari/,
    );
    expect(screen.getByRole('button', { name: 'Bagikan halaman' })).toBeInTheDocument();
    const tabs = screen.getByRole('navigation', { name: 'Navigasi utama' }).querySelectorAll('a');
    expect([...tabs].map((a) => a.getAttribute('href'))).toEqual([
      '/discover',
      '/library',
      '/subscriptions',
      '/wallet',
    ]);
  });

  it('falls back to initials and a gradient without images, and hides empty fields', async () => {
    vi.mocked(getPublicCreator).mockResolvedValue({
      ...CREATOR,
      bio: null,
      category: null,
      avatarUrl: null,
      bannerUrl: null,
    });
    const { container } = render(await CreatorPage(props()), { wrapper: Toaster });
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.queryByText('Lifestyle')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('null');
  });

  it('is not found when the API has no public creator', async () => {
    vi.mocked(getPublicCreator).mockResolvedValue(null);
    await expect(CreatorPage(props('nobody'))).rejects.toThrow('notFound');
    await expect(generateMetadata(props('nobody'))).rejects.toThrow('notFound');
    expect(getPublicCreator).toHaveBeenCalledWith('nobody');
  });

  it('uses the name and bio for metadata', async () => {
    expect(await generateMetadata(props())).toEqual({
      title: 'Claudia Andreya',
      description: 'Halo!\nSelamat datang.',
    });
    vi.mocked(getPublicCreator).mockResolvedValue({ ...CREATOR, bio: null });
    expect((await generateMetadata(props())).description).toBe('Claudia Andreya di Influency');
  });
});

describe('LoginCta', () => {
  it('links logged-out visitors to login, returning to the creator page', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await LoginCta({ slug: 'claudiandreya' }));
    expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fclaudiandreya',
    );
  });

  it('renders nothing when logged in, and treats an API outage as logged out', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', displayName: 'Ana', roles: ['USER'] });
    expect(await LoginCta({ slug: 'claudiandreya' })).toBeNull();
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('down'));
    expect(await LoginCta({ slug: 'claudiandreya' })).not.toBeNull();
  });
});
