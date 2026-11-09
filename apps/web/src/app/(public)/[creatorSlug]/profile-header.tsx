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
  stats,
}: {
  creator: CreatorProfileResponse;
  share: ReactNode;
  actions: ReactNode;
  /** Set when the creator views their own profile: shows Edit Profil on the cover line. */
  editHref?: string;
  /** `<li>` items of the stats row (photos, videos, followers). */
  stats?: ReactNode;
}) {
  return (
    <>
      {creator.bannerUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
        <img src={creator.bannerUrl} alt="" className="h-34 w-full object-cover" />
      ) : (
        <div aria-hidden className="h-34 bg-linear-to-r from-primary/30 to-primary/5" />
      )}

      <div className="relative flex flex-col gap-3 bg-card px-4 pb-4">
        <div className="-mt-10.5 flex items-end justify-between gap-2">
          {creator.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
            <img
              src={creator.avatarUrl}
              alt=""
              className="size-21 rounded-full border-4 border-card bg-card object-cover"
            />
          ) : (
            <div
              aria-hidden
              className="flex size-21 items-center justify-center rounded-full border-4 border-card bg-primary text-[26px] font-extrabold text-primary-foreground"
            >
              {initials(creator.displayName)}
            </div>
          )}
          {editHref && (
            <Button asChild variant="outline" className="mt-5 self-start shadow-sm">
              <Link href={editHref}>Edit Profil</Link>
            </Button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-[21px] leading-tight font-extrabold tracking-tight wrap-break-word">
              {creator.displayName}
            </h1>
            <p className="truncate text-sm text-muted-foreground">@{creator.slug}</p>
          </div>
          <div className="-mr-3 flex shrink-0 items-center">{share}</div>
        </div>
        {stats && (
          <ul aria-label="Statistik profil" className="-mt-1 flex items-center gap-5">
            {stats}
          </ul>
        )}
        {creator.category && (
          <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {creator.category}
          </p>
        )}
        {creator.bio && (
          <ExpandableText
            text={creator.bio}
            className="text-[14.5px] leading-normal text-[#45464D]"
          />
        )}
        {actions}
      </div>
    </>
  );
}
