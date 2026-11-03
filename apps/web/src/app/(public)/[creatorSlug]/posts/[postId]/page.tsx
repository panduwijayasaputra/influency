import { ArrowLeft, Lock, LockOpen } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import type { PublicPostDetail } from '@influency/shared';
import { LikeButton } from '@/components/like-button';
import { PostMediaViewer } from '@/components/post-media-viewer';
import { ReportPostButton } from '@/components/report-post-button';
import { Button } from '@/components/ui/button';
import { POST_STATUS_LABELS } from '@/app/studio/posts/labels';
import { getCurrentUser } from '@/lib/api/current-user';
import { getPostComments } from '@/lib/api/post-comments';
import { getPublicCreator } from '@/lib/api/public-creator';
import { getPublicPost } from '@/lib/api/public-post';
import { loginHref } from '@/lib/login-href';
import { POST_DATE, PremiumCover } from '../../premium-cover';
import { PostComments } from './post-comments';

type Props = { params: Promise<{ creatorSlug: string; postId: string }> };

// Same as the creator page: render once the (cached) profile is in, no page-level loading fallback.
// shortcut: a hidden post is a soft 404 (200 + noindex) because the post streams in Suspense; add a Proxy check if a real 404 status is needed.
export const instant = false;

// Built from the cached profile only: the post depends on the viewer's cookie and must not make metadata dynamic.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const creator = await getPublicCreator((await params).creatorSlug);
  if (!creator) notFound();
  return { title: `${creator.displayName} · Postingan` };
}

export default async function PostPage({ params }: Props) {
  const { creatorSlug, postId } = await params;
  const creator = await getPublicCreator(creatorSlug);
  if (!creator) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 pb-12">
      <Link
        href={`/${creator.slug}`}
        className="flex w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {creator.displayName}
      </Link>
      {/* Reads the session cookie (owner/entitled viewers get the full post), so it streams in uncached. */}
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat postingan…</p>}>
        <PostDetail slug={creator.slug} postId={postId} />
      </Suspense>
    </main>
  );
}

function mediaSummary({ imageCount, videoCount }: PublicPostDetail): string {
  return [imageCount && `${imageCount} foto`, videoCount && `${videoCount} video`]
    .filter(Boolean)
    .join(' · ');
}

export async function PostDetail({ slug, postId }: { slug: string; postId: string }) {
  const post = await getPublicPost(slug, postId);
  if (!post) notFound();
  const meta = [
    mediaSummary(post),
    post.publishedAt && POST_DATE.format(new Date(post.publishedAt)),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className="flex flex-col gap-3">
      {post.status !== 'PUBLISHED' && (
        <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {POST_STATUS_LABELS[post.status]} · tidak terlihat publik
        </p>
      )}
      {post.access === 'full' ? (
        <>
          {post.visibility === 'PREMIUM' && (
            <p className="flex w-fit items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <LockOpen aria-hidden className="size-3.5" />
              Sudah terbuka
            </p>
          )}
          {/* Media URLs are fetched in the browser after the access check; never in this HTML. */}
          <PostMediaViewer postId={post.id} />
        </>
      ) : (
        <PremiumCover previewUrl={post.previewUrl} />
      )}
      {post.caption ? (
        <p className="wrap-break-word whitespace-pre-line">{post.caption}</p>
      ) : (
        <p className="text-muted-foreground">Tanpa caption</p>
      )}
      {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
      <LikeButton
        postId={post.id}
        path={`/${slug}/posts/${post.id}`}
        likeCount={post.likeCount}
        viewer={post.viewer}
      />
      {post.access === 'locked' && (
        <div className="flex flex-col items-start gap-3 rounded-lg border p-4">
          {post.offer && (
            <p className="flex items-center gap-1.5 font-medium">
              <Lock aria-hidden className="size-4" />
              {post.offer.priceCoins} Koin · akses permanen
            </p>
          )}
          <Suspense fallback={null}>
            <UnlockCta path={`/${slug}/posts/${post.id}`} />
          </Suspense>
        </div>
      )}
      <ReportPostButton postId={post.id} path={`/${slug}/posts/${post.id}`} viewer={post.viewer} />
      {post.status === 'PUBLISHED' && (
        <section aria-labelledby="comments-heading" className="mt-4 flex flex-col gap-3">
          <h2 id="comments-heading" className="text-lg font-semibold">
            Komentar
          </h2>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat komentar…</p>}>
            <CommentsSection
              postId={post.id}
              path={`/${slug}/posts/${post.id}`}
              loggedIn={post.viewer !== null}
            />
          </Suspense>
        </section>
      )}
    </article>
  );
}

/** First page of comments; premium without access (TBD policy) shows a note instead. */
export async function CommentsSection({
  postId,
  path,
  loggedIn,
}: {
  postId: string;
  path: string;
  loggedIn: boolean;
}) {
  // An API outage must not break the post: show no comments.
  const comments = await getPostComments(postId).catch(() => null);
  if (comments === 'forbidden') {
    return (
      <p className="text-sm text-muted-foreground">
        Buka post ini untuk melihat dan menulis komentar.
      </p>
    );
  }
  if (!comments) return null;
  return <PostComments postId={postId} path={path} initial={comments} loggedIn={loggedIn} />;
}

/** Logged out: login that returns to this post. Logged in: nothing yet. */
export async function UnlockCta({ path }: { path: string }) {
  // An API outage must not break the page: treat it as logged out.
  const user = await getCurrentUser().catch(() => null);
  // US-025 adds the Koin unlock button here; US-027 adds the subscription option.
  if (user) return null;
  return (
    <Button asChild>
      <Link href={loginHref(path)}>Masuk untuk membuka</Link>
    </Button>
  );
}
