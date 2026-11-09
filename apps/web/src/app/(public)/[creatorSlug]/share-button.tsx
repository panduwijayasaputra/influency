'use client';

import { Check, Share } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/ui/toast';

export const SHARE_BUTTON_CLASS =
  'flex size-11 items-center justify-center rounded-full text-[#45464D] hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

/** Native share sheet where available (mobile), else copies the page link and confirms with a toast. */
export function ShareButton({
  title,
  url: shareUrl,
  label = 'Bagikan halaman',
  className,
}: {
  title: string;
  /** Same-origin path to share (e.g. a post); defaults to the current page. */
  url?: string;
  label?: string;
  /** Replaces the default bordered look. */
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  async function share() {
    const url = shareUrl ? new URL(shareUrl, window.location.origin).href : window.location.href;
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
      aria-label={copied ? 'Tautan disalin' : label}
      className={className ?? SHARE_BUTTON_CLASS}
    >
      {copied ? <Check aria-hidden className="size-4" /> : <Share aria-hidden className="size-4" />}
    </button>
  );
}
