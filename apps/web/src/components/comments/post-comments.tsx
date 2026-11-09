'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  API_PREFIX,
  errorResponseSchema,
  POST_COMMENT_MAX_LENGTH,
  type PostComment,
  type PostCommentList,
  postCommentListSchema,
  postCommentSchema,
  type PostReply,
  postReplySchema,
} from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useToast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loginHref } from '@/lib/login-href';
import { useKeyboardInset } from '@/lib/use-keyboard-inset';
import { cn } from '@/lib/utils';
import { CommentThread } from './comment-thread';

type Props = {
  postId: string;
  /** This post's page, where login returns to. */
  path: string;
  initial: PostCommentList;
  loggedIn: boolean;
  /** `page`: the composer is a fixed bar above the bottom nav. `sheet`: inline under the list (inside a sheet). */
  variant?: 'page' | 'sheet';
  /** Keeps a count outside (card, sheet title) in step: +1 after a post, -1 after a delete. */
  onCountChange?: (delta: 1 | -1) => void;
};

const FAILED = 'Gagal menyimpan. Coba lagi.';

/** API error message (Bahasa) when the body has one, e.g. the rate-limit text. */
async function errorMessage(res: Response): Promise<string> {
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : FAILED;
}

/**
 * Local result of a delete. A top-level comment that still has replies stays as a "Komentar dihapus"
 * placeholder (its text dropped); one without replies, and any reply, leaves the list.
 */
function removeComment(list: PostComment[], id: string): PostComment[] {
  return list.flatMap((c) => {
    if (c.id === id) {
      const kept = (c.replies ?? []).length > 0 || (c.replyCount ?? 0) > 0;
      return kept
        ? [
            {
              ...c,
              deleted: true,
              body: '',
              author: { displayName: '' },
              pinned: false,
              canDelete: false,
              canEdit: false,
              canPin: false,
            },
          ]
        : [];
    }
    if (!c.replies?.some((r) => r.id === id)) return [c];
    const replies = c.replies.filter((r) => r.id !== id);
    return [{ ...c, replies, replyCount: Math.max(0, (c.replyCount ?? c.replies.length) - 1) }];
  });
}

/**
 * A new top-level comment has no likes and is the newest, so in Top order it sits right after the
 * liked ones (and after a pinned one), before the older zero-like comments.
 */
export function insertTopLevel(list: PostComment[], comment: PostComment): PostComment[] {
  const at = list.findIndex((c) => !c.pinned && (c.likeCount ?? 0) === 0);
  return at === -1 ? [...list, comment] : [...list.slice(0, at), comment, ...list.slice(at)];
}

/** Applies a saved edit to a top-level comment or one of its replies; every other field is kept. */
export function applyEdit(c: PostComment, saved: PostReply): PostComment {
  const change = { body: saved.body, editedAt: saved.editedAt };
  if (c.id === saved.id) return { ...c, ...change };
  if (!c.replies?.some((r) => r.id === saved.id)) return c;
  return { ...c, replies: c.replies.map((r) => (r.id === saved.id ? { ...r, ...change } : r)) };
}

/** Counts a new reply; shows it only when every earlier reply is loaded (else it arrives with "Lihat balasan lainnya"). */
function addReply(c: PostComment, reply: PostReply): PostComment {
  const replies = c.replies ?? [];
  const count = c.replyCount ?? replies.length;
  return {
    ...c,
    replyCount: count + 1,
    replies: replies.length >= count ? [...replies, reply] : replies,
  };
}

/** Local result of a pin: the target leads with `pinned`, every other comment loses its pin. An unpin keeps the order. */
function applyPin(list: PostComment[], id: string, pin: boolean): PostComment[] {
  if (!pin) return list.map((c) => (c.id === id ? { ...c, pinned: false } : c));
  const target = list.find((c) => c.id === id);
  if (!target) return list;
  return [
    { ...target, pinned: true },
    ...list.filter((c) => c.id !== id).map((c) => ({ ...c, pinned: false })),
  ];
}

/** Comments (US-052): plain text only. The API enforces who may read, write and delete. */
export function PostComments({
  postId,
  path,
  initial,
  loggedIn,
  variant = 'page',
  onCountChange,
}: Props) {
  const toast = useToast();
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [replyTo, setReplyTo] = useState<{ topId: string; name: string } | null>(null);
  const [replied, setReplied] = useState({ id: '', n: 0 });
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const inset = useKeyboardInset(focused);
  const fixed = variant === 'page';
  const base = `/${API_PREFIX}/posts/${postId}/comments`;

  async function run(action: () => Promise<Response | null>) {
    setPending(true);
    setError(null);
    try {
      const res = await action();
      if (res && !res.ok) setError(await errorMessage(res));
    } catch {
      setError(FAILED);
    }
    setPending(false);
  }

  const submit = () =>
    run(async () => {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body, ...(replyTo && { parentId: replyTo.topId }) }),
      });
      if (!res.ok) return res;
      const comment = postCommentSchema.parse(await res.json());
      setBody('');
      if (replyTo) {
        const { topId } = replyTo;
        setItems((list) => list.map((c) => (c.id === topId ? addReply(c, comment) : c)));
        setReplied((r) => ({ id: topId, n: r.n + 1 }));
        setReplyTo(null);
      } else {
        // Top order: with more pages unloaded the new comment's place is not on screen, so only say it was sent.
        if (nextCursor === null) setItems((list) => insertTopLevel(list, comment));
        setSentNote(nextCursor !== null);
      }
      onCountChange?.(1);
      return null;
    });

  /** Own error line in the editor, so it does not use run(). 404/403 show the API message. */
  const edit = async (id: string, text: string): Promise<string | null> => {
    try {
      const res = await fetch(`${base}/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) return await errorMessage(res);
      const saved = postReplySchema.parse(await res.json());
      setItems((list) => list.map((c) => applyEdit(c, saved)));
      return null;
    } catch {
      return FAILED;
    }
  };

  const pin = (id: string, next: boolean) =>
    run(async () => {
      const res = await fetch(`${base}/${id}/pin`, { method: next ? 'PUT' : 'DELETE' });
      if (!res.ok) return res;
      setItems((list) => applyPin(list, id, next));
      toast(next ? 'Komentar disematkan' : 'Sematan dilepas');
      return null;
    });

  const remove = (id: string) =>
    run(async () => {
      const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) return res;
      setItems((list) => removeComment(list, id));
      onCountChange?.(-1);
      return null;
    });

  const loadMore = () =>
    run(async () => {
      const res = await fetch(`${base}?cursor=${encodeURIComponent(nextCursor ?? '')}`);
      if (!res.ok) return res;
      const page = postCommentListSchema.parse(await res.json());
      setItems((list) => [...list, ...page.items]);
      setNextCursor(page.nextCursor);
      return null;
    });

  const hasComposer = initial.canComment || !loggedIn;
  const errorEl = error && (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  );

  return (
    <div className={cn('flex flex-col gap-4', fixed && hasComposer && 'pb-40')}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada komentar.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((c) => (
            <li key={c.id}>
              <CommentThread
                comment={c}
                postId={postId}
                path={path}
                loggedIn={loggedIn}
                canReply={initial.canComment || !loggedIn}
                pending={pending}
                onDelete={setConfirmId}
                onEdit={edit}
                onPin={(id, next) => void pin(id, next)}
                onReply={(topId, name) => {
                  setReplyTo({ topId, name });
                  composerRef.current?.focus();
                }}
                onMoreReplies={(topId, more) =>
                  setItems((list) =>
                    list.map((t) =>
                      t.id === topId
                        ? {
                            ...t,
                            replies: [
                              ...(t.replies ?? []),
                              ...more.filter((r) => !t.replies?.some((x) => x.id === r.id)),
                            ],
                          }
                        : t,
                    ),
                  )
                }
                openToken={replied.id === c.id ? replied.n : 0}
              />
            </li>
          ))}
        </ul>
      )}
      {nextCursor !== null && (
        <Button
          variant="outline"
          className="w-fit"
          disabled={pending}
          onClick={() => void loadMore()}
        >
          Muat lebih banyak
        </Button>
      )}
      {hasComposer && (
        <div
          style={
            fixed
              ? { bottom: inset > 0 ? inset : loggedIn ? 'var(--bottom-nav-height)' : 0 }
              : undefined
          }
          className={cn(
            'flex flex-col gap-2',
            fixed && 'fixed inset-x-0 z-30 mx-auto w-full max-w-feed border-t bg-card px-4 py-2',
          )}
        >
          {initial.canComment ? (
            <form
              className="flex flex-col gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              {replyTo && (
                <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">
                    Membalas <span className="font-semibold">{replyTo.name}</span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label="Batalkan balasan"
                    onClick={() => setReplyTo(null)}
                  >
                    ✕
                  </Button>
                </p>
              )}
              <Label htmlFor="comment-body" className="sr-only">
                {replyTo ? `Tulis balasan untuk ${replyTo.name}` : 'Tulis komentar'}
              </Label>
              <Textarea
                id="comment-body"
                ref={composerRef}
                rows={1}
                className="max-h-28 min-h-11"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                value={body}
                maxLength={POST_COMMENT_MAX_LENGTH}
                onChange={(e) => {
                  setBody(e.target.value);
                  setSentNote(false);
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {body.length}/{POST_COMMENT_MAX_LENGTH}
                </span>
                <Button type="submit" disabled={pending || body.trim() === ''}>
                  Kirim
                </Button>
              </div>
              {sentNote && <p className="text-sm text-muted-foreground">Komentar terkirim.</p>}
            </form>
          ) : (
            !loggedIn && (
              <Link
                href={loginHref(path)}
                className="flex min-h-11 w-fit items-center text-sm font-semibold text-foreground underline-offset-4 hover:underline"
              >
                Masuk untuk berkomentar
              </Link>
            )
          )}
          {errorEl}
        </div>
      )}
      {!hasComposer && errorEl}
      <BottomSheet
        title="Hapus komentar ini?"
        description="Komentar akan dihapus dan tidak bisa dikembalikan."
        open={confirmId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmId(null);
        }}
      >
        <Button
          variant="destructive"
          disabled={pending}
          onClick={() => {
            const id = confirmId;
            setConfirmId(null);
            if (id) void remove(id);
          }}
        >
          Hapus
        </Button>
        <Button variant="outline" onClick={() => setConfirmId(null)}>
          Batal
        </Button>
      </BottomSheet>
    </div>
  );
}
