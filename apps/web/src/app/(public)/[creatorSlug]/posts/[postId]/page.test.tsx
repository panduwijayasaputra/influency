import { render, screen } from '@testing-library/react';
import type { CreatorProfileResponse, PublicPostDetail } from '@influency/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPostComments } from '@/lib/api/post-comments';
import { getPublicCreator } from '@/lib/api/public-creator';
import { getPublicPost } from '@/lib/api/public-post';
import { loginHref } from '@/lib/login-href';
import PostPage, { CommentsSection, generateMetadata, PostDetail, UnlockCta } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/public-creator', () => ({ getPublicCreator: vi.fn() }));
vi.mock('@/lib/api/public-post', () => ({ getPublicPost: vi.fn() }));
vi.mock('@/lib/api/post-comments', () => ({ getPostComments: vi.fn() }));
vi.mock('@/components/post-media-viewer', () => ({
  PostMediaViewer: ({ postId }: { postId: string }) => <div data-testid="viewer">{postId}</div>,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  useRouter: () => ({ back: vi.fn() }),
}));

const CREATOR: CreatorProfileResponse = {
  slug: 'ana',
  displayName: 'Ana',
  bio: null,
  category: null,
  avatarUrl: null,
  bannerUrl: null,
};
const POST_ID = '0190a000-0000-7000-8000-000000000001';
const post = (overrides: Partial<PublicPostDetail>): PublicPostDetail => ({
  id: POST_ID,
  visibility: 'FREE',
  status: 'PUBLISHED',
  caption: 'Halo',
  publishedAt: '2026-11-03T05:00:00.000Z',
  imageCount: 2,
  videoCount: 0,
  offer: null,
  previewUrl: null,
  access: 'full',
  likeCount: 0,
  viewer: null,
  ...overrides,
});
const locked = (previewUrl: string | null = null) =>
  post({ visibility: 'PREMIUM', offer: { priceCoins: 8 }, previewUrl, access: 'locked' });

async function renderDetail(detail: PublicPostDetail) {
  vi.mocked(getPublicPost).mockResolvedValue(detail);
  return render(await PostDetail({ slug: 'ana', postId: POST_ID }), { wrapper: Toaster });
}

describe('PostDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Keeps the Suspense'd unlock button on its (empty) fallback.
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => {}));
    // Keeps the Suspense'd comments on their fallback.
    vi.mocked(getPostComments).mockReturnValue(new Promise(() => {}));
  });

  it('shows a free post in full with the media viewer', async () => {
    await renderDetail(post({}));
    expect(screen.getByTestId('viewer')).toHaveTextContent(POST_ID);
    expect(screen.getByText('Halo')).toBeInTheDocument();
    expect(screen.getByText('2 foto · 3 Nov 2026')).toBeInTheDocument();
    expect(screen.queryByText(/Koin/)).toBeNull();
    expect(screen.queryByText('Sudah terbuka')).toBeNull();
    expect(getPublicPost).toHaveBeenCalledWith('ana', POST_ID);
  });

  it('shows the like count; logged out it links to login on this post', async () => {
    await renderDetail(post({ likeCount: 7 }));
    expect(screen.getByRole('link', { name: 'Masuk untuk menyukai · 7 suka' })).toHaveAttribute(
      'href',
      loginHref(`/ana/posts/${POST_ID}`),
    );
  });

  it('offers Laporkan to other viewers only (US-042)', async () => {
    const viewer = { liked: false, canLike: true, canReport: true };
    const { unmount } = await renderDetail(post({ viewer }));
    expect(screen.getByRole('button', { name: 'Laporkan' })).toBeInTheDocument();
    unmount();
    await renderDetail(post({ viewer: { ...viewer, canReport: false } }));
    expect(screen.queryByRole('button', { name: 'Laporkan' })).toBeNull();
  });

  it('marks an unlocked premium post and shows no price', async () => {
    await renderDetail(post({ visibility: 'PREMIUM', offer: { priceCoins: 8 } }));
    expect(screen.getByText('Sudah terbuka')).toBeInTheDocument();
    expect(screen.getByTestId('viewer')).toBeInTheDocument();
    expect(screen.queryByText(/akses permanen/)).toBeNull();
  });

  it('shows only the blurred preview and price for a locked post', async () => {
    const previewUrl = '/api/v1/creators/ana/posts/p/preview/x';
    const { container } = await renderDetail(locked(previewUrl));
    expect(container.querySelector('img')).toHaveAttribute('src', previewUrl);
    expect(screen.getByText(/8 Koin/)).toHaveTextContent('8 Koin · akses permanen');
    expect(screen.queryByTestId('viewer')).toBeNull();
  });

  it('shows the locked placeholder when a premium post has no preview', async () => {
    await renderDetail(locked());
    expect(screen.getByTestId('locked-placeholder')).toBeInTheDocument();
  });

  it("labels the owner's unpublished post and omits the missing date", async () => {
    await renderDetail(post({ status: 'DRAFT', publishedAt: null }));
    expect(screen.getByText('Draf · tidak terlihat publik')).toBeInTheDocument();
    expect(screen.getByText('2 foto')).toBeInTheDocument();
  });

  it('shows the comments section only on published posts', async () => {
    const { unmount } = await renderDetail(post({}));
    expect(screen.getByRole('heading', { name: 'Komentar' })).toBeInTheDocument();
    expect(screen.getByText('Memuat komentar…')).toBeInTheDocument();
    unmount();
    await renderDetail(post({ status: 'ARCHIVED' }));
    expect(screen.queryByRole('heading', { name: 'Komentar' })).toBeNull();
  });

  it('is not found when the API hides the post', async () => {
    vi.mocked(getPublicPost).mockResolvedValue(null);
    await expect(PostDetail({ slug: 'ana', postId: POST_ID })).rejects.toThrow('notFound');
  });
});

describe('UnlockCta', () => {
  it('sends logged-out visitors to login and back to the post', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    render(await UnlockCta({ path: `/ana/posts/${POST_ID}` }));
    expect(screen.getByRole('link', { name: 'Masuk untuk membuka' })).toHaveAttribute(
      'href',
      loginHref(`/ana/posts/${POST_ID}`),
    );
  });

  it('treats an API outage as logged out', async () => {
    vi.mocked(getCurrentUser).mockRejectedValue(new Error('down'));
    render(await UnlockCta({ path: '/ana/posts/x' }));
    expect(screen.getByRole('link', { name: 'Masuk untuk membuka' })).toBeInTheDocument();
  });

  it('renders nothing for logged-in users until Koin unlock exists', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u' } as never);
    expect(await UnlockCta({ path: '/ana/posts/x' })).toBeNull();
  });
});

describe('CommentsSection', () => {
  const props = { postId: POST_ID, path: `/ana/posts/${POST_ID}`, loggedIn: false };

  it('renders the first page of comments', async () => {
    vi.mocked(getPostComments).mockResolvedValue({
      items: [
        {
          id: POST_ID,
          body: 'mantap',
          createdAt: '2026-11-03T05:00:00.000Z',
          author: { displayName: 'Budi' },
          canDelete: false,
        },
      ],
      nextCursor: null,
      canComment: false,
    });
    render(await CommentsSection(props));
    expect(screen.getByText('mantap')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Masuk untuk berkomentar' })).toBeInTheDocument();
  });

  it('explains locked comments on a premium post without access', async () => {
    vi.mocked(getPostComments).mockResolvedValue('forbidden');
    render(await CommentsSection(props));
    expect(
      screen.getByText('Buka post ini untuk melihat dan menulis komentar.'),
    ).toBeInTheDocument();
  });

  it('renders nothing when the post has no comments endpoint or the API is down', async () => {
    vi.mocked(getPostComments).mockResolvedValue(null);
    expect(await CommentsSection(props)).toBeNull();
    vi.mocked(getPostComments).mockRejectedValue(new Error('down'));
    expect(await CommentsSection(props)).toBeNull();
  });
});

describe('PostPage', () => {
  const props = (creatorSlug = 'ana') => ({
    params: Promise.resolve({ creatorSlug, postId: POST_ID }),
  });

  beforeEach(() => {
    vi.mocked(getPublicCreator).mockResolvedValue(CREATOR);
    vi.mocked(getPublicPost).mockReturnValue(new Promise(() => {}));
  });

  it('streams the post, holding the header until the session check (IfSignedIn)', async () => {
    vi.mocked(getCurrentUser).mockReturnValue(new Promise(() => {}));
    render(await PostPage(props()));
    expect(screen.queryByRole('link', { name: 'Kembali' })).toBeNull();
    expect(screen.getByText('Memuat postingan…')).toBeInTheDocument();
    expect(await generateMetadata(props())).toEqual({ title: 'Ana · Postingan' });
  });

  it('is not found for an unknown creator', async () => {
    vi.mocked(getPublicCreator).mockResolvedValue(null);
    await expect(PostPage(props('nobody'))).rejects.toThrow('notFound');
    await expect(generateMetadata(props('nobody'))).rejects.toThrow('notFound');
  });
});
