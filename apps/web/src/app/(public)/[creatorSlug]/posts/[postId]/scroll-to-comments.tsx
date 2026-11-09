'use client';

import { useEffect } from 'react';

/** The comments stream in after the page, so the browser's own `#komentar` scroll can run too early. */
export function ScrollToComments() {
  useEffect(() => {
    if (window.location.hash === '#komentar') {
      document.getElementById('komentar')?.scrollIntoView({ block: 'start' });
    }
  }, []);
  return null;
}
