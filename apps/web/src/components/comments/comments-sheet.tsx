'use client';

import { Lock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_PREFIX, type PostCommentList, postCommentListSchema } from '@influency/shared';
import Link from 'next/link';
import type { PostCardCreator, PostCardPost } from '@/components/post-card/post-card';
import { PostComments } from '@/components/comments/post-comments';
import { PostUnlockSheet } from '@/components/purchase-sheet';
import { SubscribeSheet } from '@/components/subscription-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
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
  onUnlocked,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size: 'compact' | 'tall';
  /** Shown in the title; the parent adjusts it through `onCountChange`. */
  count: number;
  onCountChange?: (delta: 1 | -1) => void;
  /** After an unlock from the locked view, so the owner re-renders the post. */
  onUnlocked?: () => void;
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
        <LockedComments
          post={post}
          creator={creator}
          path={path}
          guest={post.viewer === null}
          onUnlocked={onUnlocked}
        />
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
  onUnlocked,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  path: string;
  guest: boolean;
  onUnlocked?: () => void;
}) {
  const unlock = `Buka post · ${post.offer?.priceCoins ?? 0} Koin`;
  // No plan known (Home feed) or none offered: no Langganan CTA.
  const plan = creator.plan ?? null;
  const subscribe = plan && `Langganan · ${plan.priceCoins} Koin / ${plan.durationDays} hari`;
  return (
    <div className="flex flex-col items-center gap-3 px-3 py-6 text-center [&>*]:w-full">
      <span className="flex size-18 items-center justify-center self-center rounded-3xl bg-accent text-primary-ink">
        <Lock aria-hidden className="size-8" />
      </span>
      <div className="flex flex-col items-center gap-3">
        <p className="text-[19px] font-extrabold">Komentar khusus pendukung</p>
        <p className="max-w-72 text-[14.5px] leading-normal text-muted-foreground">
          Hanya yang punya akses ke post premium ini yang bisa membaca dan ikut berkomentar.
        </p>
      </div>
      {guest ? (
        <>
          <Button asChild className="h-13">
            <Link href={loginHref(path)}>{unlock}</Link>
          </Button>
          {subscribe && (
            <Button asChild variant="outline" className="h-12">
              <Link href={loginHref(path)}>{subscribe}</Link>
            </Button>
          )}
        </>
      ) : (
        <>
          <PostUnlockSheet
            post={post}
            creatorName={creator.displayName}
            returnPath={path}
            onUnlocked={() => onUnlocked?.()}
            trigger={<Button className="h-12">{unlock}</Button>}
          />
          {plan && (
            <SubscribeSheet
              slug={creator.slug}
              creatorName={creator.displayName}
              plan={plan}
              returnPath={path}
              trigger={
                <Button variant="outline" className="h-12">
                  {subscribe}
                </Button>
              }
            />
          )}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Komentar, nama, dan avatar tidak dimuat sampai kamu punya akses.
      </p>
    </div>
  );
}
