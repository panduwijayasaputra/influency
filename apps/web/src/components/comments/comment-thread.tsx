'use client';

import { useId, useState } from 'react';
import type { PostComment, PostReply } from '@influency/shared';
import { fetchMoreReplies } from '@/lib/api/comment-replies';
import { CommentItem, type CommentRowProps } from './comment-item';

type ThreadProps = CommentRowProps & {
  comment: PostComment;
  /** Replies loaded beyond the embedded preview, for the parent to merge into this comment. */
  onMoreReplies: (topId: string, more: PostReply[]) => void;
  /** Changes when the viewer just replied here: the thread opens so the reply is seen. */
  openToken?: number;
};

const ACTION =
  'flex min-h-11 w-fit items-center text-xs font-semibold text-primary-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** A top-level comment with its replies (one level), collapsed behind "Lihat n balasan". */
export function CommentThread({ comment, onMoreReplies, openToken = 0, ...row }: ThreadProps) {
  const [open, setOpen] = useState(false);
  const [seenToken, setSeenToken] = useState(openToken);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const listId = useId();
  if (openToken !== seenToken) {
    setSeenToken(openToken);
    setOpen(true);
  }
  const replies = comment.replies ?? [];
  const count = comment.replyCount ?? replies.length;
  // A deleted comment with nothing under it has nothing to show.
  if (comment.deleted && count === 0) return null;

  async function loadMore() {
    setLoading(true);
    setFailed(false);
    const page = await fetchMoreReplies(row.postId, comment.id, replies.at(-1)?.id);
    setLoading(false);
    if (!page) return setFailed(true);
    onMoreReplies(comment.id, page.items);
    if (page.nextCursor === null) setExhausted(true);
  }

  return (
    <div className="flex flex-col gap-1">
      <CommentItem comment={comment} topId={comment.id} {...row} />
      {count > 0 && (
        <div className="ml-11 flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            className={ACTION}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Sembunyikan balasan' : `Lihat ${count} balasan`}
          </button>
          {open && (
            <>
              <ul id={listId} className="flex flex-col gap-3">
                {replies.map((r) => (
                  <li key={r.id}>
                    <CommentItem comment={r} topId={comment.id} reply {...row} />
                  </li>
                ))}
              </ul>
              {replies.length < count && !exhausted && (
                <button
                  type="button"
                  className={ACTION}
                  disabled={loading}
                  onClick={() => void loadMore()}
                >
                  Lihat balasan lainnya
                </button>
              )}
              {failed && (
                <p role="alert" className="text-xs text-destructive">
                  Gagal memuat balasan. Coba lagi.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
