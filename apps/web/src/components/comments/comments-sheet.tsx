'use client';

import { useEffect, useState } from 'react';
import { API_PREFIX, type PostCommentList, postCommentListSchema } from '@influency/shared';
import Link from 'next/link';
import type { PostCardCreator, PostCardPost } from '@/components/post-card/post-card';
import { PostComments } from '@/components/comments/post-comments';
import { PostUnlockSheet, SubscribeSheet } from '@/components/purchase-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { DEMO_SUBSCRIPTION } from '@/lib/demo';
import { loginHref } from '@/lib/login-href';

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

/** The post's comments in a bottom sheet: compact (~40%) over the viewer, tall (~85%) from a PostCard. */
export function CommentsSheet({
  post,
  creator,
  open,
  onOpenChange,
  size,
  count,
  onCountChange,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size: 'compact' | 'tall';
  /** Shown in the title; the parent adjusts it through `onCountChange`. */
  count: number;
  onCountChange?: (delta: 1 | -1) => void;
}) {
  const locked = post.access === 'locked';
  const path = `/${creator.slug}/posts/${post.id}`;
  // Tagged with the request it answers, so a stale or older result reads as loading (no setState in the effect body).
  const [result, setResult] = useState<{ key: string; state: State } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${post.id}:${attempt}`;
  const state: State = result?.key === key ? result.state : { kind: 'loading' };
  useEffect(() => {
    // A locked post never asks for comments: the server would refuse, and nothing may leak.
    if (!open || locked) return;
    let live = true;
    void load(post.id).then((next) => live && setResult({ key, state: next }));
    return () => {
      live = false;
    };
  }, [open, locked, post.id, key]);

  return (
    <BottomSheet
      title={locked ? 'Komentar' : `Komentar · ${count}`}
      open={open}
      onOpenChange={onOpenChange}
      className={size === 'compact' ? 'h-[40dvh]' : 'h-[85dvh]'}
    >
      {locked && (
        <LockedComments post={post} creator={creator} path={path} guest={post.viewer === null} />
      )}
      {!locked && state.kind === 'loading' && (
        <p className="text-sm text-muted-foreground">Memuat komentar…</p>
      )}
      {!locked && state.kind === 'forbidden' && (
        <p className="text-sm text-muted-foreground">
          Buka post ini untuk melihat dan menulis komentar.
        </p>
      )}
      {!locked && state.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-sm text-muted-foreground">Gagal memuat komentar.</p>
          <Button variant="outline" size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Coba lagi
          </Button>
        </div>
      )}
      {!locked && state.kind === 'ready' && (
        <PostComments
          postId={post.id}
          path={path}
          initial={state.list}
          loggedIn={post.viewer !== null}
          variant="sheet"
          onCountChange={onCountChange}
        />
      )}
    </BottomSheet>
  );
}

/** Locked premium post: no comments, names or avatars are loaded (UX spec §7.2); only the ways to get access. */
function LockedComments({
  post,
  creator,
  path,
  guest,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  path: string;
  guest: boolean;
}) {
  const unlock = `Buka post · ${post.offer?.priceCoins ?? 0} Koin`;
  const { priceCoins, days } = DEMO_SUBSCRIPTION;
  const subscribe = `Langganan · ${priceCoins} Koin / ${days} hari`;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="font-bold">Komentar khusus pendukung</p>
        <p className="text-sm text-muted-foreground">
          Hanya yang punya akses ke post premium ini yang bisa membaca dan ikut berkomentar.
        </p>
      </div>
      {guest ? (
        <>
          <Button asChild className="h-12">
            <Link href={loginHref(path)}>{unlock}</Link>
          </Button>
          <Button asChild variant="outline" className="h-12">
            <Link href={loginHref(path)}>{subscribe}</Link>
          </Button>
        </>
      ) : (
        <>
          <PostUnlockSheet
            post={post}
            creatorName={creator.displayName}
            trigger={<Button className="h-12">{unlock}</Button>}
          />
          <SubscribeSheet
            creatorName={creator.displayName}
            trigger={
              <Button variant="outline" className="h-12">
                {subscribe}
              </Button>
            }
          />
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Komentar, nama, dan avatar tidak dimuat sampai kamu punya akses.
      </p>
    </div>
  );
}
