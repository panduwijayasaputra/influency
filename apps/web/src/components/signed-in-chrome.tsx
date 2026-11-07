import { AppChrome } from '@/components/app-chrome';
import { getCurrentUser } from '@/lib/api/current-user';

/** Guests get no bottom nav or spacer anywhere (US-007); signed-in users get AppChrome. */
export async function SignedInChrome() {
  // An API outage counts as a guest, the same rule as /login.
  const user = await getCurrentUser().catch(() => null);
  return user ? <AppChrome /> : null;
}
