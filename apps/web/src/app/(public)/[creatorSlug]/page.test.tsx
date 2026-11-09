import { render, screen } from '@testing-library/react';
import type { CreatorProfileResponse } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getFollowState } from '@/lib/api/creator-follow.server';
import { getCreatorSubscription } from '@/lib/api/creator-subscription.server';
import { getCurrentUser } from '@/lib/api/current-user';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { getPublicCreator } from '@/lib/api/public-creator';
import CreatorPage, { CreatorView, generateMetadata } from './page';

vi.mock('@/lib/api/creator-follow.server', () => ({ getFollowState: vi.fn() }));
vi.mock('@/lib/api/creator-subscription.server', () => ({ getCreatorSubscription: vi.fn() }));
vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/creator-profile', () => ({ getMyCreatorProfile: vi.fn() }));
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
    localStorage.clear();
    vi.mocked(getPublicCreator).mockResolvedValue(CREATOR);
    vi.mocked(getFollowState).mockResolvedValue({ following: true, followerCount: 1200 });
    vi.mocked(getCreatorSubscription).mockResolvedValue({
      plan: { priceCoins: 300, durationDays: 30 },
      viewer: null,
    });
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
  });

  // The page streams the viewer-dependent view; render it for a signed-in viewer (guest view: CreatorView tests).
  const renderPage = async () =>
    render(await CreatorView({ creator: (await getPublicCreator('claudiandreya'))! }), {
      wrapper: Toaster,
    });

  it('shows the profile, images, the streaming feed, and the actions', async () => {
    const { container } = await renderPage();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Claudia Andreya');
    expect(screen.getByText('@claudiandreya')).toBeInTheDocument();
    expect(screen.getByText('Lifestyle')).toBeInTheDocument();
    expect(screen.getByText(/Selamat datang\./)).toBeInTheDocument();
    expect([...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))).toEqual([
      CREATOR.bannerUrl,
      CREATOR.avatarUrl,
    ]);
    // The uncached feed streams in behind its fallback (CreatorPosts has its own tests).
    expect(screen.getByText('Memuat konten…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diikuti' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('@claudiandreya').parentElement?.parentElement).toHaveTextContent(
      '1,2 rb pengikut',
    );
    expect(screen.getByRole('button', { name: /Langganan · \d+ Koin/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bagikan profil' })).toBeInTheDocument();
    // Page header: the name as plain text (the h1 stays in the profile), no back on a direct visit.
    expect(screen.getByRole('banner')).toHaveTextContent('Claudia Andreya');
    expect(screen.queryByLabelText('Kembali')).toBeNull();
    // Recorded in "Baru dilihat" on this device (US-066).
    expect(JSON.parse(localStorage.getItem('influency:recent-creators') ?? '[]')).toEqual([
      { slug: 'claudiandreya', displayName: 'Claudia Andreya', avatarUrl: CREATOR.avatarUrl },
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
  beforeEach(() =>
    vi.mocked(getFollowState).mockResolvedValue({ following: false, followerCount: 1200 }),
  );
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
      for (const name of ['Bagikan', 'Ikuti', 'Langganan']) {
        expect(screen.getByRole('link', { name })).toHaveAttribute('href', LOGIN);
      }
      expect(screen.queryByRole('link', { name: 'Masuk' })).toBeNull();
      expect(screen.getByText(/1,2 rb/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Bagikan profil' })).toBeNull();
      expect(screen.getByText('Memuat konten…')).toBeInTheDocument();
    },
  );

  it('gives a signed-in user the header, share and subscribe actions', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1',
      displayName: 'Ana',
      username: 'ana',
      roles: ['USER'],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    });
    await view();
    expect(screen.getByRole('banner')).toHaveTextContent('Claudia Andreya');
    expect(screen.queryByRole('link', { name: 'Masuk' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bagikan profil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Langganan · \d+ Koin/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit Profil' })).toBeNull();
  });

  describe('viewer roles', () => {
    const creatorUser = {
      id: 'u2',
      displayName: 'Claudia',
      username: 'claudia',
      roles: ['USER', 'CREATOR'] as ('USER' | 'CREATOR' | 'ADMIN')[],
      bio: null,
      creatorSlug: null,
      onboardingCompleted: true,
    };

    it('shows the owner Edit Profil instead of Ikuti and Langganan', async () => {
      localStorage.clear();
      vi.mocked(getCurrentUser).mockResolvedValue(creatorUser);
      vi.mocked(getMyCreatorProfile).mockResolvedValue(CREATOR);
      await view();
      expect(screen.getByRole('link', { name: 'Edit Profil' })).toHaveAttribute(
        'href',
        '/studio/profile',
      );
      expect(screen.queryByRole('button', { name: 'Ikuti' })).toBeNull();
      expect(screen.queryByRole('button', { name: /Langganan/ })).toBeNull();
      // The owner's own profile is not added to "Baru dilihat".
      expect(localStorage.getItem('influency:recent-creators')).toBeNull();
    });

    it.each([
      [
        'another creator',
        () => vi.mocked(getMyCreatorProfile).mockResolvedValue({ ...CREATOR, slug: 'creatorb' }),
      ],
      [
        'a failing lookup',
        () => vi.mocked(getMyCreatorProfile).mockRejectedValue(new Error('down')),
      ],
    ])('shows Ikuti and Langganan for %s', async (_l, arrange) => {
      vi.mocked(getCurrentUser).mockResolvedValue(creatorUser);
      arrange();
      await view();
      expect(screen.queryByRole('link', { name: 'Edit Profil' })).toBeNull();
      expect(screen.getByRole('button', { name: 'Ikuti' })).toBeInTheDocument();
    });

    it('does not look up the own profile for a plain user', async () => {
      vi.mocked(getCurrentUser).mockResolvedValue({ ...creatorUser, roles: ['USER'] });
      vi.mocked(getMyCreatorProfile).mockClear();
      await view();
      expect(getMyCreatorProfile).not.toHaveBeenCalled();
    });

    it('shows the subscribed state the server reports for the viewer', async () => {
      const creatorb = { ...CREATOR, slug: 'creatorb' };
      const day = 86_400_000;
      vi.mocked(getCreatorSubscription).mockResolvedValueOnce({
        plan: { priceCoins: 300, durationDays: 30 },
        viewer: {
          current: {
            periodId: '0198a3c0-0000-7000-8000-0000000000d1',
            startsAt: new Date(Date.now() - 18 * day).toISOString(),
            endsAt: new Date(Date.now() + 12 * day).toISOString(),
            priceCoins: 300,
          },
          scheduled: null,
          canTip: false,
        },
      });
      vi.mocked(getCurrentUser).mockResolvedValue({ ...creatorUser, roles: ['USER'] });
      const { unmount } = render(await CreatorView({ creator: creatorb }), { wrapper: Toaster });
      expect(screen.getByRole('button', { name: /Berlangganan/ })).toHaveTextContent(
        '12 hari lagi',
      );
      unmount();
      vi.mocked(getCurrentUser).mockResolvedValue(null);
      render(await CreatorView({ creator: creatorb }), { wrapper: Toaster });
      expect(screen.queryByText(/Berlangganan/)).toBeNull();
    });
  });
});
