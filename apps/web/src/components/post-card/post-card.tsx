'use client';

import {
  Bookmark,
  Coins,
  Flag,
  Lock,
  LockOpen,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Share2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import { useState } from 'react';
import type { CreatorSubscriptionState, PublicPost } from '@influency/shared';
import { ShareButton } from '@/app/(public)/[creatorSlug]/share-button';
import { CommentsSheet } from '@/components/comments/comments-sheet';
import { ExpandableText } from '@/components/expandable-text';
import { LikeButton } from '@/components/like-button';
import { ReportPostButton } from '@/components/report-post-button';
import { TipSheet } from '@/components/tip-sheet';
import { SaveButton } from '@/components/save-button';
import { useToast } from '@/components/ui/toast';
import { fetchPublicPost } from '@/lib/api/purchases';
import { loginHref } from '@/lib/login-href';
import { formatRelativeTime } from '@/lib/relative-time';
import { initials } from '@/lib/utils';
import { PostMedia, UnlockCta } from './post-media';

/** A feed post or a post-page post (whose `publishedAt` is null for a never-published post). */
export type PostCardPost = Omit<PublicPost, 'publishedAt'> & { publishedAt: string | null };

export type PostCardCreator = {
  slug: string;
  displayName: string;
  avatarUrl: string | null;
  /** The creator's Langganan plan when the page knows it (profile, post page); the Home feed does not. */
  plan?: CreatorSubscriptionState['plan'];
};

const ICON =
  'flex size-11 items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';
const MENU_ITEM =
  'flex h-11 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-semibold outline-none select-none data-highlighted:bg-muted';

/** A post in a feed (US-008): header, media (carousel / locked preview), actions, caption. */
export function PostCard({
  post: initialPost,
  creator,
  detail = false,
  linkCreator = false,
  editHref,
}: {
  post: PostCardPost;
  creator: PostCardCreator;
  /** Only the creator's own profile passes this: adds "Edit" to the menu (opens the studio editor). */
  editHref?: string;
  /** Home feed: the creator's avatar and name open their profile (it is the current page everywhere else). */
  linkCreator?: boolean;
  /** The post's own page: full caption, Komentar scrolls to the comments below, login returns to the post. */
  detail?: boolean;
}) {
  const toast = useToast();
  const router = useRouter();
  // Replaced by the server's answer after an unlock, so the card flips to its media without a full reload.
  const [post, setPost] = useState(initialPost);
  // A newer server render (router.refresh after a subscribe) replaces the local copy.
  const [seen, setSeen] = useState(initialPost);
  if (seen !== initialPost) {
    setSeen(initialPost);
    setPost(initialPost);
  }
  async function refreshPost() {
    try {
      setPost(await fetchPublicPost(creator.slug, initialPost.id));
    } catch {
      router.refresh();
    }
  }
  const [reporting, setReporting] = useState(false);
  // Shared with the full-screen viewer's Suka so both show the same state.
  const [like, setLike] = useState({ liked: post.viewer?.liked ?? false, count: post.likeCount });
  // Mounted on first open only, so a feed of cards does not mount a dialog per card.
  const [comments, setComments] = useState<{ opened: boolean; open: boolean }>({
    opened: false,
    open: false,
  });
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const guest = post.viewer === null;
  const path = `/${creator.slug}`;
  const postHref = `${path}/posts/${post.id}`;
  const returnPath = detail ? postHref : path;
  const login = loginHref(returnPath);
  const postUrl = () => `${window.location.origin}${postHref}`;
  // The server decides (premium, accessible, not the viewer's own post).
  const canTip = post.viewer?.canTip === true;

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

  const creatorBlock = (
    <>
      {creator.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
        <img src={creator.avatarUrl} alt="" className="size-10 rounded-full object-cover" />
      ) : (
        <span
          aria-hidden
          className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
        >
          {initials(creator.displayName)}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] leading-tight font-extrabold">{creator.displayName}</p>
        <p className="truncate text-[12.5px] text-muted-foreground">
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
    </>
  );

  return (
    <article
      aria-label={`Post oleh ${creator.displayName}`}
      className="flex flex-col gap-3 border-y bg-card pt-3 pb-1.5"
    >
      <header className="flex items-center gap-2 pr-1.5 pl-4">
        {linkCreator ? (
          <Link
            href={path}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {creatorBlock}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">{creatorBlock}</div>
        )}
        {post.visibility === 'PREMIUM' && (
          <span
            className={`flex h-6 shrink-0 items-center gap-1 rounded-xl px-2 text-[11.5px] font-extrabold ${post.access === 'locked' ? 'bg-accent text-accent-foreground' : 'bg-success-surface text-success'}`}
          >
            {post.access === 'locked' ? (
              <Lock aria-hidden className="size-3" />
            ) : (
              <LockOpen aria-hidden className="size-3" />
            )}
            {post.access === 'locked' ? 'Premium' : 'Terbuka'}
          </span>
        )}
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
              {editHref && (
                <DropdownMenu.Item asChild className={MENU_ITEM}>
                  <Link href={editHref}>
                    <Pencil aria-hidden className="size-4.5" />
                    Edit
                  </Link>
                </DropdownMenu.Item>
              )}
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

      {post.caption ? (
        <div className="px-4 text-[15px] leading-normal">
          <ExpandableText
            text={post.caption}
            href={detail ? undefined : postHref}
            expanded={detail}
          />
        </div>
      ) : (
        detail && <p className="px-4 text-[15px] text-muted-foreground">Tanpa caption</p>
      )}

      <PostMedia
        post={post}
        creator={creator}
        like={like}
        onLikeChange={setLike}
        postHref={postHref}
        loginUrl={login}
        detail={detail}
        onUnlocked={() => void refreshPost()}
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
          {detail ? (
            <Link
              href="#komentar"
              aria-label={`Komentar, ${commentCount}`}
              className="flex h-11 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MessageCircle aria-hidden className="size-5" />
              {commentCount}
            </Link>
          ) : (
            <button
              type="button"
              aria-label={`Komentar, ${commentCount}`}
              aria-haspopup="dialog"
              onClick={() => setComments({ opened: true, open: true })}
              className="flex h-11 items-center gap-1.5 rounded-full px-2 text-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <MessageCircle aria-hidden className="size-5" />
              {commentCount}
            </button>
          )}
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
            <SaveButton
              postId={post.id}
              initialSaved={post.viewer?.saved ?? false}
              className={ICON}
            />
          )}
        </div>
        {canTip && (
          <TipSheet
            creator={creator}
            postId={post.id}
            returnPath={postHref}
            trigger={
              <button
                type="button"
                className="mr-1.5 flex h-11 items-center gap-1.5 rounded-full border border-koin-border bg-koin-surface px-3.5 text-sm font-extrabold text-koin-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Coins aria-hidden className="size-5" />
                Kirim Tip
              </button>
            }
          />
        )}
      </div>

      {post.access === 'locked' && (
        <UnlockCta
          post={post}
          creatorName={creator.displayName}
          postHref={postHref}
          loginUrl={login}
          detail={detail}
          onUnlocked={() => void refreshPost()}
        />
      )}
      {comments.opened && (
        <CommentsSheet
          post={post}
          creator={creator}
          onUnlocked={() => void refreshPost()}
          open={comments.open}
          onOpenChange={(open) => setComments((c) => ({ ...c, open }))}
          size="tall"
          count={commentCount}
          onCountChange={(d) => setCommentCount((n) => n + d)}
        />
      )}
    </article>
  );
}
