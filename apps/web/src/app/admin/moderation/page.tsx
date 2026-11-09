import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ModerationQueue } from './moderation-queue';

export const metadata: Metadata = { title: 'Moderasi Konten' };

export default function AdminModerationPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold tracking-tight">Moderasi Konten</h1>
      {/* Reads the session cookie, so it must stream inside Suspense (cacheComponents). */}
      <Suspense fallback={<p className="text-muted-foreground">Memuat…</p>}>
        <ModerationQueue />
      </Suspense>
    </main>
  );
}
