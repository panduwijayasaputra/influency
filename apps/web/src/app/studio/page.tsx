import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Studio' };

export default function StudioPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-2 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Studio</h1>
      <p className="text-base text-muted-foreground">Kelola konten dan penghasilanmu di sini.</p>
      <Link href="/studio/profile" className="text-base font-medium underline underline-offset-4">
        Edit profil
      </Link>
      <Link href="/studio/posts" className="text-base font-medium underline underline-offset-4">
        Konten
      </Link>
    </main>
  );
}
