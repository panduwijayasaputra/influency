import { cn } from '@/lib/utils';

/** Influency mark + lowercase wordmark. Decorative: the wrapping link or element supplies the accessible name. */
export function BrandLogo({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span aria-hidden className="flex items-center gap-2">
      <span
        className={cn(
          'flex items-center justify-center bg-brand text-primary-foreground',
          size === 'lg' ? 'size-8 rounded-[10px]' : 'size-7 rounded-[9px]',
        )}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          className={size === 'lg' ? 'size-4.5' : 'size-4'}
        >
          <path d="M12 11v8" />
          <circle cx="12" cy="5.5" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </span>
      <span
        className={cn(
          'font-extrabold tracking-tight',
          size === 'lg' ? 'text-[22px]' : 'text-[19px]',
        )}
      >
        influency
      </span>
    </span>
  );
}
