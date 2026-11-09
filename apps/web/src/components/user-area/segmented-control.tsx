'use client';

import { cn } from '@/lib/utils';

/** A small group of mutually exclusive filter buttons (`aria-pressed`), as in the Koleksi Saya design. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid gap-0.5 rounded-xl bg-muted p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-11 rounded-[9px] text-[13px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              selected
                ? 'bg-card font-extrabold text-foreground shadow-sm'
                : 'font-semibold text-muted-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
