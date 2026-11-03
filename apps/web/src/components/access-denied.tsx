import Link from 'next/link';
import { Button } from '@/components/ui/button';

/** Shown by the studio/admin gates when the user is logged in but lacks the role. */
export function AccessDenied({ message }: { message: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="text-2xl font-bold tracking-tight">Akses ditolak</h1>
      <p className="text-base text-muted-foreground">{message}</p>
      <Button asChild variant="outline" className="self-start">
        <Link href="/">Kembali ke beranda</Link>
      </Button>
    </main>
  );
}
