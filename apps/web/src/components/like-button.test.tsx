import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginHref } from '@/lib/login-href';
import { LikeButton } from './like-button';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const PATH = `/ana/posts/${POST_ID}`;

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
const json = (body: unknown) => Promise.resolve(Response.json(body));

describe('LikeButton', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logged out: links to login returning to the post, with the count', () => {
    render(<LikeButton postId={POST_ID} path={PATH} likeCount={3} viewer={null} />);
    const link = screen.getByRole('link', { name: 'Masuk untuk menyukai · 3 suka' });
    expect(link).toHaveAttribute('href', loginHref(PATH));
  });

  it('cannot like: shows the count without a button', () => {
    render(
      <LikeButton
        postId={POST_ID}
        path={PATH}
        likeCount={4}
        viewer={{ liked: false, canLike: false, canReport: true }}
      />,
    );
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('toggles with PUT then DELETE and shows the server count', async () => {
    const fetchMock = stubFetch(() => json({ liked: true, likeCount: 6 }));
    render(
      <LikeButton
        postId={POST_ID}
        path={PATH}
        likeCount={5}
        viewer={{ liked: false, canLike: true, canReport: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Suka · 5 suka' }));
    const pressed = await screen.findByRole('button', { name: 'Batal suka · 6 suka' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/${POST_ID}/like`, { method: 'PUT' });

    fetchMock.mockImplementation(() => json({ liked: false, likeCount: 5 }));
    fireEvent.click(pressed);
    await screen.findByRole('button', { name: 'Suka · 5 suka' });
    expect(fetchMock).toHaveBeenLastCalledWith(`/api/v1/posts/${POST_ID}/like`, {
      method: 'DELETE',
    });
  });

  it.each([
    ['a 403 response', () => Promise.resolve(new Response(null, { status: 403 }))],
    ['a network error', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('keeps the state and shows an error on %s', async (_label, impl) => {
    stubFetch(impl);
    render(
      <LikeButton
        postId={POST_ID}
        path={PATH}
        likeCount={2}
        viewer={{ liked: true, canLike: true, canReport: true }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Batal suka · 2 suka' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan. Coba lagi.');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Batal suka · 2 suka' })).toBeEnabled(),
    );
  });
});

describe('LikeButton hooks (US-013)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const viewer = { liked: false, canLike: true, canReport: true };

  it('reports the server result through onChange, and not on failure', async () => {
    const onChange = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ liked: true, likeCount: 5 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <LikeButton postId={POST_ID} path={PATH} likeCount={4} viewer={viewer} onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Suka · 4 suka' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ liked: true, count: 5 }));
    fireEvent.click(screen.getByRole('button', { name: 'Batal suka · 5 suka' }));
    await screen.findByRole('alert');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('passes className to all three states', () => {
    const { rerender } = render(
      <LikeButton postId={POST_ID} path={PATH} likeCount={1} viewer={null} className="x-test" />,
    );
    expect(screen.getByRole('link')).toHaveClass('x-test');
    rerender(
      <LikeButton
        postId={POST_ID}
        path={PATH}
        likeCount={1}
        viewer={{ ...viewer, canLike: false }}
        className="x-test"
      />,
    );
    expect(screen.getByLabelText('1 suka')).toHaveClass('x-test');
    rerender(
      <LikeButton postId={POST_ID} path={PATH} likeCount={1} viewer={viewer} className="x-test" />,
    );
    expect(screen.getByRole('button')).toHaveClass('x-test');
  });
});
