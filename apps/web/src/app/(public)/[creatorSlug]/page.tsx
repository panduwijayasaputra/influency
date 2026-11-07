import { Share } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { APP_NAME, type CreatorProfileResponse } from '@influency/shared';
import { PageHeader } from '@/components/page-header';
import { getFollowState } from '@/lib/api/creator-follow.server';
import { getCurrentUser } from '@/lib/api/current-user';
import { getMyCreatorProfile } from '@/lib/api/creator-profile';
import { getPublicCreator } from '@/lib/api/public-creator';
import { DEMO_SUBSCRIBED } from '@/lib/demo';
import { loginHref } from '@/lib/login-href';
import { CreatorPosts } from './creator-posts';
import { FollowerCount, FollowProvider } from './follow-state';
import { SHARE_BUTTON_CLASS, ShareButton } from './share-button';
import { ProfileActions } from './profile-actions';
import { ProfileHeader } from './profile-header';

type Props = { params: Promise<{ creatorSlug: string }> };

// Render the page only once the (cached) profile is in, with no page-level loading fallback.
// shortcut: unknown slugs are a soft 404 (200 + noindex) because the root layout shell streams first; add a Proxy slug check if a real 404 status is needed.
export const instant = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const creator = await getPublicCreator((await params).creatorSlug);
  if (!creator) notFound();
  return {
    title: creator.displayName,
    description: creator.bio?.slice(0, 160) || `${creator.displayName} di ${APP_NAME}`,
  };
}

export default async function CreatorPage({ params }: Props) {
  const creator = await getPublicCreator((await params).creatorSlug);
  if (!creator) notFound();
  // The viewer decides the header and actions, so the page streams once the session is checked (still SSR).
  return (
    <Suspense fallback={null}>
      <CreatorView creator={creator} />
    </Suspense>
  );
}

/** The creator page for this viewer: guests get no top bar and every action goes to login (US-007). */
export async function CreatorView({ creator }: { creator: CreatorProfileResponse }) {
  // An API outage counts as a guest, the same rule as /login.
  const [user, follow] = await Promise.all([
    getCurrentUser().catch(() => null),
    getFollowState(creator.slug),
  ]);
  const signedIn = user !== null;
  const login = loginHref(`/${creator.slug}`);
  // UX only: the studio guards decide. Only creators pay for the extra lookup; a failure means "not the owner".
  const isOwner =
    user?.roles.includes('CREATOR') === true &&
    (await getMyCreatorProfile().catch(() => null))?.slug === creator.slug;

  return (
    <>
      {signedIn && <PageHeader title={creator.displayName} />}
      <main className="mx-auto flex w-full max-w-feed flex-1 flex-col pb-6">
        <FollowProvider initial={follow}>
          <ProfileHeader
            creator={creator}
            stats={<FollowerCount />}
            editHref={isOwner ? '/studio/profile' : undefined}
            share={
              signedIn ? (
                <ShareButton title={creator.displayName} label="Bagikan profil" />
              ) : (
                <Link href={login} aria-label="Bagikan" className={SHARE_BUTTON_CLASS}>
                  <Share aria-hidden className="size-4" />
                </Link>
              )
            }
            actions={
              isOwner ? null : (
                <ProfileActions
                  slug={creator.slug}
                  creatorName={creator.displayName}
                  loginHref={signedIn ? undefined : login}
                  subscribedDaysLeft={
                    signedIn && DEMO_SUBSCRIBED.slugs.includes(creator.slug)
                      ? DEMO_SUBSCRIBED.daysLeft
                      : undefined
                  }
                />
              )
            }
          />
        </FollowProvider>

        <div className="mt-4 px-5">
          {/* Uncached so hidden posts disappear immediately; the profile above stays cached. */}
          <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat konten…</p>}>
            <CreatorPosts
              creator={{
                slug: creator.slug,
                displayName: creator.displayName,
                avatarUrl: creator.avatarUrl,
              }}
            />
          </Suspense>
        </div>
      </main>
    </>
  );
}
