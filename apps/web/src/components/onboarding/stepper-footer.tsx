import { Button } from '@/components/ui/button';

/**
 * Bottom CTA. A click while `disabled` still calls `onClick`, so the step can show what is missing
 * (the button is only aria-disabled and dimmed).
 */
export function StepperFooter({
  label,
  disabled = false,
  pending = false,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
}) {
  return (
    <footer className="border-t border-border bg-background px-4 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
      <Button
        type="button"
        size="lg"
        className="w-full"
        aria-disabled={disabled || pending}
        onClick={() => {
          if (!pending) onClick();
        }}
        style={disabled ? { opacity: 0.55 } : undefined}
      >
        {pending ? 'Menyimpan…' : label}
      </Button>
    </footer>
  );
}
