import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ERRORS } from '@influency/shared';
import { AccessDenied } from '@/components/access-denied';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

/** UX only: admin API endpoints enforce AdminGuard themselves. */
export async function AdminGate({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // shortcut: returns to /admin, not the exact deep page (layouts get no pathname); upgrade when deep admin pages exist.
  if (!user) redirect(loginHref('/admin'));
  if (!user.roles.includes('ADMIN')) return <AccessDenied message={ERRORS.FORBIDDEN.message} />;
  return children;
}
