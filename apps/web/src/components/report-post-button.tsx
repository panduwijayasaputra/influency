'use client';

import { Flag } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  API_PREFIX,
  errorResponseSchema,
  MODERATION_NOTE_MAX_LENGTH,
  POST_REPORT_REASONS,
  type PostReportReason,
  type PublicPostDetail,
} from '@influency/shared';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { loginHref } from '@/lib/login-href';
import { REPORT_REASON_LABELS } from '@/lib/report-reasons';

type Props = {
  postId: string;
  /** This post's page, where login returns to. */
  path: string;
  viewer: PublicPostDetail['viewer'];
};

const FAILED = 'Gagal mengirim laporan. Coba lagi.';
const THANKS = 'Terima kasih, laporan Anda akan ditinjau.';
const linkClass =
  'flex min-h-11 w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground';

/** "Laporkan" (US-042) in a bottom sheet. Logged out → login link; own or unpublished post → nothing. The API enforces the rule. */
export function ReportPostButton({ postId, path, viewer }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<PostReportReason | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const toast = useToast();

  if (!viewer) {
    return (
      <Link href={loginHref(path)} className={linkClass}>
        <Flag aria-hidden className="size-4" />
        Laporkan
      </Link>
    );
  }
  if (!viewer.canReport) return null;

  const noteRequired = reason === 'OTHER';
  const canSubmit = reason !== null && (!noteRequired || note.trim() !== '') && !pending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/${API_PREFIX}/posts/${postId}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, ...(note.trim() ? { note } : {}) }),
      });
      if (res.ok) {
        setSent(true);
        setOpen(false);
        toast(THANKS);
        return;
      }
      const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
      setError(parsed.success ? parsed.data.error.message : FAILED);
    } catch {
      setError(FAILED);
    }
    setPending(false);
  }

  // The toast announces success; this stays as the visible marker and takes focus from the removed trigger.
  const status = (
    <p ref={statusRef} tabIndex={-1} className="text-sm text-muted-foreground outline-none">
      Laporan terkirim.
    </p>
  );

  return (
    <>
      {sent && status}
      <BottomSheet
        title="Laporkan postingan ini"
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) setError(null);
        }}
        onCloseAutoFocus={(e) => {
          if (!sent) return;
          e.preventDefault();
          statusRef.current?.focus();
        }}
        trigger={
          sent ? undefined : (
            <Button variant="ghost" size="sm" className="w-fit">
              <Flag aria-hidden className="size-4" />
              Laporkan
            </Button>
          )
        }
      >
        <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-bold">Alasan</legend>
            {POST_REPORT_REASONS.map((r) => (
              <label key={r} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="size-4 accent-primary"
                />
                {REPORT_REASON_LABELS[r]}
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`report-note-${postId}`}>
              Keterangan{noteRequired ? '' : ' (opsional)'}
            </Label>
            <Textarea
              id={`report-note-${postId}`}
              value={note}
              maxLength={MODERATION_NOTE_MAX_LENGTH}
              required={noteRequired}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!canSubmit}>
            Kirim laporan
          </Button>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Batal
          </Button>
        </form>
      </BottomSheet>
    </>
  );
}
