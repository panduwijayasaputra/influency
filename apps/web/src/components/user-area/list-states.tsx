import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

/** Loading placeholder for a list page: a 3-column grid of tiles, or full-width cards. */
export function ListSkeleton({ variant, label }: { variant: 'grid' | 'cards'; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="animate-pulse">
      {variant === 'grid' ? (
        <div className="grid grid-cols-3 gap-0.5">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="aspect-[3/4] bg-muted" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-44 rounded-2xl bg-muted" />
          ))}
        </div>
      )}
    </div>
  );
}

export function ListEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-14 text-center">
      <h2 className="text-base font-extrabold">{title}</h2>
      {body && <p className="text-sm text-muted-foreground">{body}</p>}
      {action}
    </div>
  );
}

export function ListError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-8 py-12 text-center">
      <p className="text-sm text-muted-foreground">Gagal memuat. Periksa koneksi lalu coba lagi.</p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}
