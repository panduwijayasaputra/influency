'use client';

import { Bookmark } from 'lucide-react';
import { useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { setSaved } from '@/lib/api/post-save';
import { cn } from '@/lib/utils';

/** Simpan toggle (user-area US-044): optimistic, rolled back with a toast when the request fails. Saving grants nothing. */
export function SaveButton({
  postId,
  initialSaved,
  className,
}: {
  postId: string;
  initialSaved: boolean;
  className?: string;
}) {
  const toast = useToast();
  const [saved, setSavedState] = useState(initialSaved);
  const pending = useRef(false);

  async function toggle() {
    if (pending.current) return;
    pending.current = true;
    const next = !saved;
    setSavedState(next);
    const result = await setSaved(postId, next);
    pending.current = false;
    if (result === null) {
      setSavedState(!next);
      toast('Gagal menyimpan. Coba lagi.');
      return;
    }
    setSavedState(result);
    toast(result ? 'Disimpan ke Koleksi Saya' : 'Dihapus dari Disimpan');
  }

  return (
    <button
      type="button"
      aria-label={saved ? 'Hapus dari Disimpan' : 'Simpan'}
      aria-pressed={saved}
      onClick={() => void toggle()}
      className={className}
    >
      <Bookmark aria-hidden className={cn('size-5', saved && 'fill-current text-brand')} />
    </button>
  );
}
