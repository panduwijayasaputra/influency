import { Suspense } from 'react';
import { PageHeader } from '@/components/page-header';
import { AdminGate } from './admin-gate';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <>
      <PageHeader title="Admin" fallbackHref="/" />
      <Suspense fallback={<p className="px-6 py-16 text-muted-foreground">Memuat…</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </>
  );
}
