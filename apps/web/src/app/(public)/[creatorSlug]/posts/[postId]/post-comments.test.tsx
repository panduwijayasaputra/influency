import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PostComment, PostCommentList } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginHref } from '@/lib/login-href';
import { PostComments } from './post-comments';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const PATH = `/ana/posts/${POST_ID}`;
const comment = (n: number, overrides: Partial<PostComment> = {}): PostComment => ({
  id: `0190a000-0000-7000-8000-00000000010${n}`,
  body: `komentar ${n}`,
  createdAt: '2026-11-03T05:00:00.000Z',
  author: { displayName: `Fan ${n}` },
  canDelete: false,
  ...overrides,
});
const page = (overrides: Partial<PostCommentList> = {}): PostCommentList => ({
  items: [comment(1)],
  nextCursor: null,
  canComment: true,
  ...overrides,
});

function stubFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  const fetchMock = vi.fn(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const renderComments = (initial: PostCommentList, loggedIn = true) =>
  render(<PostComments postId={POST_ID} path={PATH} initial={initial} loggedIn={loggedIn} />);

describe('PostComments', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders markup in a comment as literal text', () => {
    const body = '<script>alert(1)</script><b>x</b>';
    const { container } = renderComments(page({ items: [comment(1, { body })] }));
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(container.querySelector('script, b')).toBeNull();
    expect(screen.getByText('Fan 1')).toBeInTheDocument();
  });

  it('posts the comment and appends the server result', async () => {
    const created = comment(2, { body: 'halo', canDelete: true });
    const fetchMock = stubFetch(() => Promise.resolve(Response.json(created, { status: 201 })));
    renderComments(page());
    const send = screen.getByRole('button', { name: 'Kirim' });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: '   ' } });
    expect(send).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: ' halo ' } });
    fireEvent.click(send);
    expect(await screen.findByText('halo')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/${POST_ID}/comments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body: ' halo ' }),
    });
    expect(screen.getByLabelText('Tulis komentar')).toHaveValue('');
  });

  it('shows the API message on failure, e.g. the rate limit', async () => {
    stubFetch(() =>
      Promise.resolve(
        Response.json(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'Terlalu banyak permintaan. Coba lagi sebentar.',
              requestId: 'req_1',
              details: null,
            },
          },
          { status: 429 },
        ),
      ),
    );
    renderComments(page());
    fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: 'hai' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Terlalu banyak permintaan. Coba lagi sebentar.',
    );
    expect(screen.getByLabelText('Tulis komentar')).toHaveValue('hai');
  });

  it('deletes only deletable comments, after confirmation', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderComments(page({ items: [comment(1), comment(2, { canDelete: true })] }));
    const buttons = screen.getAllByRole('button', { name: 'Hapus komentar' });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    const sheet = screen.getByRole('dialog', { name: 'Hapus komentar ini?' });
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole('button', { name: 'Hapus' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.queryByText('komentar 2')).toBeNull());
    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/${POST_ID}/comments/${comment(2).id}`, {
      method: 'DELETE',
    });
    expect(screen.getByText('komentar 1')).toBeInTheDocument();
  });

  it('keeps the comment when the delete sheet is cancelled', () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderComments(page({ items: [comment(2, { canDelete: true })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Hapus komentar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('komentar 2')).toBeInTheDocument();
  });

  it('logged out: links to login returning to the post, no form', () => {
    renderComments(page({ canComment: false }), false);
    expect(screen.getByRole('link', { name: 'Masuk untuk berkomentar' })).toHaveAttribute(
      'href',
      loginHref(PATH),
    );
    expect(screen.queryByLabelText('Tulis komentar')).toBeNull();
  });

  it('logged in without write access: no form and no login link', () => {
    renderComments(page({ canComment: false }));
    expect(screen.queryByLabelText('Tulis komentar')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('loads more with the cursor and appends', async () => {
    const cursor = comment(1).id;
    const fetchMock = stubFetch(() =>
      Promise.resolve(Response.json(page({ items: [comment(2)], nextCursor: null }))),
    );
    renderComments(page({ nextCursor: cursor }));
    fireEvent.click(screen.getByRole('button', { name: 'Muat lebih banyak' }));
    expect(await screen.findByText('komentar 2')).toBeInTheDocument();
    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/posts/${POST_ID}/comments?cursor=${cursor}`);
    expect(screen.queryByRole('button', { name: 'Muat lebih banyak' })).toBeNull();
  });
});
