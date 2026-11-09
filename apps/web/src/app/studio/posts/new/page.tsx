import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { PostEditor } from '../post-editor';

export const metadata: Metadata = { title: 'Post Baru' };

async function NewPostEditor() {
  // StudioGate already handled logged-out / unapproved; null here means the session just ended.
  const profile = await getMyCreatorProfile();
  if (!profile) return <p className="text-muted-foreground">Profil kreator tidak ditemukan.</p>;
  return <PostEditor creatorSlug={profile.slug} />;
}

export default function NewPostPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Post Baru</h1>
      {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <NewPostEditor />
      </Suspense>
    </main>
  );
}
