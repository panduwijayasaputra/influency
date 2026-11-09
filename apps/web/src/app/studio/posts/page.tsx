import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { MyPostList } from './my-post-list';

export const metadata: Metadata = { title: 'Postingan Saya' };

export default function StudioPostsPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight">Postingan Saya</h1>
        <Link href="/studio/posts/new" className={buttonVariants()}>
          Post Baru
        </Link>
      </div>
      {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <MyPostList />
      </Suspense>
    </main>
  );
}
