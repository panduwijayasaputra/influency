'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { errorResponseSchema, rejectCreatorApplicationSchema } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

/** Approve / reject one application. The API enforces AdminGuard and the PENDING_REVIEW rule. */
export function CreatorApplicationActions({ id }: { id: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function send(action: 'approve' | 'reject', body?: object) {
    setFormError(undefined);
    setPending(true);
    try {
      const res = await fetch(`/api/v1/admin/creators/${id}/${action}`, {
        method: 'POST',
        credentials: 'include',
        ...(body && {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      });
      if (res.ok) {
        router.refresh(); // the card leaves the pending list
        return;
      }
      const { error } = errorResponseSchema.parse(await res.json());
      if (error.code === 'VALIDATION_FAILED') {
        const issues = (error.details?.issues ?? []) as { message: string }[];
        setReasonError(issues[0]?.message ?? error.message);
      } else {
        setFormError(error.message);
        if (error.code === 'CREATOR_APPLICATION_NOT_PENDING') router.refresh();
      }
    } catch {
      setFormError('Gagal mengirim keputusan. Silakan coba lagi.');
    }
    setPending(false);
  }

  function submitReject(event: FormEvent) {
    event.preventDefault();
    const parsed = rejectCreatorApplicationSchema.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message);
      return;
    }
    setReasonError(undefined);
    void send('reject', parsed.data);
  }

  const reasonId = `reason-${id}`;
  return (
    <div className="flex flex-col gap-3">
      {!rejecting ? (
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => void send('approve')}>
            Setujui
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => setRejecting(true)}>
            Tolak
          </Button>
        </div>
      ) : (
        <form onSubmit={submitReject} noValidate className="flex flex-col gap-2">
          <Label htmlFor={reasonId}>Alasan penolakan (terlihat oleh pemohon)</Label>
          <Textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            aria-invalid={reasonError ? true : undefined}
            aria-describedby={reasonError ? `${reasonId}-error` : undefined}
          />
          {reasonError && (
            <p id={`${reasonId}-error`} className="text-sm text-destructive">
              {reasonError}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              Kirim penolakan
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setRejecting(false)}
            >
              Batal
            </Button>
          </div>
        </form>
      )}
      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
    </div>
  );
}
