'use client';

import { Heart } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { API_PREFIX, type PublicPostDetail, postLikeResponseSchema } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { loginHref } from '@/lib/login-href';
import { cn } from '@/lib/utils';

type Props = {
  postId: string;
  /** This post's page, where login returns to. */
  path: string;
  likeCount: number;
  viewer: PublicPostDetail['viewer'];
};

/** Like toggle (US-051). Logged out → login link; cannot like → count only. The API enforces the rule. */
export function LikeButton({ postId, path, likeCount, viewer }: Props) {
  const [liked, setLiked] = useState(viewer?.liked ?? false);
  const [count, setCount] = useState(likeCount);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const content = (
    <>
      <Heart aria-hidden className={cn('size-4', liked && 'fill-current text-primary')} />
      <span>{count}</span>
    </>
  );

  if (!viewer) {
    return (
      <Link
        href={loginHref(path)}
        aria-label={`Masuk untuk menyukai · ${count} suka`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        {content}
      </Link>
    );
  }
  if (!viewer.canLike) {
    return (
      <p
        aria-label={`${count} suka`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground"
      >
        {content}
      </p>
    );
  }

  async function toggle() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch(`/${API_PREFIX}/posts/${postId}/like`, {
        method: liked ? 'DELETE' : 'PUT',
      });
      if (res.ok) {
        const body = postLikeResponseSchema.parse(await res.json());
        setLiked(body.liked);
        setCount(body.likeCount);
        setPending(false);
        return;
      }
    } catch {
      // Network or parse error: fall through to the message.
    }
    setPending(false);
    setFailed(true);
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        aria-pressed={liked}
        aria-label={`${liked ? 'Batal suka' : 'Suka'} · ${count} suka`}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {content}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Gagal menyimpan. Coba lagi.
        </p>
      )}
    </div>
  );
}
