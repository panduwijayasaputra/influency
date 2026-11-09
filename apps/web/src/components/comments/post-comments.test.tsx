import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { PostComment, PostCommentList, PostReply } from '@influency/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster } from '@/components/ui/toast';
import { loginHref } from '@/lib/login-href';
import { applyEdit, insertTopLevel, PostComments } from './post-comments';

const POST_ID = '0190a000-0000-7000-8000-000000000001';
const PATH = `/ana/posts/${POST_ID}`;
const comment = (n: number, overrides: Partial<PostComment> = {}): PostComment => ({
  id: `0190a000-0000-7000-8000-00000000010${n}`,
  body: `komentar ${n}`,
  createdAt: '2026-11-03T05:00:00.000Z',
  author: { displayName: `Fan ${n}` },
  canDelete: false,
  canEdit: false,
  canPin: false,
  ...overrides,
});
/** Opens the `···` menu of the (only) deletable comment or reply and picks Hapus. */
const chooseHapus = () => {
  fireEvent.keyDown(screen.getByRole('button', { name: /Aksi lainnya/ }), { key: 'Enter' });
  fireEvent.click(screen.getByRole('menuitem', { name: 'Hapus' }));
};
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
  render(<PostComments postId={POST_ID} path={PATH} initial={initial} loggedIn={loggedIn} />, {
    wrapper: Toaster,
  });

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
    expect(screen.getAllByRole('button', { name: /Aksi lainnya/ })).toHaveLength(1);
    chooseHapus();
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

  it('reports +1 after a post and -1 after a delete, nothing when the post fails', async () => {
    const onCountChange = vi.fn();
    stubFetch(() =>
      Promise.resolve(Response.json(comment(2, { canDelete: true }), { status: 201 })),
    );
    render(
      <PostComments
        postId={POST_ID}
        path={PATH}
        initial={page()}
        loggedIn
        onCountChange={onCountChange}
      />,
      { wrapper: Toaster },
    );
    fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: 'halo' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
    await screen.findByText('komentar 2');
    expect(onCountChange).toHaveBeenLastCalledWith(1);
    stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    chooseHapus();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Hapus komentar ini?' })).getByRole('button', {
        name: 'Hapus',
      }),
    );
    await waitFor(() => expect(onCountChange).toHaveBeenLastCalledWith(-1));
    expect(onCountChange).toHaveBeenCalledTimes(2);

    onCountChange.mockClear();
    stubFetch(() => Promise.resolve(new Response(null, { status: 500 })));
    fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: 'gagal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
    await screen.findByRole('alert');
    expect(onCountChange).not.toHaveBeenCalled();
  });

  describe('deleting in a thread', () => {
    const reply = (n: number, extra = {}) => ({
      id: `0190a000-0000-7000-8000-00000000030${n}`,
      body: `balasan ${n}`,
      createdAt: '2026-11-03T06:00:00.000Z',
      author: { displayName: `Penjawab ${n}` },
      canDelete: false,
      canEdit: false,
      canPin: false,
      ...extra,
    });
    const confirmDelete = () => {
      chooseHapus();
      fireEvent.click(
        within(screen.getByRole('dialog', { name: 'Hapus komentar ini?' })).getByRole('button', {
          name: 'Hapus',
        }),
      );
    };

    it('a parent with replies becomes the placeholder, keeps its replies and drops its text', async () => {
      const onCountChange = vi.fn();
      stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
      render(
        <PostComments
          postId={POST_ID}
          path={PATH}
          initial={page({
            items: [
              comment(1, { canDelete: true, pinned: true, replies: [reply(1)], replyCount: 1 }),
            ],
          })}
          loggedIn
          onCountChange={onCountChange}
        />,
        { wrapper: Toaster },
      );
      confirmDelete();
      expect(await screen.findByText('Komentar dihapus')).toBeInTheDocument();
      expect(screen.queryByText('komentar 1')).toBeNull();
      expect(screen.queryByText('Fan 1')).toBeNull();
      expect(screen.queryByText('Disematkan oleh creator')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 balasan' }));
      expect(screen.getByText('balasan 1')).toBeInTheDocument();
      expect(onCountChange).toHaveBeenCalledWith(-1);
    });

    it('a reply leaves its parent and lowers the reply count', async () => {
      stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
      renderComments(
        page({
          items: [
            comment(1, { replyCount: 2, replies: [reply(1, { canDelete: true }), reply(2)] }),
          ],
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Lihat 2 balasan' }));
      confirmDelete();
      await waitFor(() => expect(screen.queryByText('balasan 1')).toBeNull());
      expect(screen.getByText('balasan 2')).toBeInTheDocument();
      expect(screen.getByText('komentar 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Sembunyikan balasan' })).toBeInTheDocument();
    });

    it('a parent without replies is removed as before', async () => {
      stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
      renderComments(page({ items: [comment(1, { canDelete: true })] }));
      confirmDelete();
      await waitFor(() => expect(screen.queryByText('komentar 1')).toBeNull());
      expect(screen.queryByText('Komentar dihapus')).toBeNull();
    });
  });

  it('keeps the comment when the delete sheet is cancelled', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(new Response(null, { status: 204 })));
    renderComments(page({ items: [comment(2, { canDelete: true })] }));
    chooseHapus();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    // Cancelling leaves the comment and returns focus to the menu trigger.
    await waitFor(() => expect(screen.getByRole('button', { name: /Aksi lainnya/ })).toHaveFocus());
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

  it('pins the composer above the bottom nav, or to the bottom for a guest', () => {
    const { unmount } = renderComments(page());
    const bar = () => screen.getByLabelText('Tulis komentar').closest('div.fixed') as HTMLElement;
    expect(bar().style.bottom).toBe('var(--bottom-nav-height)');
    expect(screen.getByText('0/500')).toBeInTheDocument();
    unmount();
    renderComments(page({ canComment: false }), false);
    const guestBar = screen
      .getByRole('link', { name: 'Masuk untuk berkomentar' })
      .closest('div.fixed');
    expect((guestBar as HTMLElement).style.bottom).toBe('0px');
  });

  it('rides above the on-screen keyboard while the textarea is focused', () => {
    const vv = new EventTarget() as unknown as VisualViewport;
    Object.assign(vv, { height: 400, offsetTop: 0 });
    vi.stubGlobal('visualViewport', vv);
    vi.stubGlobal('innerHeight', 700);
    renderComments(page());
    fireEvent.focus(screen.getByLabelText('Tulis komentar'));
    const bar = screen.getByLabelText('Tulis komentar').closest('div.fixed') as HTMLElement;
    expect(bar.style.bottom).toBe('300px');
  });

  it('keeps the composer inline in a sheet', () => {
    render(
      <PostComments postId={POST_ID} path={PATH} initial={page()} loggedIn variant="sheet" />,
      { wrapper: Toaster },
    );
    expect(screen.getByLabelText('Tulis komentar').closest('div.fixed')).toBeNull();
  });

  describe('replies (US-017)', () => {
    const reply = (n: number): PostReply => ({
      id: `0190a000-0000-7000-8000-00000000020${n}`,
      body: `balasan ${n}`,
      createdAt: '2026-11-03T06:00:00.000Z',
      author: { displayName: `Penjawab ${n}` },
      canDelete: false,
      canEdit: false,
      canPin: false,
    });
    const created = reply(9);
    const sentBody = (fetchMock: ReturnType<typeof stubFetch>) =>
      JSON.parse(fetchMock.mock.calls.at(-1)![1]!.body as string) as Record<string, unknown>;

    it('Balas shows who is being answered, sends parentId and shows the reply under its thread', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(Response.json(created, { status: 201 })));
      renderComments(page());
      fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
      expect(screen.getByText('Fan 1', { selector: 'span.font-semibold' })).toBeInTheDocument();
      const box = screen.getByLabelText('Tulis balasan untuk Fan 1');
      expect(box).toHaveFocus();
      fireEvent.change(box, { target: { value: 'halo juga' } });
      fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
      expect(await screen.findByText('balasan 9')).toBeInTheDocument();
      expect(sentBody(fetchMock)).toEqual({ body: 'halo juga', parentId: comment(1).id });
      expect(screen.getByRole('button', { name: 'Sembunyikan balasan' })).toBeInTheDocument();
      expect(screen.queryByLabelText('Batalkan balasan')).toBeNull();
      expect(screen.getByLabelText('Tulis komentar')).toHaveValue('');
    });

    it('cancelling the reply sends a normal comment', async () => {
      const fetchMock = stubFetch(() =>
        Promise.resolve(Response.json(comment(3, { body: 'biasa' }), { status: 201 })),
      );
      renderComments(page());
      fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
      fireEvent.click(screen.getByLabelText('Batalkan balasan'));
      fireEvent.change(screen.getByLabelText('Tulis komentar'), { target: { value: 'biasa' } });
      fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
      expect(await screen.findByText('biasa')).toBeInTheDocument();
      expect(sentBody(fetchMock)).toEqual({ body: 'biasa' });
    });

    it('a reply to a reply goes to the top-level comment', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(Response.json(created, { status: 201 })));
      renderComments(page({ items: [comment(1, { replyCount: 1, replies: [reply(1)] })] }));
      fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 balasan' }));
      fireEvent.click(screen.getAllByRole('button', { name: 'Balas' })[1]!);
      fireEvent.change(screen.getByLabelText('Tulis balasan untuk Penjawab 1'), {
        target: { value: 'ya' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
      expect(await screen.findByText('balasan 9')).toBeInTheDocument();
      expect(sentBody(fetchMock)).toEqual({ body: 'ya', parentId: comment(1).id });
    });

    it('counts a reply but keeps order while earlier replies are still unloaded', async () => {
      stubFetch(() => Promise.resolve(Response.json(created, { status: 201 })));
      renderComments(page({ items: [comment(1, { replyCount: 5, replies: [reply(1)] })] }));
      fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
      fireEvent.change(screen.getByLabelText('Tulis balasan untuk Fan 1'), {
        target: { value: 'x' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Kirim' }));
      expect(
        await screen.findByRole('button', { name: 'Sembunyikan balasan' }),
      ).toBeInTheDocument();
      expect(screen.queryByText('balasan 9')).toBeNull();
      expect(screen.getByRole('button', { name: 'Lihat balasan lainnya' })).toBeInTheDocument();
    });
  });

  describe('insertTopLevel', () => {
    it('puts a new comment after liked and pinned ones, before older zero-like comments', () => {
      const liked = comment(1, { likeCount: 3 });
      const pinned = comment(2, { pinned: true, likeCount: 0 });
      const older = comment(3, { likeCount: 0 });
      const fresh = comment(4);
      expect(insertTopLevel([pinned, liked, older], fresh)).toEqual([pinned, liked, fresh, older]);
      expect(insertTopLevel([liked], fresh)).toEqual([liked, fresh]);
      expect(insertTopLevel([], fresh)).toEqual([fresh]);
    });
  });

  describe('editing (US-019)', () => {
    const mine = (extra: Partial<PostComment> = {}) =>
      comment(1, { canEdit: true, canDelete: true, body: 'lama', ...extra });
    const startEdit = (text: string) => {
      fireEvent.keyDown(screen.getByRole('button', { name: /Aksi lainnya/ }), { key: 'Enter' });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
      fireEvent.change(screen.getByLabelText('Edit komentar'), { target: { value: text } });
      fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    };

    it('PATCHes the draft, then shows the new text and Diedit', async () => {
      const fetchMock = stubFetch(() =>
        Promise.resolve(
          Response.json({ ...mine(), body: 'baru', editedAt: '2026-11-07T09:00:00.000Z' }),
        ),
      );
      renderComments(page({ items: [mine()] }));
      startEdit(' baru ');
      await waitFor(() => expect(screen.queryByLabelText('Edit komentar')).toBeNull());
      expect(screen.getByText('baru')).toBeInTheDocument();
      expect(screen.getByText(/Diedit/)).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(`/api/v1/posts/${POST_ID}/comments/${mine().id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: 'baru' }),
      });
    });

    it('shows the API message and keeps the draft when the save fails', async () => {
      stubFetch(() =>
        Promise.resolve(
          Response.json(
            {
              error: {
                code: 'FORBIDDEN',
                message: 'Akses ditolak.',
                requestId: 'r',
                details: null,
              },
            },
            { status: 403 },
          ),
        ),
      );
      renderComments(page({ items: [mine()] }));
      startEdit('draf');
      expect(await screen.findByRole('alert')).toHaveTextContent('Akses ditolak.');
      expect(screen.getByLabelText('Edit komentar')).toHaveValue('draf');
      expect(screen.queryByText(/Diedit/)).toBeNull();
    });

    it('shows a generic message on a network error', async () => {
      stubFetch(() => Promise.reject(new Error('offline')));
      renderComments(page({ items: [mine()] }));
      startEdit('draf');
      expect(await screen.findByRole('alert')).toHaveTextContent('Gagal menyimpan. Coba lagi.');
      expect(screen.getByLabelText('Edit komentar')).toHaveValue('draf');
    });
  });

  describe('applyEdit', () => {
    const r = (n: number): PostReply => ({
      id: `0190a000-0000-7000-8000-00000000020${n}`,
      body: `balasan ${n}`,
      createdAt: '2026-11-03T06:00:00.000Z',
      author: { displayName: `P ${n}` },
      canDelete: false,
      canEdit: true,
      canPin: false,
    });
    const top = comment(1, { pinned: true, canPin: true, replyCount: 2, replies: [r(1), r(2)] });
    const saved = (id: string): PostReply => ({
      ...r(1),
      id,
      body: 'diedit',
      editedAt: '2026-11-07T09:00:00.000Z',
    });

    it('changes only body and editedAt of the top-level comment', () => {
      expect(applyEdit(top, saved(top.id))).toEqual({
        ...top,
        body: 'diedit',
        editedAt: '2026-11-07T09:00:00.000Z',
      });
    });

    it('changes only the matching reply and leaves the rest alone', () => {
      const out = applyEdit(top, saved(r(2).id));
      expect(out.replies![1]).toMatchObject({
        body: 'diedit',
        editedAt: '2026-11-07T09:00:00.000Z',
      });
      expect(out.replies![0]).toEqual(r(1));
      expect(out).toMatchObject({ pinned: true, canPin: true, replyCount: 2, body: top.body });
    });

    it('returns an unrelated comment unchanged', () => {
      const other = comment(5);
      expect(applyEdit(other, saved(top.id))).toBe(other);
    });
  });

  describe('pinning', () => {
    const owner = (n: number, overrides: Partial<PostComment> = {}) =>
      comment(n, { canPin: true, ...overrides });
    const openMenuOf = (n: number) =>
      fireEvent.keyDown(
        screen.getByRole('button', { name: `Aksi lainnya untuk komentar Fan ${n}` }),
        {
          key: 'Enter',
        },
      );
    const labels = () => screen.queryAllByText('Disematkan oleh creator');

    it('Sematkan sends PUT, moves the comment to the top and labels it', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(Response.json({ pinned: true })));
      renderComments(page({ items: [owner(1), owner(2)] }));
      openMenuOf(2);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sematkan' }));
      expect(await screen.findByText('Komentar disematkan')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/posts/${POST_ID}/comments/${comment(2).id}/pin`,
        {
          method: 'PUT',
        },
      );
      expect(labels()).toHaveLength(1);
      const texts = screen.getAllByText(/^komentar \d$/).map((e) => e.textContent);
      expect(texts).toEqual(['komentar 2', 'komentar 1']);
      openMenuOf(2);
      expect(screen.getByRole('menuitem', { name: 'Lepas sematan' })).toBeInTheDocument();
    });

    it('pinning another comment unpins the first', async () => {
      stubFetch(() => Promise.resolve(Response.json({ pinned: true })));
      renderComments(page({ items: [owner(1, { pinned: true }), owner(2)] }));
      expect(labels()).toHaveLength(1);
      openMenuOf(2);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sematkan' }));
      await screen.findByText('Komentar disematkan');
      expect(labels()).toHaveLength(1);
      expect(screen.getAllByText(/^komentar \d$/)[0]).toHaveTextContent('komentar 2');
    });

    it('Lepas sematan sends DELETE and removes the label', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(Response.json({ pinned: false })));
      renderComments(page({ items: [owner(1, { pinned: true })] }));
      openMenuOf(1);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Lepas sematan' }));
      expect(await screen.findByText('Sematan dilepas')).toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/v1/posts/${POST_ID}/comments/${comment(1).id}/pin`,
        {
          method: 'DELETE',
        },
      );
      expect(labels()).toHaveLength(0);
    });

    it('a failed request leaves the list as it was and shows the error', async () => {
      stubFetch(() =>
        Promise.resolve(
          Response.json(
            {
              error: {
                code: 'FORBIDDEN',
                message: 'Anda tidak memiliki akses.',
                requestId: 'r',
                details: null,
              },
            },
            { status: 403 },
          ),
        ),
      );
      renderComments(page({ items: [owner(1), owner(2)] }));
      openMenuOf(2);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sematkan' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Anda tidak memiliki akses.');
      expect(labels()).toHaveLength(0);
      expect(screen.getAllByText(/^komentar \d$/)[0]).toHaveTextContent('komentar 1');
    });

    it('offers no pin item without canPin', () => {
      renderComments(page({ items: [comment(1, { canDelete: true })] }));
      openMenuOf(1);
      expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Hapus']);
    });
  });
});
