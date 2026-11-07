'use client';

import { Pin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { POST_COMMENT_MAX_LENGTH, type PostComment, type PostReply } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loginHref } from '@/lib/login-href';
import { formatRelativeTime } from '@/lib/relative-time';
import { initials } from '@/lib/utils';
import { CommentActionsMenu } from './comment-actions-menu';
import { CommentLikeButton } from './comment-like-button';

export type CommentRowProps = {
  postId: string;
  /** This post's page, where login returns to. */
  path: string;
  loggedIn: boolean;
  /** `canComment` for a signed-in viewer, or a guest (who is sent to login). */
  canReply: boolean;
  /** A request is running: Hapus waits. */
  pending: boolean;
  /** Opens the confirm sheet in PostComments. */
  onDelete: (id: string) => void;
  /** Starts a reply under the thread `topId` (a reply to a reply goes to the same thread). */
  onReply: (topId: string, name: string) => void;
  /** Pins (or unpins) a top-level comment; the API allows only the post's creator. */
  onPin: (id: string, pin: boolean) => void;
  /** Saves an edit. Resolves to an error message to show in the editor, or null on success. */
  onEdit: (id: string, body: string) => Promise<string | null>;
};

const ACTION =
  'flex min-h-11 items-center text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

function Avatar({ name, url }: { name: string; url?: string | null }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
    return <img src={url} alt="" className="size-8 shrink-0 rounded-full object-cover" />;
  }
  return (
    <span
      aria-hidden
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-extrabold text-accent-foreground"
    >
      {initials(name)}
    </span>
  );
}

/** One comment or reply row. Each feature appears only when the API sent its field (US-017 to US-020). */
export function CommentItem({
  comment,
  reply = false,
  postId,
  path,
  loggedIn,
  canReply,
  pending,
  onDelete,
  onReply,
  onEdit,
  onPin,
  topId,
}: CommentRowProps & { comment: PostComment | PostReply; reply?: boolean; topId: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  // Focus after the menu has closed: its focus trap would take it back during the same render.
  useEffect(() => {
    if (!editing) return;
    const id = requestAnimationFrame(() => editRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [editing]);
  // The text of a deleted comment is never rendered, whatever the response carries.
  if (comment.deleted) {
    return <p className="py-1 text-sm text-muted-foreground italic">Komentar dihapus</p>;
  }
  const pinned = !reply && 'pinned' in comment && comment.pinned === true;
  return (
    <div className="flex min-w-0 gap-3">
      <Avatar name={comment.author.displayName} url={comment.avatarUrl} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {pinned && (
          <p className="flex items-center gap-1 text-xs font-semibold text-primary-ink">
            <Pin aria-hidden className="size-3" />
            Disematkan oleh creator
          </p>
        )}
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm">
          <span className="truncate font-bold">{comment.author.displayName}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            <time dateTime={comment.createdAt}>
              {formatRelativeTime(comment.createdAt, new Date())}
            </time>
            {comment.editedAt && ' · Diedit'}
          </span>
        </p>
        {/* Plain text: React escapes it; never render comments as HTML or markdown. */}
        {editing ? (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSaving(true);
              void onEdit(comment.id, draft.trim()).then((error) => {
                setSaving(false);
                // On failure the editor and the draft stay.
                if (error) return setEditError(error);
                setEditing(false);
                requestAnimationFrame(() => menuRef.current?.focus());
              });
            }}
          >
            <Label htmlFor={`edit-${comment.id}`} className="sr-only">
              {reply ? 'Edit balasan' : 'Edit komentar'}
            </Label>
            <Textarea
              id={`edit-${comment.id}`}
              ref={editRef}
              rows={2}
              value={draft}
              maxLength={POST_COMMENT_MAX_LENGTH}
              onChange={(e) => {
                setDraft(e.target.value);
                setEditError(null);
              }}
            />
            {editError && (
              <p role="alert" className="text-xs text-destructive">
                {editError}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {draft.length}/{POST_COMMENT_MAX_LENGTH}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditing(false);
                    setEditError(null);
                    // The trigger is back in the DOM after this render.
                    requestAnimationFrame(() => menuRef.current?.focus());
                  }}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={saving || draft.trim() === ''}>
                  Simpan
                </Button>
              </div>
            </div>
          </form>
        ) : (
          <p className="text-sm wrap-break-word whitespace-pre-wrap">{comment.body}</p>
        )}
        <div className={editing ? 'hidden' : 'flex items-center gap-3'}>
          <CommentLikeButton
            postId={postId}
            commentId={comment.id}
            path={path}
            likeCount={comment.likeCount}
            liked={comment.liked}
            loggedIn={loggedIn}
          />
          {canReply &&
            (loggedIn ? (
              <button
                type="button"
                className={ACTION}
                onClick={() => onReply(topId, comment.author.displayName)}
              >
                Balas
              </button>
            ) : (
              <Link href={loginHref(path)} className={ACTION}>
                Balas
              </Link>
            ))}
          <CommentActionsMenu
            authorName={comment.author.displayName}
            reply={reply}
            canEdit={comment.canEdit}
            canDelete={comment.canDelete}
            canPin={comment.canPin}
            pinned={pinned}
            disabled={pending}
            triggerRef={menuRef}
            onEdit={() => {
              setDraft(comment.body);
              setEditing(true);
            }}
            onDelete={() => onDelete(comment.id)}
            onPin={() => onPin(comment.id, !pinned)}
          />
        </div>
      </div>
    </div>
  );
}
