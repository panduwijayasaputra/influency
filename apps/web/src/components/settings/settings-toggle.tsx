'use client';

import { useId } from 'react';
import { cn } from '@/lib/utils';

/** One Pengaturan switch row: label, optional hint, coral track when on. */
export function SettingsToggle({
  label,
  hint,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-13 items-center gap-3 py-2">
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-label`} className="text-[15px] font-semibold">
          {label}
        </span>
        {hint && (
          <span id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={hint ? `${id}-hint` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="flex h-11 shrink-0 items-center rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
      >
        <span
          aria-hidden
          className={cn(
            'relative h-7 w-12 rounded-full transition-colors motion-reduce:transition-none',
            checked ? 'bg-primary' : 'bg-[#d8d3d2]',
          )}
        >
          <span
            className={cn(
              'absolute top-0.75 size-5.5 rounded-full bg-white shadow transition-[left] motion-reduce:transition-none',
              checked ? 'left-5.25' : 'left-0.75',
            )}
          />
        </span>
      </button>
    </div>
  );
}
