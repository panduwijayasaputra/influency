import { AppChrome } from '@/components/app-chrome';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { getCurrentUser } from '@/lib/api/current-user';

/** Guests get no bottom nav or spacer anywhere (US-007); signed-in users get AppChrome. */
export async function SignedInChrome() {
  // An API outage counts as a guest, the same rule as /login.
  const user = await getCurrentUser().catch(() => null);
  if (!user) return null;
  // Creators only: their own public page lights the Profil tab. A failed lookup just means no highlight.
  const own = user.roles.includes('CREATOR') ? await getMyCreatorProfile().catch(() => null) : null;
  return <AppChrome ownSlug={own?.slug} />;
}
