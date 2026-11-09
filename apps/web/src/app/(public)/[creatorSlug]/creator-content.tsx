'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Tabs } from 'radix-ui';
import type { PublicPost } from '@influency/shared';
import { PostCard, type PostCardCreator } from '@/components/post-card/post-card';
import { PostGrid } from '@/components/post-grid/post-grid';

const TRIGGER =
  'min-h-11 text-sm font-bold text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:text-foreground data-[state=active]:shadow-[inset_0_-2px_0_var(--brand)]';

/** Owner-only entry to the studio editor (creator-studio US-054). */
export function NewPostLink() {
  return (
    <Link
      href="/studio/posts/new"
      className="mx-5 my-3 flex h-12 items-center justify-center gap-2 rounded-[14px] bg-primary text-sm font-bold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <Plus aria-hidden className="size-5" />
      Post Baru
    </Link>
  );
}

/**
 * Postingan / Grid tabs (US-011). The tab lives in `?tab=grid` so it survives a reload; only the open tab is mounted.
 * `isOwner` (UX only; the studio guards decide) adds "Post Baru" and an "Edit" item on every card.
 */
export function CreatorContent({
  posts,
  creator,
  isOwner = false,
}: {
  posts: PublicPost[];
  creator: PostCardCreator;
  isOwner?: boolean;
}) {
  const tab = useSearchParams().get('tab') === 'grid' ? 'grid' : 'posts';
  const pathname = usePathname();
  const router = useRouter();
  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) =>
        router.replace(next === 'grid' ? `${pathname}?tab=grid` : pathname, { scroll: false })
      }
    >
      <Tabs.List aria-label="Konten" className="-mx-5 grid grid-cols-2 border-b">
        <Tabs.Trigger value="posts" className={TRIGGER}>
          Postingan
        </Tabs.Trigger>
        <Tabs.Trigger value="grid" className={TRIGGER}>
          Grid
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="posts" className="-mx-5 flex flex-col divide-y">
        {isOwner && <NewPostLink />}
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            creator={creator}
            editHref={isOwner ? `/studio/posts/${post.id}` : undefined}
          />
        ))}
      </Tabs.Content>
      <Tabs.Content value="grid" className="-mx-5">
        <PostGrid posts={posts} creator={creator} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
