'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { setCommentLike } from '@/lib/api/comment-likes';
import { loginHref } from '@/lib/login-href';
import { cn } from '@/lib/utils';

const BASE =
  'flex min-h-11 min-w-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/**
 * Heart on a comment. Live only once the comment carries `likeCount` (US-018); before that it says
 * "Segera hadir". A guest goes to login. The API decides who may like.
 */
export function CommentLikeButton({
  postId,
  commentId,
  path,
  likeCount,
  liked: initialLiked = false,
  loggedIn,
}: {
  postId: string;
  commentId: string;
  /** This post's page, where login returns to. */
  path: string;
  likeCount?: number;
  liked?: boolean;
  loggedIn: boolean;
}) {
  const toast = useToast();
  const [state, setState] = useState({ liked: initialLiked, count: likeCount ?? 0 });
  const [pending, setPending] = useState(false);
  const { liked, count } = state;
  const heart = (
    <>
      <Heart aria-hidden className={cn('size-4', liked && 'fill-current text-brand')} />
      {likeCount !== undefined && <span>{count}</span>}
    </>
  );

  if (!loggedIn) {
    return (
      <Link
        href={loginHref(path)}
        aria-label={`Masuk untuk menyukai · ${count} suka`}
        className={BASE}
      >
        {heart}
      </Link>
    );
  }
  if (likeCount === undefined) {
    return (
      <button
        type="button"
        aria-label="Suka komentar"
        className={BASE}
        onClick={() => toast('Segera hadir')}
      >
        {heart}
      </button>
    );
  }

  async function toggle() {
    const before = state;
    setPending(true);
    setState({ liked: !before.liked, count: before.count + (before.liked ? -1 : 1) });
    const result = await setCommentLike(postId, commentId, !before.liked);
    if (result) setState({ liked: result.liked, count: result.likeCount });
    else {
      setState(before);
      toast('Gagal menyukai komentar. Coba lagi.');
    }
    setPending(false);
  }

  return (
    <button
      type="button"
      aria-pressed={liked}
      aria-label={`${liked ? 'Batal suka komentar' : 'Suka komentar'} · ${count}`}
      disabled={pending}
      className={BASE}
      onClick={() => void toggle()}
    >
      {heart}
    </button>
  );
}
