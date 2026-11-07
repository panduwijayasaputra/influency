'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { BottomNav } from '@/components/bottom-nav';
import { markInAppNavigation } from '@/lib/in-app-history';

/** Routes without the bottom nav. Add onboarding here when its route lands. */
export const STANDALONE_PREFIXES = ['/login', '/studio', '/admin', '/become-creator'] as const;

export function isStandalone(pathname: string): boolean {
  return STANDALONE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/** App shell for signed-in users (mounted by SignedInChrome in the root layout): bottom nav + spacer, and the in-app navigation tracker. */
export function AppChrome() {
  const pathname = usePathname();
  const first = useRef(pathname);
  useEffect(() => {
    if (pathname !== first.current) markInAppNavigation();
  }, [pathname]);

  if (isStandalone(pathname)) return null;
  return (
    <>
      {/* Keeps page content clear of the fixed nav, so pages need no bottom padding of their own. */}
      <div
        aria-hidden
        className="h-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] shrink-0"
      />
      <BottomNav pathname={pathname} />
    </>
  );
}
