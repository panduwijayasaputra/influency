'use client';

import { useEffect, useState } from 'react';

/**
 * Pixels the on-screen keyboard covers at the bottom of the layout viewport (iOS Safari).
 * 0 when inactive, when there is no visualViewport, or when the browser resizes content instead
 * (Android with interactive-widget=resizes-content).
 */
export function useKeyboardInset(active: boolean): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return active ? inset : 0;
}
