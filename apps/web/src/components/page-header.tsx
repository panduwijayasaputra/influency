'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { hasInAppHistory, subscribeInAppHistory } from '@/lib/in-app-history';
import { cn } from '@/lib/utils';

type Props = { title: string; fallbackHref?: string; asHeading?: boolean };

const BACK_CLASS =
  'flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Simple sticky top bar for non-Home pages. Back shows after in-app navigation, else links to `fallbackHref`. */
export function PageHeader({ title, fallbackHref, asHeading = false }: Props) {
  const router = useRouter();
  // Server snapshot is false, so SSR never renders the history-based back button.
  const inApp = useSyncExternalStore(subscribeInAppHistory, hasInAppHistory, () => false);
  const Title = asHeading ? 'h1' : 'p';

  let back = null;
  if (inApp) {
    back = (
      <button
        type="button"
        aria-label="Kembali"
        onClick={() => router.back()}
        className={BACK_CLASS}
      >
        <ArrowLeft aria-hidden className="size-5" />
      </button>
    );
  } else if (fallbackHref) {
    back = (
      <Link href={fallbackHref} aria-label="Kembali" className={BACK_CLASS}>
        <ArrowLeft aria-hidden className="size-5" />
      </Link>
    );
  }

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-feed items-center gap-1 px-2">
        {back}
        <Title className={cn('truncate text-base font-bold', !back && 'pl-2')}>{title}</Title>
      </div>
    </header>
  );
}
