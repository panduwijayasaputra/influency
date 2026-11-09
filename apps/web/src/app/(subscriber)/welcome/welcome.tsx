import { redirect } from 'next/navigation';
import { safeReturnTo } from '@influency/shared';
import { WelcomeFlow } from '@/components/onboarding/welcome-flow';
import { getCurrentUser } from '@/lib/api/current-user';
import { loginHref } from '@/lib/login-href';

/** Session gate for /welcome. `returnTo` is user-controlled, so it always goes through safeReturnTo. */
export async function Welcome({ returnTo }: { returnTo: unknown }) {
  const user = await getCurrentUser().catch(() => null);
  if (!user) redirect(loginHref('/welcome'));
  const target = safeReturnTo(Array.isArray(returnTo) ? returnTo[0] : returnTo);
  // The welcome is shown once: a user who finished or skipped it goes where they were headed.
  if (user.onboardingCompleted) redirect(target);
  return (
    <WelcomeFlow
      user={{ displayName: user.displayName, username: user.username, bio: user.bio }}
      returnTo={target}
    />
  );
}
