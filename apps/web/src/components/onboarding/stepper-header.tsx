import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Back, "Langkah X dari Y", optional Lewati, and the progress bar with step labels. */
export function StepperHeader({
  steps,
  current,
  onBack,
  onSkip,
}: {
  steps: readonly string[];
  current: number;
  onBack: () => void;
  onSkip?: () => void;
}) {
  const cols = { gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` };
  return (
    <header className="flex flex-col gap-2.5 px-4 pt-2">
      <div className="flex h-11 items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          aria-label="Kembali"
          className="-ml-2.5 flex size-11 items-center justify-center rounded-full"
        >
          <ChevronLeft className="size-6" aria-hidden />
        </button>
        <span className="text-[13px] font-bold text-muted-foreground">
          Langkah {current + 1} dari {steps.length}
        </span>
        {onSkip ? (
          <button
            type="button"
            onClick={onSkip}
            className="-mr-1 h-11 px-1 text-sm font-bold text-primary-ink"
          >
            Lewati
          </button>
        ) : (
          <span className="w-11" aria-hidden />
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Progres onboarding"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={current + 1}
        className="grid gap-1.5"
        style={cols}
      >
        {steps.map((label, i) => (
          <span
            key={label}
            className={cn('h-1 rounded-sm', i <= current ? 'bg-brand' : 'bg-muted')}
          />
        ))}
      </div>
      <div className="grid gap-1.5" style={cols} aria-hidden>
        {steps.map((label, i) => (
          <span
            key={label}
            className={cn(
              'truncate text-[11px]',
              i === current ? 'font-extrabold' : 'font-semibold text-muted-foreground',
            )}
          >
            {label}
          </span>
        ))}
      </div>
    </header>
  );
}
