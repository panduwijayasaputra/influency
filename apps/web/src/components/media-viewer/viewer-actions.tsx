'use client';

import { Coins, MessageCircle } from 'lucide-react';
import Link from 'next/link';
import { Share2 } from 'lucide-react';
import { ShareButton } from '@/app/(public)/[creatorSlug]/share-button';
import { LikeButton } from '@/components/like-button';
import type { PostCardCreator, PostCardPost } from '@/components/post-card/post-card';
import { useToast } from '@/components/ui/toast';
import { loginHref } from '@/lib/login-href';

const BUTTON =
  'flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-semibold text-white hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

type Props = {
  post: PostCardPost;
  creator: PostCardCreator;
  like: { liked: boolean; count: number };
  onLikeChange: (next: { liked: boolean; count: number }) => void;
  onOpenComments: () => void;
};

/** Suka · Komentar · Bagikan · Kirim Tip under the full-screen media (US-013). */
export function ViewerActions({ post, creator, like, onLikeChange, onOpenComments }: Props) {
  const toast = useToast();
  const postHref = `/${creator.slug}/posts/${post.id}`;
  return (
    <div
      role="toolbar"
      aria-label="Aksi post"
      className="flex shrink-0 items-center justify-around bg-black px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom))]"
    >
      <LikeButton
        postId={post.id}
        path={postHref}
        likeCount={like.count}
        viewer={post.viewer && { ...post.viewer, liked: like.liked }}
        onChange={onLikeChange}
        className="text-white hover:bg-white/15 hover:text-white"
      />
      <button
        type="button"
        aria-label={`Komentar, ${post.commentCount}`}
        onClick={onOpenComments}
        className={BUTTON}
      >
        <MessageCircle aria-hidden className="size-5" />
        {post.commentCount}
      </button>
      {post.viewer === null ? (
        <Link href={loginHref(postHref)} aria-label="Bagikan" className={BUTTON}>
          <Share2 aria-hidden className="size-5" />
        </Link>
      ) : (
        <ShareButton
          title={creator.displayName}
          url={postHref}
          label="Bagikan post"
          className={BUTTON}
        />
      )}
      <button type="button" onClick={() => toast('Segera hadir')} className={BUTTON}>
        <Coins aria-hidden className="size-5" />
        Kirim Tip
      </button>
    </div>
  );
}
