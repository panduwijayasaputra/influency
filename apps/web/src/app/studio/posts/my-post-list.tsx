import Link from 'next/link';
import { getMyPosts } from '@/lib/api/studio-posts';
import { POST_STATUS_LABELS, VISIBILITY_LABELS } from './labels';

/** The creator's own posts, newest first, each linking to its editor. Abandoned drafts are found here. */
export async function MyPostList() {
  // StudioGate already handled logged-out / unapproved; null here means the session just ended.
  const list = await getMyPosts();
  if (!list) return <p className="text-muted-foreground">Konten tidak dapat dimuat.</p>;
  if (list.posts.length === 0) return <p className="text-muted-foreground">Belum ada post.</p>;
  return (
    <ul className="flex flex-col divide-y rounded-2xl border bg-card">
      {list.posts.map((post) => (
        <li key={post.id}>
          <Link
            href={`/studio/posts/${post.id}`}
            className="flex min-h-14 flex-col justify-center gap-1 px-4 py-3 hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
          >
            <span className="truncate font-semibold">
              {post.caption.split('\n')[0] || 'Tanpa caption'}
            </span>
            <span className="text-sm text-muted-foreground">
              {VISIBILITY_LABELS[post.visibility]} · {POST_STATUS_LABELS[post.status]}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
