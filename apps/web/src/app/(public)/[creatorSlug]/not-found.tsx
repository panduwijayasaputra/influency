import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function CreatorNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center gap-4 px-6 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight">Kreator tidak ditemukan</h1>
      <p className="text-muted-foreground">Alamat ini belum dipakai atau kreatornya tidak aktif.</p>
      <Button asChild variant="outline">
        <Link href="/">Kembali ke beranda</Link>
      </Button>
    </main>
  );
}
