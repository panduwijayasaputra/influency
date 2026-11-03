import Link from 'next/link';
import { POST_STATUS_LABELS, VISIBILITY_LABELS } from '@/app/studio/posts/labels';
import { getModerationQueue } from '@/lib/api/admin-moderation';
import { REPORT_REASON_LABELS } from '@/lib/report-reasons';
import { ModerationActions } from './moderation-actions';

const dateFormat = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
});

/** Reported posts, oldest open report first, each with moderation actions. */
export async function ModerationQueue() {
  const items = await getModerationQueue();
  if (items.length === 0) {
    return <p className="text-muted-foreground">Tidak ada laporan terbuka.</p>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => {
        const { post, creator } = item;
        return (
          <li key={post.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">
                {creator.displayName}{' '}
                <span className="text-sm font-normal text-muted-foreground">@{creator.slug}</span>
                {creator.userStatus === 'SUSPENDED' && (
                  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                    Ditangguhkan
                  </span>
                )}
              </h2>
              <p className="text-sm text-muted-foreground">
                {POST_STATUS_LABELS[post.status]} · {VISIBILITY_LABELS[post.visibility]} · pertama
                dilaporkan {dateFormat.format(new Date(item.firstReportedAt))}
              </p>
              <p className="truncate text-sm">{post.caption.split('\n')[0] || 'Tanpa caption'}</p>
              <Link
                href={`/${creator.slug}/posts/${post.id}`}
                className="w-fit text-sm font-medium underline underline-offset-4"
              >
                Lihat postingan
              </Link>
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">
                {item.openReportCount} laporan ·{' '}
                {item.reasons
                  .map((r) => `${REPORT_REASON_LABELS[r.reason]} (${r.count})`)
                  .join(', ')}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {item.reports.map((r, i) => (
                  <li key={i} className="wrap-break-word">
                    {REPORT_REASON_LABELS[r.reason]} · {r.reporterDisplayName} ·{' '}
                    {dateFormat.format(new Date(r.createdAt))}
                    {r.note && <span className="block whitespace-pre-line">“{r.note}”</span>}
                  </li>
                ))}
              </ul>
            </div>
            <ModerationActions
              postId={post.id}
              postStatus={post.status}
              creatorUserId={creator.userId}
              creatorStatus={creator.userStatus}
            />
          </li>
        );
      })}
    </ul>
  );
}
