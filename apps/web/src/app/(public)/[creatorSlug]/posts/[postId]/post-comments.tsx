'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  API_PREFIX,
  errorResponseSchema,
  POST_COMMENT_MAX_LENGTH,
  type PostCommentList,
  postCommentListSchema,
  postCommentSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loginHref } from '@/lib/login-href';
import { POST_DATE } from '../../premium-cover';

type Props = {
  postId: string;
  /** This post's page, where login returns to. */
  path: string;
  initial: PostCommentList;
  loggedIn: boolean;
};

const FAILED = 'Gagal menyimpan. Coba lagi.';

/** API error message (Bahasa) when the body has one, e.g. the rate-limit text. */
async function errorMessage(res: Response): Promise<string> {
  const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
  return parsed.success ? parsed.data.error.message : FAILED;
}

/** Comments (US-052): plain text only. The API enforces who may read, write and delete. */
export function PostComments({ postId, path, initial, loggedIn }: Props) {
  const [items, setItems] = useState(initial.items);
  const [nextCursor, setNextCursor] = useState(initial.nextCursor);
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState(false);
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
        body: JSON.stringify({ body }),
      });
      if (!res.ok) return res;
      const comment = postCommentSchema.parse(await res.json());
      setBody('');
      // Oldest first: with more pages unloaded, the new comment belongs at the very end, not here.
      if (nextCursor === null) setItems((list) => [...list, comment]);
      setSentNote(nextCursor !== null);
      return null;
    });

  const remove = (id: string) =>
    run(async () => {
      if (!window.confirm('Hapus komentar ini?')) return null;
      const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) return res;
      setItems((list) => list.filter((c) => c.id !== id));
      return null;
    });

  const loadMore = () =>
    run(async () => {
      const res = await fetch(`${base}?cursor=${nextCursor}`);
      if (!res.ok) return res;
      const page = postCommentListSchema.parse(await res.json());
      setItems((list) => [...list, ...page.items]);
      setNextCursor(page.nextCursor);
      return null;
    });

  return (
    <div className="flex flex-col gap-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada komentar.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-medium">{c.author.displayName}</span>
                  <span className="text-muted-foreground">
                    {' · '}
                    {POST_DATE.format(new Date(c.createdAt))}
                  </span>
                </p>
                {c.canDelete && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Hapus komentar"
                    disabled={pending}
                    onClick={() => void remove(c.id)}
                  >
                    Hapus
                  </Button>
                )}
              </div>
              {/* Plain text: React escapes it; never render comments as HTML or markdown. */}
              <p className="wrap-break-word whitespace-pre-wrap">{c.body}</p>
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
      {initial.canComment ? (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor="comment-body">Tulis komentar</Label>
          <Textarea
            id="comment-body"
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
            className="w-fit text-sm font-medium text-primary hover:underline"
          >
            Masuk untuk berkomentar
          </Link>
        )
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
