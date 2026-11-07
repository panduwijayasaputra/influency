import { fireEvent, render, screen } from '@testing-library/react';
import type { CreatorProfileResponse, PublicPostDetail } from '@influency/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPostComments } from '@/lib/api/post-comments';
import { getPublicCreator } from '@/lib/api/public-creator';
import { getPublicPost } from '@/lib/api/public-post';
import { loginHref } from '@/lib/login-href';
import { ScrollToComments } from './scroll-to-comments';
import PostPage, { CommentsSection, generateMetadata, PostDetail } from './page';

vi.mock('@/lib/api/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/api/public-creator', () => ({ getPublicCreator: vi.fn() }));
vi.mock('@/lib/api/public-post', () => ({ getPublicPost: vi.fn() }));
vi.mock('@/lib/api/post-comments', () => ({ getPostComments: vi.fn() }));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('notFound');
  },
  useRouter: () => ({ back: vi.fn(), refresh: vi.fn() }),
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
  commentCount: 0,
  media: [],
  ...overrides,
});
const locked = (previewUrl: string | null = null) =>
  post({ visibility: 'PREMIUM', offer: { priceCoins: 8 }, previewUrl, access: 'locked' });

const CARD_CREATOR = { slug: 'ana', displayName: 'Ana', avatarUrl: null };

async function renderDetail(detail: PublicPostDetail) {
  vi.mocked(getPublicPost).mockResolvedValue(detail);
  return render(await PostDetail({ creator: CARD_CREATOR, postId: POST_ID }), {
    wrapper: Toaster,
  });
}

describe('PostDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Keeps the Suspense'd comments on their fallback.
    vi.mocked(getPostComments).mockReturnValue(new Promise(() => {}));
    // The card's media never leaves "near viewport" pending, so no media-access call happens here.
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise(() => {})),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a free post as a full card with the whole caption, then the comments', async () => {
    await renderDetail(post({ caption: 'Halo dari Bali' }));
    expect(screen.getByRole('article', { name: 'Post oleh Ana' })).toBeInTheDocument();
    expect(screen.getByText('Halo dari Bali')).not.toHaveClass('line-clamp-2');
    expect(screen.queryByText(/Koin/)).toBeNull();
    expect(getPublicPost).toHaveBeenCalledWith('ana', POST_ID);
    expect(screen.getByRole('heading', { name: 'Komentar' })).toBeInTheDocument();
    expect(screen.getByText('Memuat komentar…')).toBeInTheDocument();
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
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
    expect(await screen.findByRole('menuitem', { name: 'Laporkan' })).toBeInTheDocument();
    unmount();
    await renderDetail(post({ viewer: { ...viewer, canReport: false } }));
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Lainnya' }), { button: 0 });
    await screen.findByRole('menuitem', { name: 'Bagikan' });
    expect(screen.queryByRole('menuitem', { name: 'Laporkan' })).toBeNull();
  });

  it('shows only the blurred preview and the price for a locked post, guest to login', async () => {
    const previewUrl = '/api/v1/creators/ana/posts/p/preview/x';
    const { container } = await renderDetail(locked(previewUrl));
    expect(container.querySelector('img')).toHaveAttribute('src', previewUrl);
    expect(screen.getByRole('link', { name: /Buka · 8 Koin/ })).toHaveAttribute(
      'href',
      loginHref(`/ana/posts/${POST_ID}`),
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('opens the Koin sheet for a signed-in viewer of a locked post, with no detail link', async () => {
    await renderDetail({
      ...locked(),
      viewer: { liked: false, canLike: false, canReport: true },
    });
    fireEvent.click(screen.getByRole('button', { name: /Buka · 8 Koin/ }));
    expect(await screen.findByText('Permanen')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lihat detail post' })).toBeNull();
  });

  it('shows the locked placeholder when a premium post has no preview', async () => {
    await renderDetail(locked());
    expect(screen.getByTestId('locked-placeholder')).toBeInTheDocument();
  });

  it("labels the owner's unpublished post and omits the missing date and comments", async () => {
    const { container } = await renderDetail(post({ status: 'DRAFT', publishedAt: null }));
    expect(screen.getByText('Draf · tidak terlihat publik')).toBeInTheDocument();
    expect(container.querySelector('time')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Komentar' })).toBeNull();
  });

  it('shows the comments section only on published posts', async () => {
    await renderDetail(post({ status: 'ARCHIVED' }));
    expect(screen.queryByRole('heading', { name: 'Komentar' })).toBeNull();
  });

  it('is not found when the API hides the post', async () => {
    vi.mocked(getPublicPost).mockResolvedValue(null);
    await expect(PostDetail({ creator: CARD_CREATOR, postId: POST_ID })).rejects.toThrow(
      'notFound',
    );
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

describe('ScrollToComments', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('scrolls to the comments once, only for #komentar', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    document.body.innerHTML = '<div id="komentar"></div>';
    const { unmount } = render(<ScrollToComments />);
    expect(scrollIntoView).not.toHaveBeenCalled();
    unmount();
    window.location.hash = '#komentar';
    render(<ScrollToComments />);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
