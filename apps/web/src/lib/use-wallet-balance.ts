'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchWallet } from '@/lib/api/wallet';

type State = { balance: number | null; error: boolean };

/** The signed-in user's Koin balance. `enabled=false` skips the request (e.g. a closed drawer). */
export function useWalletBalance(enabled = true) {
  const [state, setState] = useState<State>({ balance: null, error: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // Start from a timer: react-hooks/set-state-in-effect forbids setting state in the effect body.
    const id = setTimeout(() => {
      fetchWallet().then(
        (w) => !cancelled && setState({ balance: w.balanceCoins, error: false }),
        () => !cancelled && setState((s) => ({ ...s, error: true })),
      );
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [enabled, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
