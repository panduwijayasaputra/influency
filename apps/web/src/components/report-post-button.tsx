'use client';

import { Flag } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  API_PREFIX,
  errorResponseSchema,
  MODERATION_NOTE_MAX_LENGTH,
  POST_REPORT_REASONS,
  type PostReportReason,
  type PublicPostDetail,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { loginHref } from '@/lib/login-href';
import { REPORT_REASON_LABELS } from '@/lib/report-reasons';

type Props = {
  postId: string;
  /** This post's page, where login returns to. */
  path: string;
  viewer: PublicPostDetail['viewer'];
};

const FAILED = 'Gagal mengirim laporan. Coba lagi.';
const linkClass =
  'flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground';

/** "Laporkan" (US-042). Logged out → login link; own or unpublished post → nothing. The API enforces the rule. */
export function ReportPostButton({ postId, path, viewer }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<PostReportReason | null>(null);
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const legendRef = useRef<HTMLLegendElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (open) legendRef.current?.focus();
  }, [open]);
  useEffect(() => {
    if (sent) statusRef.current?.focus();
  }, [sent]);

  if (!viewer) {
    return (
      <Link href={loginHref(path)} className={linkClass}>
        <Flag aria-hidden className="size-4" />
        Laporkan
      </Link>
    );
  }
  if (!viewer.canReport) return null;
  if (sent) {
    return (
      <p ref={statusRef} tabIndex={-1} role="status" className="text-sm text-muted-foreground">
        Terima kasih, laporan Anda akan ditinjau.
      </p>
    );
  }
  if (!open) {
    return (
      <Button variant="ghost" size="sm" className="w-fit" onClick={() => setOpen(true)}>
        <Flag aria-hidden className="size-4" />
        Laporkan
      </Button>
    );
  }

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
        return;
      }
      const parsed = errorResponseSchema.safeParse(await res.json().catch(() => null));
      setError(parsed.success ? parsed.data.error.message : FAILED);
    } catch {
      setError(FAILED);
    }
    setPending(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-3 rounded-lg border p-4">
      <fieldset className="flex flex-col gap-2">
        <legend ref={legendRef} tabIndex={-1} className="mb-1 font-medium outline-none">
          Laporkan postingan ini
        </legend>
        {POST_REPORT_REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
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
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!canSubmit}>
          Kirim laporan
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Batal
        </Button>
      </div>
    </form>
  );
}
