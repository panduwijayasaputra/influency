import { Lock } from 'lucide-react';
import { type PublicPost, SECONDS_PER_DAY } from '@influency/shared';
import { getPublicPosts } from '@/lib/api/public-posts';

const DATE = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Jakarta',
});

const EMPTY = 'Belum ada konten yang dipublikasikan.';

function mediaSummary({ imageCount, videoCount }: PublicPost): string {
  return [imageCount && `${imageCount} foto`, videoCount && `${videoCount} video`]
    .filter(Boolean)
    .join(' · ');
}

function PostCard({ post }: { post: PublicPost }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border p-4">
      {post.caption ? (
        <p className="wrap-break-word whitespace-pre-line">{post.caption}</p>
      ) : (
        <p className="text-muted-foreground">Tanpa caption</p>
      )}
      <p className="text-sm text-muted-foreground">
        {[mediaSummary(post), DATE.format(new Date(post.publishedAt))].filter(Boolean).join(' · ')}
      </p>
      {post.offer && (
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Lock aria-hidden className="size-4" />
          {post.offer.priceCoins} Koin · {Math.floor(post.offer.durationSeconds / SECONDS_PER_DAY)}{' '}
          hari
        </p>
      )}
    </article>
  );
}

function PostSection({ id, title, posts }: { id: string; title: string; posts: PublicPost[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </section>
  );
}

/** Published posts as Gratis / Premium previews. Text only: media arrives through the access-checked path (US-021). */
export async function CreatorPosts({ slug }: { slug: string }) {
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
  return (
    <div className="flex flex-col gap-6">
      <PostSection
        id="gratis"
        title="Gratis"
        posts={posts.filter((p) => p.visibility === 'FREE')}
      />
      <PostSection
        id="premium"
        title="Premium"
        posts={posts.filter((p) => p.visibility === 'PREMIUM')}
      />
    </div>
  );
}
