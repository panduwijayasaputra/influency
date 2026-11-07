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
