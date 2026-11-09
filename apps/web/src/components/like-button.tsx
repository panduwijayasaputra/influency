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
  /** Called with the server's result after a toggle (a second button for the same post stays in sync). */
  onChange?: (next: { liked: boolean; count: number }) => void;
  className?: string;
};

/** Like toggle (US-051). Logged out → login link; cannot like → count only. The API enforces the rule. */
export function LikeButton({ postId, path, likeCount, viewer, onChange, className }: Props) {
  const [liked, setLiked] = useState(viewer?.liked ?? false);
  const [count, setCount] = useState(likeCount);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const content = (
    <>
      <Heart aria-hidden className={cn('size-4', liked && 'fill-current text-brand')} />
      <span>{count}</span>
    </>
  );

  if (!viewer) {
    return (
      <Link
        href={loginHref(path)}
        aria-label={`Masuk untuk menyukai · ${count} suka`}
        className={cn(
          'flex min-h-11 w-fit min-w-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground',
          className,
        )}
      >
        {content}
      </Link>
    );
  }
  if (!viewer.canLike) {
    return (
      <p
        aria-label={`${count} suka`}
        className={cn('flex w-fit items-center gap-1.5 text-sm text-muted-foreground', className)}
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
        onChange?.({ liked: body.liked, count: body.likeCount });
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
        className={className}
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
