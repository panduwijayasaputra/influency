import { render, screen } from '@testing-library/react';
import type { CreatorProfileResponse } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPublicCreator } from '@/lib/api/public-creator';
import CreatorPage, { CreatorView, generateMetadata } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/public-creator', () => ({ getPublicCreator: vi.fn() }));
vi.mock('@/lib/api/public-posts', () => ({ getPublicPosts: vi.fn(() => new Promise(() => {})) }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  useRouter: () => ({ back: vi.fn() }),
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
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
    });
  });

  // The page streams the viewer-dependent view; render it for a signed-in viewer (guest view: CreatorView tests).
  const renderPage = async () =>
    render(await CreatorView({ creator: (await getPublicCreator('claudiandreya'))! }), {
      wrapper: Toaster,
    });

  it('shows the profile, images, the streaming feed, and the subscription card', async () => {
    const { container } = await renderPage();
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
    // Page header: the name as plain text (the h1 stays in the profile), no back on a direct visit.
    expect(screen.getByRole('banner')).toHaveTextContent('Claudia Andreya');
    expect(screen.queryByLabelText('Kembali')).toBeNull();
  });

  it('falls back to initials and a gradient without images, and hides empty fields', async () => {
    vi.mocked(getPublicCreator).mockResolvedValue({
      ...CREATOR,
      bio: null,
      category: null,
      avatarUrl: null,
      bannerUrl: null,
    });
    const { container } = await renderPage();
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('CA')).toBeInTheDocument();
    expect(screen.queryByText('Lifestyle')).not.toBeInTheDocument();
    expect(container).not.toHaveTextContent('null');
  });

  it('streams the view only after the session check', async () => {
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => {}));
    render(await CreatorPage(props()), { wrapper: Toaster });
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Masuk' })).toBeNull();
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

describe('CreatorView', () => {
  const view = async () => render(await CreatorView({ creator: CREATOR }), { wrapper: Toaster });
  const LOGIN = '/login?returnTo=%2Fclaudiandreya';

  it.each([
    ['a guest', () => vi.mocked(getCurrentUser).mockResolvedValue(null)],
    ['an API outage', () => vi.mocked(getCurrentUser).mockRejectedValue(new Error('down'))],
  ])(
    'shows %s the profile with no top bar and every action going to login',
    async (_l, arrange) => {
      arrange();
      await view();
      expect(screen.queryByRole('banner')).toBeNull();
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Claudia Andreya');
      expect(screen.getByRole('link', { name: 'Masuk' })).toHaveAttribute('href', LOGIN);
      expect(screen.getByRole('link', { name: 'Bagikan' })).toHaveAttribute('href', LOGIN);
      expect(screen.queryByRole('button', { name: 'Bagikan halaman' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Masuk untuk berlangganan' })).toHaveAttribute(
        'href',
        LOGIN,
      );
      expect(screen.getByRole('region', { name: 'Konten' })).toBeInTheDocument();
    },
  );

  it('gives a signed-in user the header, share and subscribe actions', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
    });
    await view();
    expect(screen.getByRole('banner')).toHaveTextContent('Claudia Andreya');
    expect(screen.queryByRole('link', { name: 'Masuk' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bagikan halaman' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Langganan · \d+ Koin/ })).toBeInTheDocument();
  });
});
