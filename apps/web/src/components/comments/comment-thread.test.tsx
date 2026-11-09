import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PostComment, PostReply } from '@influency/shared';
import { Toaster } from '@/components/ui/toast';
import { CommentThread } from './comment-thread';

const reply = (n: number, extra: Partial<PostReply> = {}): PostReply => ({
  id: `0190a000-0000-7000-8000-00000000020${n}`,
  body: `balasan ${n}`,
  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
  author: { displayName: `Penjawab ${n}` },
  canDelete: false,
  canEdit: false,
  canPin: false,
  ...extra,
});
const comment = (extra: Partial<PostComment> = {}): PostComment => ({
  ...reply(0),
  id: '0190a000-0000-7000-8000-000000000100',
  body: 'komentar utama',
  author: { displayName: 'Ana Putri' },
  ...extra,
});

function setup(
  c: PostComment,
  props: {
    loggedIn?: boolean;
    canReply?: boolean;
    onEdit?: (id: string, body: string) => Promise<string | null>;
    onPin?: (id: string, pin: boolean) => void;
  } = {},
) {
  const onDelete = vi.fn();
  render(
    <CommentThread
      comment={c}
      postId="p1"
      path="/ana/posts/p1"
      loggedIn={props.loggedIn ?? true}
      canReply={props.canReply ?? true}
      pending={false}
      onDelete={onDelete}
      onEdit={props.onEdit ?? (() => Promise.resolve(null))}
      onPin={props.onPin ?? vi.fn()}
      onReply={vi.fn()}
      onMoreReplies={vi.fn()}
    />,
    { wrapper: Toaster },
  );
  return { onDelete };
}

describe('CommentThread', () => {
  it("renders today's API shape: name, time, text, heart, Balas, Hapus; no new labels", () => {
    const { onDelete } = setup(comment({ canDelete: true }));
    expect(screen.getByText('Ana Putri')).toBeInTheDocument();
    expect(screen.getByText('komentar utama')).toBeInTheDocument();
    expect(screen.getByText('1 jam yang lalu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suka komentar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Balas' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: /Aksi lainnya/ }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hapus' }));
    expect(onDelete).toHaveBeenCalledWith(comment().id);
    expect(screen.queryByText(/Lihat \d+ balasan/)).toBeNull();
    expect(screen.queryByText('Diedit', { exact: false })).toBeNull();
    expect(screen.queryByText('Disematkan oleh creator')).toBeNull();
  });

  it('shows initials without an avatar and an image with one', () => {
    const { unmount } = render(
      <CommentThread
        comment={comment()}
        postId="p1"
        path="/x"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={vi.fn()}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    expect(screen.getByText('AP')).toBeInTheDocument();
    unmount();
    const { container } = render(
      <CommentThread
        comment={comment({ avatarUrl: '/api/v1/a.png' })}
        postId="p1"
        path="/x"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={vi.fn()}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/v1/a.png');
  });

  it('labels a pinned comment and an edited one', () => {
    setup(comment({ pinned: true, editedAt: '2026-11-05T00:00:00.000Z' }));
    expect(screen.getByText('Disematkan oleh creator')).toBeInTheDocument();
    expect(screen.getByText(/Diedit/)).toBeInTheDocument();
  });

  it('does not mark an unedited comment (editedAt null)', () => {
    setup(comment({ editedAt: null }));
    expect(screen.queryByText(/Diedit/)).toBeNull();
  });

  it('collapses replies behind "Lihat n balasan" and expands one level, without a pin label', () => {
    setup(comment({ replies: [reply(1, { pinned: true } as Partial<PostReply>), reply(2)] }));
    expect(screen.queryByText('balasan 1')).toBeNull();
    const toggle = screen.getByRole('button', { name: 'Lihat 2 balasan' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    const list = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(within(list).getByText('balasan 1')).toBeInTheDocument();
    expect(within(list).getByText('balasan 2')).toBeInTheDocument();
    expect(within(list).queryByText('Disematkan oleh creator')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sembunyikan balasan' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('a deleted parent with replies shows only the placeholder and its replies, never its text', () => {
    setup(
      comment({
        deleted: true,
        body: 'rahasia yang dihapus',
        author: { displayName: 'Nama Rahasia' },
        avatarUrl: '/api/v1/rahasia.png',
        likeCount: 5,
        replies: [reply(1)],
      }),
    );
    expect(screen.getByText('Komentar dihapus')).toBeInTheDocument();
    expect(screen.queryByText('rahasia yang dihapus')).toBeNull();
    expect(screen.queryByText('Nama Rahasia')).toBeNull();
    expect(screen.queryByRole('button', { name: /Suka komentar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Balas' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 balasan' }));
    expect(screen.getByText('balasan 1')).toBeInTheDocument();
  });

  it('a deleted parent without replies renders nothing', () => {
    setup(comment({ deleted: true, replies: [] }));
    expect(screen.queryByText('Komentar dihapus')).toBeNull();
    expect(screen.queryByText('komentar utama')).toBeNull();
  });

  it('shows the like state from the API', () => {
    setup(comment({ likeCount: 3, liked: true }));
    expect(screen.getByRole('button', { name: 'Batal suka komentar · 3' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Balas: guest → login link, signed in → starts a reply, hidden when the viewer cannot comment', () => {
    const { unmount } = render(
      <CommentThread
        comment={comment()}
        postId="p1"
        path="/ana/posts/p1"
        loggedIn={false}
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={vi.fn()}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    expect(screen.getByRole('link', { name: 'Balas' })).toHaveAttribute(
      'href',
      '/login?returnTo=%2Fana%2Fposts%2Fp1',
    );
    unmount();
    const onReply = vi.fn();
    const second = render(
      <CommentThread
        comment={comment()}
        postId="p1"
        path="/x"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={onReply}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Balas' }));
    expect(onReply).toHaveBeenCalledWith(comment().id, 'Ana Putri');
    second.unmount();
    setup(comment(), { canReply: false });
    expect(screen.queryByRole('button', { name: 'Balas' })).toBeNull();
  });

  it('keeps long names and words from widening the layout', () => {
    const long = 'x'.repeat(60);
    setup(comment({ body: long, author: { displayName: long } }));
    expect(screen.getByText(long, { selector: 'span' }).className).toContain('truncate');
    expect(screen.getByText(long, { selector: 'p' }).className).toContain('wrap-break-word');
  });
});

describe('CommentThread actions menu (US-016)', () => {
  const openMenu = () =>
    fireEvent.keyDown(screen.getByRole('button', { name: /Aksi lainnya/ }), { key: 'Enter' });

  it('shows no menu when the server allows no action', () => {
    setup(comment());
    expect(screen.queryByRole('button', { name: /Aksi lainnya/ })).toBeNull();
  });

  it('the author edits inline: prefilled, counter, Simpan sends the trimmed draft, Batal restores', async () => {
    const onEdit = vi.fn(() => Promise.resolve(null));
    setup(comment({ canEdit: true, canDelete: true }), { onEdit });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const box = screen.getByLabelText('Edit komentar');
    expect(box).toHaveValue('komentar utama');
    await waitFor(() => expect(box).toHaveFocus());
    expect(screen.getByText('14/500')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: ' komentar diperbaiki ' } });
    expect(screen.getByText('21/500')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Batal' }));
    expect(screen.queryByLabelText('Edit komentar')).toBeNull();
    expect(screen.getByText('komentar utama')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: /Aksi lainnya/ })).toHaveFocus());
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit komentar'), { target: { value: ' baru ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(screen.queryByLabelText('Edit komentar')).toBeNull());
    expect(onEdit).toHaveBeenCalledWith(comment().id, 'baru');
    await waitFor(() => expect(screen.getByRole('button', { name: /Aksi lainnya/ })).toHaveFocus());
  });

  it('a failed save keeps the editor and the draft, shows the message, and can be retried', async () => {
    const onEdit = vi
      .fn<(id: string, body: string) => Promise<string | null>>()
      .mockResolvedValueOnce('Komentar tidak ditemukan.')
      .mockResolvedValueOnce(null);
    setup(comment({ canEdit: true }), { onEdit });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Edit komentar'), { target: { value: 'draf saya' } });
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Komentar tidak ditemukan.');
    expect(screen.getByLabelText('Edit komentar')).toHaveValue('draf saya');
    expect(screen.getByRole('button', { name: 'Simpan' })).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Edit komentar'), { target: { value: 'draf saya 2' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Simpan' }));
    await waitFor(() => expect(screen.queryByLabelText('Edit komentar')).toBeNull());
    expect(onEdit).toHaveBeenCalledTimes(2);
  });

  it('Sematkan asks to pin; a pinned comment offers Lepas sematan', () => {
    const onPin = vi.fn();
    const { unmount } = render(
      <CommentThread
        comment={comment({ canPin: true })}
        postId="p1"
        path="/x"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={onPin}
        onReply={vi.fn()}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sematkan' }));
    expect(onPin).toHaveBeenCalledWith(comment().id, true);
    unmount();
    const onUnpin = vi.fn();
    setup(comment({ canPin: true, pinned: true }), { onPin: onUnpin });
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Lepas sematan' }));
    expect(onUnpin).toHaveBeenCalledWith(comment().id, false);
  });

  it('a reply row has no pin item, and a deleted placeholder has no menu', () => {
    setup(
      comment({
        replyCount: 1,
        replies: [reply(1, { canDelete: true, canPin: true })],
        canEdit: true,
        canDelete: true,
        canPin: true,
        deleted: true,
        body: '',
        author: { displayName: '' },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 balasan' }));
    expect(screen.getAllByRole('button', { name: /Aksi lainnya/ })).toHaveLength(1);
    openMenu();
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Hapus']);
  });

  it('Balas on a reply starts a reply under the top-level comment', () => {
    const onReply = vi.fn();
    render(
      <CommentThread
        comment={comment({ replyCount: 1, replies: [reply(1)] })}
        postId="p1"
        path="/ana/posts/p1"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={onReply}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lihat 1 balasan' }));
    const balas = screen.getAllByRole('button', { name: 'Balas' });
    fireEvent.click(balas[1]!);
    expect(onReply).toHaveBeenLastCalledWith(comment().id, 'Penjawab 1');
    fireEvent.click(balas[0]!);
    expect(onReply).toHaveBeenLastCalledWith(comment().id, 'Ana Putri');
  });

  it('loads the remaining replies after the last loaded one, then hides the button', async () => {
    const onMoreReplies = vi.fn();
    const more = reply(4);
    const fetchMock = vi.fn(() =>
      Promise.resolve(Response.json({ items: [more], nextCursor: null, canComment: true })),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <CommentThread
        comment={comment({ replyCount: 4, replies: [reply(1), reply(2), reply(3)] })}
        postId="p1"
        path="/ana/posts/p1"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={vi.fn()}
        onMoreReplies={onMoreReplies}
      />,
      { wrapper: Toaster },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lihat 4 balasan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lihat balasan lainnya' }));
    await waitFor(() => expect(onMoreReplies).toHaveBeenCalledWith(comment().id, [more]));
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/posts/p1/comments/${comment().id}/replies?cursor=${reply(3).id}`,
    );
    expect(screen.queryByRole('button', { name: 'Lihat balasan lainnya' })).toBeNull();
    vi.unstubAllGlobals();
  });

  it('shows an error and keeps the button when more replies fail to load', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(null, { status: 500 })));
    render(
      <CommentThread
        comment={comment({ replyCount: 2, replies: [reply(1)] })}
        postId="p1"
        path="/ana/posts/p1"
        loggedIn
        canReply
        pending={false}
        onDelete={vi.fn()}
        onEdit={vi.fn()}
        onPin={vi.fn()}
        onReply={vi.fn()}
        onMoreReplies={vi.fn()}
      />,
      { wrapper: Toaster },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Lihat 2 balasan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lihat balasan lainnya' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Gagal memuat balasan');
    expect(screen.getByRole('button', { name: 'Lihat balasan lainnya' })).toBeEnabled();
    vi.unstubAllGlobals();
  });
});
