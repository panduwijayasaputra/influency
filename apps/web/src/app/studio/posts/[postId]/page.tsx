import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { isPostEditable } from '@influency/shared';
import { PostMediaViewer } from '@/components/post-media-viewer';
import { getMyPost, getMyPostMedia } from '@/lib/api/studio-posts';
import { POST_STATUS_LABELS } from '../labels';
import { PostForm } from '../post-form';
import { PostCover } from './post-cover';
import { PostMedia } from './post-media';
import { PostOfferForm } from './post-offer-form';
import { PostStatusActions } from './post-status-actions';

export const metadata: Metadata = { title: 'Edit Post' };

async function PostEditor({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const [post, media] = await Promise.all([getMyPost(postId), getMyPostMedia(postId)]);
  if (!post || !media) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-muted-foreground">Post tidak ditemukan.</p>
        <Link href="/studio/posts" className="font-medium underline underline-offset-4">
          Kembali ke Konten
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">Status: {POST_STATUS_LABELS[post.status]}</p>
      <PostStatusActions post={post} />
      <PostForm post={post} />
      {post.visibility === 'PREMIUM' && (
        <>
          <PostOfferForm postId={post.id} offer={post.offer} />
          <PostCover postId={post.id} cover={post.cover} />
        </>
      )}
      <PostMedia
        postId={post.id}
        media={media.media}
        locked={!isPostEditable(post.status)}
        coverMediaId={post.visibility === 'PREMIUM' ? (post.cover?.mediaId ?? null) : undefined}
      />
      {media.media.some((item) => item.status === 'READY') && (
        <section aria-labelledby="preview-heading" className="flex flex-col gap-3">
          <h2 id="preview-heading" className="text-lg font-semibold">
            Pratinjau
          </h2>
          <PostMediaViewer postId={post.id} />
        </section>
      )}
    </div>
  );
}

export default function EditPostPage({ params }: PageProps<'/studio/posts/[postId]'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Edit Post</h1>
      {/* Params and the session cookie are request data, so they stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <PostEditor params={params} />
      </Suspense>
    </main>
  );
}
