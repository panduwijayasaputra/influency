import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { IfSignedIn } from '@/components/if-signed-in';
import { PageHeader } from '@/components/page-header';
import { PostCard, type PostCardCreator } from '@/components/post-card/post-card';
import { POST_STATUS_LABELS } from '@/app/studio/posts/labels';
import { getPostComments } from '@/lib/api/post-comments';
import { getPublicCreator } from '@/lib/api/public-creator';
import { getPublicPost } from '@/lib/api/public-post';
import { PostComments } from '@/components/comments/post-comments';
import { ScrollToComments } from './scroll-to-comments';

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
    <>
      {/* Guests get no top bar (US-007). */}
      <Suspense fallback={null}>
        <IfSignedIn>
          <PageHeader title="Postingan" fallbackHref={`/${creator.slug}`} />
        </IfSignedIn>
      </Suspense>
      <main className="mx-auto flex w-full max-w-feed flex-1 flex-col">
        {/* Reads the session cookie (owner/entitled viewers get the full post), so it streams in uncached. */}
        <Suspense
          fallback={<p className="px-4 py-4 text-sm text-muted-foreground">Memuat postingan…</p>}
        >
          <PostDetail
            creator={{
              slug: creator.slug,
              displayName: creator.displayName,
              avatarUrl: creator.avatarUrl,
            }}
            postId={postId}
          />
        </Suspense>
      </main>
    </>
  );
}

export async function PostDetail({
  creator,
  postId,
}: {
  creator: PostCardCreator;
  postId: string;
}) {
  const post = await getPublicPost(creator.slug, postId);
  if (!post) notFound();

  return (
    <article className="flex flex-col">
      {post.status !== 'PUBLISHED' && (
        <p className="mx-4 mt-4 w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
          {POST_STATUS_LABELS[post.status]} · tidak terlihat publik
        </p>
      )}
      <PostCard post={post} creator={creator} detail />
      {post.status === 'PUBLISHED' && (
        <section
          id="komentar"
          aria-labelledby="comments-heading"
          className="flex scroll-mt-16 flex-col gap-3 px-4 pt-2"
        >
          <h2 id="comments-heading" className="text-lg font-semibold">
            Komentar
          </h2>
          <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat komentar…</p>}>
            <CommentsSection
              postId={post.id}
              path={`/${creator.slug}/posts/${post.id}`}
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
  return (
    <>
      <ScrollToComments />
      <PostComments postId={postId} path={path} initial={comments} loggedIn={loggedIn} />
    </>
  );
}
