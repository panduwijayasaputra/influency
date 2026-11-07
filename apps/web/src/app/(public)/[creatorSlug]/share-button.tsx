'use client';

import { Check, Share } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';

export const SHARE_BUTTON_CLASS =
  'flex size-11 items-center justify-center rounded-full border hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Native share sheet where available (mobile), else copies the page link and confirms with a toast. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  async function share() {
    const url = window.location.href;
    if (navigator.share) {
      // Dismissing the share sheet rejects; nothing to report.
      await navigator.share({ title, url }).catch(() => {});
      return;
    }
    // Clipboard can be blocked (in-app browsers); the button just stays as is.
    await navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        toast('Tautan disalin');
      },
      () => {},
    );
  }
  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-label={copied ? 'Tautan disalin' : 'Bagikan halaman'}
      className={SHARE_BUTTON_CLASS}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Share aria-hidden className="size-4" />}
    </button>
  );
}
