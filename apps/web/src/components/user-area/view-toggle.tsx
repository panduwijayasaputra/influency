'use client';

import { LayoutGrid, Rows3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ListView = 'grid' | 'list';

const BUTTON =
  'flex size-11 items-center justify-center rounded-[9px] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Grid / Vertikal display switch. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: ListView;
  onChange: (value: ListView) => void;
}) {
  const pick = (v: ListView) =>
    cn(BUTTON, value === v ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground');
  return (
    <div role="group" aria-label="Tampilan" className="flex gap-0.5 rounded-xl bg-muted p-[3px]">
      <button
        type="button"
        aria-label="Tampilan grid"
        aria-pressed={value === 'grid'}
        onClick={() => onChange('grid')}
        className={pick('grid')}
      >
        <LayoutGrid aria-hidden className="size-[18px]" />
      </button>
      <button
        type="button"
        aria-label="Tampilan vertikal"
        aria-pressed={value === 'list'}
        onClick={() => onChange('list')}
        className={pick('list')}
      >
        <Rows3 aria-hidden className="size-[18px]" />
      </button>
    </div>
  );
}
