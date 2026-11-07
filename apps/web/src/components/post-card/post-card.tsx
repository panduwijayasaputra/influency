'use client';

import { Bookmark, Coins, Flag, MessageCircle, MoreHorizontal, Share2 } from 'lucide-react';
import Link from 'next/link';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import type { PublicPost } from '@influency/shared';
import { ShareButton } from '@/app/(public)/[creatorSlug]/share-button';
import { ExpandableText } from '@/components/expandable-text';
import { LikeButton } from '@/components/like-button';
import { ReportPostButton } from '@/components/report-post-button';
import { useToast } from '@/components/ui/toast';
import { loginHref } from '@/lib/login-href';
import { formatRelativeTime } from '@/lib/relative-time';
import { initials } from '@/lib/utils';
import { PostMedia } from './post-media';

/** A feed post or a post-page post (whose `publishedAt` is null for a never-published post). */
export type PostCardPost = Omit<PublicPost, 'publishedAt'> & { publishedAt: string | null };

export type PostCardCreator = { slug: string; displayName: string; avatarUrl: string | null };

const ICON =
  'flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const MENU_ITEM =
  'flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold outline-none select-none data-highlighted:bg-muted';
const SOON = 'Segera hadir';

/** A post in a feed (US-008): header, media (carousel / locked preview), actions, caption. */
export function PostCard({
  post,
  creator,
  detail = false,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  /** The post's own page: full caption, Komentar scrolls to the comments below, login returns to the post. */
  detail?: boolean;
}) {
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  // Shared with the full-screen viewer's Suka so both show the same state.
  const [like, setLike] = useState({ liked: post.viewer?.liked ?? false, count: post.likeCount });
  const guest = post.viewer === null;
  const path = `/${creator.slug}`;
  const postHref = `${path}/posts/${post.id}`;
  const returnPath = detail ? postHref : path;
  const login = loginHref(returnPath);
  const postUrl = () => `${window.location.origin}${postHref}`;
  // canReport is false only on the viewer's own published post: never self-tip.
  const canTip =
    post.visibility === 'PREMIUM' && post.access === 'full' && post.viewer?.canReport === true;

  async function sharePost() {
    const url = postUrl();
    if (navigator.share) {
      await navigator.share({ title: creator.displayName, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url).then(
      () => toast('Tautan disalin'),
      () => {},
    );
  }

  return (
    <article aria-label={`Post oleh ${creator.displayName}`} className="flex flex-col gap-2 py-4">
      <header className="flex items-center gap-3 px-4">
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
          <img src={creator.avatarUrl} alt="" className="size-9 rounded-full object-cover" />
        ) : (
          <span
            aria-hidden
            className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-extrabold text-primary-foreground"
          >
            {initials(creator.displayName)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{creator.displayName}</p>
          <p className="truncate text-xs text-muted-foreground">
            @{creator.slug}
            {post.publishedAt && (
              <>
                {' · '}
                <time dateTime={post.publishedAt} suppressHydrationWarning>
                  {formatRelativeTime(post.publishedAt, new Date())}
                </time>
              </>
            )}
          </p>
        </div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger aria-label="Lainnya" className={ICON}>
            <MoreHorizontal aria-hidden className="size-5" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 flex w-48 flex-col rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
            >
              <DropdownMenu.Item className={MENU_ITEM} onSelect={() => void sharePost()}>
                <Share2 aria-hidden className="size-4.5" />
                Bagikan
              </DropdownMenu.Item>
              {guest ? (
                <DropdownMenu.Item asChild className={MENU_ITEM}>
                  <Link href={login}>
                    <Flag aria-hidden className="size-4.5" />
                    Laporkan
                  </Link>
                </DropdownMenu.Item>
              ) : (
                post.viewer?.canReport && (
                  <DropdownMenu.Item className={MENU_ITEM} onSelect={() => setReporting(true)}>
                    <Flag aria-hidden className="size-4.5" />
                    Laporkan
                  </DropdownMenu.Item>
                )
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </header>
      {/* Rendered outside the menu so the sheet survives the menu closing. */}
      {!guest && post.viewer?.canReport && (
        <ReportPostButton
          postId={post.id}
          path={postHref}
          viewer={post.viewer}
          open={reporting}
          onOpenChange={setReporting}
        />
      )}

      <PostMedia
        post={post}
        creator={creator}
        like={like}
        onLikeChange={setLike}
        postHref={postHref}
        loginUrl={login}
        detail={detail}
      />

      <div className="flex items-center px-2">
        <div className="flex flex-1 items-center">
          <div className="px-2">
            <LikeButton
              postId={post.id}
              path={returnPath}
              key={`${like.liked}:${like.count}`}
              likeCount={like.count}
              viewer={post.viewer && { ...post.viewer, liked: like.liked }}
              onChange={setLike}
            />
          </div>
          <Link
            href={detail ? '#komentar' : `${postHref}#komentar`}
            aria-label={`Komentar, ${post.commentCount}`}
            className="flex h-11 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <MessageCircle aria-hidden className="size-5" />
            {post.commentCount}
          </Link>
          {guest ? (
            <Link href={login} aria-label="Bagikan" className={ICON}>
              <Share2 aria-hidden className="size-5" />
            </Link>
          ) : (
            <ShareButton title={creator.displayName} url={postHref} label="Bagikan post" />
          )}
          {guest ? (
            <Link href={login} aria-label="Simpan" className={ICON}>
              <Bookmark aria-hidden className="size-5" />
            </Link>
          ) : (
            <button type="button" aria-label="Simpan" onClick={() => toast(SOON)} className={ICON}>
              <Bookmark aria-hidden className="size-5" />
            </button>
          )}
        </div>
        {canTip && (
          <button
            type="button"
            onClick={() => toast(SOON)}
            className="flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-bold text-koin-foreground hover:bg-koin-surface focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Coins aria-hidden className="size-5" />
            Kirim Tip
          </button>
        )}
      </div>

      {post.caption ? (
        <div className="px-4 text-sm">
          <ExpandableText
            text={post.caption}
            href={detail ? undefined : postHref}
            expanded={detail}
          />
        </div>
      ) : (
        detail && <p className="px-4 text-sm text-muted-foreground">Tanpa caption</p>
      )}
    </article>
  );
}
