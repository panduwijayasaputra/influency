import type { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/api/current-user';

/** Renders children only for a signed-in user (e.g. page headers guests must not see). Wrap in Suspense. */
export async function IfSignedIn({ children }: { children: ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  return user ? children : null;
}
