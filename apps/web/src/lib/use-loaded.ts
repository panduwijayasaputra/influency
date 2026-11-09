'use client';

import { useCallback, useEffect, useState } from 'react';

export type Loaded<T> = { status: 'loading' } | { status: 'error' } | { status: 'ready'; data: T };

/**
 * Loads one thing on mount. `reload` refetches and keeps showing the old data until the new answer arrives;
 * `retry` (after an error) goes back to loading. A late answer from a stale request is ignored.
 */
export function useLoaded<T>(load: () => Promise<T>) {
  const [result, setResult] = useState<Loaded<T>>({ status: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    load().then(
      (data) => {
        if (current) setResult({ status: 'ready', data });
      },
      () => {
        if (current) setResult({ status: 'error' });
      },
    );
    return () => {
      current = false;
    };
    // `load` is a module-level function; only an explicit reload refetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const retry = useCallback(() => {
    setResult({ status: 'loading' });
    setVersion((v) => v + 1);
  }, []);
  return { result, reload, retry };
}
