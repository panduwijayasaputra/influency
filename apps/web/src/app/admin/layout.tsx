import { Suspense } from 'react';
import { AdminGate } from './admin-gate';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <Suspense fallback={<p className="px-6 py-16 text-muted-foreground">Memuat…</p>}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
