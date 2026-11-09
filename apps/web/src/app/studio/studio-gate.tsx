import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { ERRORS } from '@influency/shared';
import { AccessDenied } from '@/components/access-denied';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

/** UX only: studio API endpoints enforce ApprovedCreatorGuard themselves. */
export async function StudioGate({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  // shortcut: returns to /studio, not the exact deep page (layouts get no pathname); upgrade when deep studio pages exist.
  if (!user) redirect(loginHref('/studio'));
  if (!user.roles.includes('CREATOR'))
    return <AccessDenied message={ERRORS.CREATOR_NOT_APPROVED.message} />;
  return children;
}
