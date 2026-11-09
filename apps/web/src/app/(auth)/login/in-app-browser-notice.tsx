'use client';

import { useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';

// shortcut: Instagram/TikTok UA substrings only; add FBAN/FBAV/Line when real devices show login breaking there.
export const IN_APP_BROWSER_UA = /Instagram|musical_ly|BytedanceWebview|TikTok/i;

export function isInAppBrowser(userAgent: string): boolean {
  return IN_APP_BROWSER_UA.test(userAgent);
}

const noSubscribe = () => () => {};

/** "Open in browser" fallback: OIDC login can fail inside Instagram/TikTok webviews. */
export function InAppBrowserNotice() {
  // Server snapshot is `false`, so SSR and hydration match; the UA never changes, so no subscription.
  const inApp = useSyncExternalStore(
    noSubscribe,
    () => isInAppBrowser(navigator.userAgent),
    () => false,
  );
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');

  if (!inApp) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-md border px-4 py-3 text-sm">
      <h2 className="font-semibold">Buka di browser agar login lancar</h2>
      <p className="text-muted-foreground">
        Login dengan Telegram mungkin tidak berhasil di browser Instagram atau TikTok. Ketuk menu ⋯
        lalu pilih &quot;Buka di browser&quot;, atau salin tautan ini dan buka di Chrome/Safari.
      </p>
      <Button variant="outline" onClick={() => void copyLink()}>
        {copy === 'copied' ? 'Tautan disalin' : 'Salin tautan'}
      </Button>
      <p role="status" className="sr-only">
        {copy === 'copied' ? 'Tautan disalin' : ''}
      </p>
      {copy === 'failed' && (
        <input
          readOnly
          aria-label="Tautan halaman ini"
          value={window.location.href}
          onFocus={(e) => e.currentTarget.select()}
          className="rounded-md border px-3 py-2"
        />
      )}
    </section>
  );
}
