import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';

/** Placeholder page for a route whose feature is not built yet. */
export function ComingSoon({
  title,
  description,
  children,
  header,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  /** Replaces the default PageHeader (Home passes HomeTopBar); the title then becomes an sr-only h1. */
  header?: ReactNode;
}) {
  return (
    <>
      {header ?? <PageHeader title={title} asHeading />}
      <main className="mx-auto flex w-full max-w-feed flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center">
        {header && <h1 className="sr-only">{title}</h1>}
        <p className="rounded-full bg-accent px-3 py-1 text-xs font-bold text-primary-ink">
          Segera hadir
        </p>
        <p className="text-base text-muted-foreground">{description}</p>
        {children}
      </main>
    </>
  );
}
