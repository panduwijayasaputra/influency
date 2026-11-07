import Link from 'next/link';
import { BottomNav } from '@/components/bottom-nav';
import { Button } from '@/components/ui/button';

/** Placeholder page for a reserved route whose feature is not built yet. */
export function ComingSoon({ title, description }: { title: string; description: string }) {
  return (
    <>
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-6 pt-16 pb-28">
        <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-semibold">Segera hadir</p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="text-base text-muted-foreground">{description}</p>
        <Button asChild variant="outline" className="self-start">
          <Link href="/">Kembali ke beranda</Link>
        </Button>
      </main>
      <BottomNav />
    </>
  );
}
