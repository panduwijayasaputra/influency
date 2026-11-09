'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Revokes the server session (same-origin POST, so the browser sends the cookie and Origin). */
export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setPending(true);
    setFailed(false);
    try {
      const res = await fetch('/api/v1/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.replace('/login');
        // Re-render server components so no logged-in state survives in the router cache.
        router.refresh();
        return;
      }
    } catch {
      // Network error: fall through to the message.
    }
    setPending(false);
    setFailed(true);
  }

  return { logout, pending, failed };
}
