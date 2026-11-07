'use client';

import { type RefObject, useEffect, useState } from 'react';

/** Latches true once the element comes within 200 px of the viewport (lazy media fetch). */
export function useNearViewport(ref: RefObject<Element | null>): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setNear(true);
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, near]);
  return near;
}
