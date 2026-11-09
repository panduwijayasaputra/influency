import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Post dates on public pages (feed and detail). */
export const POST_DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

/** Premium cover: the server-generated, already blurred preview (no CSS blur relied on), or a generic locked block. */
export function PremiumCover({
  previewUrl,
  className,
}: {
  previewUrl: string | null;
  className?: string;
}) {
  return previewUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image would proxy/cache it */
    <img
      src={previewUrl}
      alt=""
      loading="lazy"
      className={cn('aspect-square w-full rounded-md bg-muted object-cover', className)}
    />
  ) : (
    <div
      data-testid="locked-placeholder"
      className={cn(
        'flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground',
        className,
      )}
    >
      <Lock aria-hidden className="size-8" />
    </div>
  );
}
