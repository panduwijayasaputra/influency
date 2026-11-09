import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { getMyPost, getMyPostMedia } from '@/lib/api/studio-posts';
import { POST_STATUS_LABELS } from '../labels';
import { PostEditor } from '../post-editor';
import { PostStatusActions } from './post-status-actions';

export const metadata: Metadata = { title: 'Edit post' };

async function EditPost({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const [post, media, profile] = await Promise.all([
    getMyPost(postId),
    getMyPostMedia(postId),
    getMyCreatorProfile(),
  ]);
  if (!post || !media || !profile) {
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
      {/* A new key remounts the editor with fresh server data after a status change. */}
      <PostEditor
        key={`${post.id}:${post.status}:${post.updatedAt}`}
        post={post}
        media={media.media}
        creatorSlug={profile.slug}
      />
    </div>
  );
}

export default function EditPostPage({ params }: PageProps<'/studio/posts/[postId]'>) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Edit post</h1>
      {/* Params and the session cookie are request data, so they stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <EditPost params={params} />
      </Suspense>
    </main>
  );
}
