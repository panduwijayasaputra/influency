import { Suspense } from 'react';
import { StudioGate } from './studio-gate';

export default function StudioLayout({ children }: LayoutProps<'/studio'>) {
  return (
    <Suspense fallback={<p className="px-6 py-16 text-muted-foreground">Memuat…</p>}>
      <StudioGate>{children}</StudioGate>
    </Suspense>
  );
}
