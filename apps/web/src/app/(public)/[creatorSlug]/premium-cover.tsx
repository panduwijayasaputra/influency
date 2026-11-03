import { Lock } from 'lucide-react';

/** Post dates on public pages (feed and detail). */
export const POST_DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

/** Premium cover: the server-generated, already blurred preview (no CSS blur relied on), or a generic locked block. */
export function PremiumCover({ previewUrl }: { previewUrl: string | null }) {
  return previewUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image would proxy/cache it */
    <img
      src={previewUrl}
      alt=""
      loading="lazy"
      className="aspect-square w-full rounded-md bg-muted object-cover"
    />
  ) : (
    <div
      data-testid="locked-placeholder"
      className="flex aspect-square w-full items-center justify-center rounded-md bg-muted text-muted-foreground"
    >
      <Lock aria-hidden className="size-8" />
    </div>
  );
}
