import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

/** Where the creator came from (`?from=`): Pengaturan, or Penghasilan by default. Only these two are accepted. */
export async function BackLink({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const settings = (await searchParams).from === 'settings';
  return (
    <Link
      href={settings ? '/settings' : '/studio/earnings'}
      className="flex min-h-11 items-center gap-2 self-start text-sm font-bold text-primary-ink"
    >
      <ArrowLeft aria-hidden className="size-4" />
      {settings ? 'Kembali ke Pengaturan' : 'Kembali ke Penghasilan'}
    </Link>
  );
}
