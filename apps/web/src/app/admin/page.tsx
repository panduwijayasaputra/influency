import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Admin' };

export default function AdminPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-2 px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
      <p className="text-base text-muted-foreground">Kelola kreator, pembayaran, dan moderasi.</p>
      <Link href="/admin/creators" className="text-base font-medium underline underline-offset-4">
        Pengajuan Kreator
      </Link>
      <Link href="/admin/moderation" className="text-base font-medium underline underline-offset-4">
        Moderasi Konten
      </Link>
    </main>
  );
}
