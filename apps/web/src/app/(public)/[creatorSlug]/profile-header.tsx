import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CreatorProfileResponse } from '@influency/shared';
import { ExpandableText } from '@/components/expandable-text';
import { Button } from '@/components/ui/button';
import { initials } from '@/lib/utils';

/** Cover, avatar, name, @slug + share, category, bio and the follow/subscribe actions (US-010). Viewer-specific parts come in as slots. */
export function ProfileHeader({
  creator,
  share,
  actions,
  editHref,
}: {
  creator: CreatorProfileResponse;
  share: ReactNode;
  actions: ReactNode;
  /** Set when the creator views their own profile: shows Edit Profil on the cover line. */
  editHref?: string;
}) {
  return (
    <>
      {creator.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
        <img src={creator.bannerUrl} alt="" className="h-32 w-full object-cover sm:h-48" />
      ) : (
        <div aria-hidden className="h-32 bg-linear-to-r from-primary/30 to-primary/5 sm:h-48" />
      )}

      <div className="flex flex-col gap-3 px-5">
        <div className="-mt-10 flex items-end justify-between gap-2">
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
            <img
              src={creator.avatarUrl}
              alt=""
              className="size-20 rounded-full border-4 border-background bg-background object-cover ring-2 ring-brand"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-20 items-center justify-center rounded-full border-4 border-background bg-primary text-2xl font-extrabold text-primary-foreground ring-2 ring-brand"
            >
              {initials(creator.displayName)}
            </div>
          )}
          {editHref && (
            <Button asChild size="sm" variant="outline">
              <Link href={editHref}>Edit Profil</Link>
            </Button>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-extrabold tracking-tight wrap-break-word">
            {creator.displayName}
          </h1>
          <div className="flex items-center gap-2">
            <p className="min-w-0 truncate text-sm text-muted-foreground">@{creator.slug}</p>
            {share}
          </div>
        </div>
        {creator.category && (
          <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {creator.category}
          </p>
        )}
        {creator.bio && <ExpandableText text={creator.bio} className="text-sm leading-relaxed" />}
        {actions}
      </div>
    </>
  );
}
