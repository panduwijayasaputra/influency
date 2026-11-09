'use client';

/** Native select with a label (the design uses native selects; they work well with a thumb). */
export function LabeledSelect({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
  hideLabel?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
      <span className={hideLabel ? 'sr-only' : undefined}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-0 flex-1 rounded-xl border border-input bg-card px-3 text-sm font-bold text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
