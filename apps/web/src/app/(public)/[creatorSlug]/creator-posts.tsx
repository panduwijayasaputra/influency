import { getPublicPosts } from '@/lib/api/public-posts';
import { PostGrid } from './post-grid';

const EMPTY = 'Belum ada konten yang dipublikasikan.';

/**
 * Published posts as a filterable grid. Premium tiles show only the generated cover preview (US-048); post media
 * arrives through the access-checked path (US-021).
 */
export async function CreatorPosts({ slug, creatorName }: { slug: string; creatorName: string }) {
  // An API outage must not break the public page.
  const feed = await getPublicPosts(slug).catch(() => undefined);
  if (feed === undefined) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Konten belum bisa dimuat.
      </p>
    );
  }
  const posts = feed?.posts ?? [];
  if (posts.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        {EMPTY}
      </p>
    );
  }
  return <PostGrid slug={slug} creatorName={creatorName} posts={posts} />;
}
