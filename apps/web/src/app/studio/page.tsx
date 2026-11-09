import { ChevronRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Studio' };

const LINKS = [
  { href: '/studio/posts/new', label: 'Post Baru', hint: 'Foto atau video, gratis atau premium' },
  { href: '/studio/posts', label: 'Postingan Saya', hint: 'Draf dan post yang sudah terbit' },
  { href: '/studio/profile', label: 'Edit Profil', hint: 'Nama, bio, foto dan harga langganan' },
  { href: '/studio/earnings', label: 'Penghasilan', hint: 'Saldo, riwayat dan pencairan' },
];

export default function StudioPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Studio</h1>
      <p className="text-base text-muted-foreground">Kelola konten dan penghasilanmu di sini.</p>
      <ul className="flex flex-col divide-y rounded-2xl border bg-card">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="flex min-h-14 items-center gap-3 px-4 py-3 focus-visible:bg-muted focus-visible:outline-none"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold">{link.label}</span>
                <span className="text-sm text-muted-foreground">{link.hint}</span>
              </span>
              <ChevronRight aria-hidden className="size-5 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
