import Link from 'next/link';
import { DEMO_KOIN_BALANCE } from '@/lib/demo';
import { cn } from '@/lib/utils';

/** The Koin coin mark. Decorative (aria-hidden), so the white K on gold is exempt from text contrast; the amount next to it always says "Koin". */
export function KoinIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-koin text-[9px] font-extrabold text-white',
        className,
      )}
    >
      K
    </span>
  );
}

/** Wallet balance pill linking to the wallet. */
export function KoinBalance() {
  return (
    <Link
      href="/wallet"
      aria-label={`Saldo: ${DEMO_KOIN_BALANCE} Koin`}
      className="flex h-11 items-center gap-1.5 rounded-full border border-koin-border bg-koin-surface pr-3 pl-1.5 text-sm font-bold text-koin-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <KoinIcon className="size-6 text-xs" />
      {DEMO_KOIN_BALANCE}
    </Link>
  );
}
