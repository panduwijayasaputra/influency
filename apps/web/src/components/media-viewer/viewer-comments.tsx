'use client';

import { useEffect, useState } from 'react';
import { API_PREFIX, type PostCommentList, postCommentListSchema } from '@influency/shared';
import { PostComments } from '@/app/(public)/[creatorSlug]/posts/[postId]/post-comments';
import type { PostCardCreator, PostCardPost } from '@/components/post-card/post-card';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';

type State =
  { kind: 'loading' | 'forbidden' | 'failed' } | { kind: 'ready'; list: PostCommentList };

async function load(postId: string): Promise<State> {
  try {
    const res = await fetch(`/${API_PREFIX}/posts/${postId}/comments`, { cache: 'no-store' });
    if (res.status === 403) return { kind: 'forbidden' };
    const parsed = postCommentListSchema.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? { kind: 'ready', list: parsed.data } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

/** The post's comments in a ~40% sheet over the viewer. The comments feature replaces it later. */
export function ViewerComments({
  post,
  creator,
  open,
  onOpenChange,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  // Tagged with the request it answers, so a stale or older result reads as loading (no setState in the effect body).
  const [result, setResult] = useState<{ key: string; state: State } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${post.id}:${attempt}`;
  const state: State = result?.key === key ? result.state : { kind: 'loading' };
  useEffect(() => {
    if (!open) return;
    let live = true;
    void load(post.id).then((next) => live && setResult({ key, state: next }));
    return () => {
      live = false;
    };
  }, [open, post.id, key]);

  return (
    <BottomSheet title="Komentar" open={open} onOpenChange={onOpenChange} className="h-[40dvh]">
      {state.kind === 'loading' && (
        <p className="text-sm text-muted-foreground">Memuat komentar…</p>
      )}
      {state.kind === 'forbidden' && (
        <p className="text-sm text-muted-foreground">
          Buka post ini untuk melihat dan menulis komentar.
        </p>
      )}
      {state.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Gagal memuat komentar.</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Coba lagi
          </Button>
        </div>
      )}
      {state.kind === 'ready' && (
        <PostComments
          postId={post.id}
          path={`/${creator.slug}/posts/${post.id}`}
          initial={state.list}
          loggedIn={post.viewer !== null}
          variant="sheet"
        />
      )}
    </BottomSheet>
  );
}
