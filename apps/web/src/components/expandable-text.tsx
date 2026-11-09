'use client';

import Link from 'next/link';
import { useState } from 'react';
import { cn } from '@/lib/utils';

/** Text this long, or with a line break, gets "Selengkapnya" (a heuristic: no layout measuring). */
const LONG_TEXT = 120;

/** Two lines with Selengkapnya / Sembunyikan when longer; line breaks are kept. `href` makes the text a link (post captions). */
export function ExpandableText({
  text,
  href,
  className,
  expanded: forced = false,
}: {
  text: string;
  href?: string;
  className?: string;
  /** Always fully shown, without the Selengkapnya toggle (a post's own page). */
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const expanded = forced || open;
  const long = !forced && (text.length > LONG_TEXT || text.includes('\n'));
  const paragraph = (
    <p
      className={cn('wrap-break-word whitespace-pre-line', !expanded && 'line-clamp-2', className)}
    >
      {text}
    </p>
  );
  return (
    <div>
      {href ? (
        <Link href={href} className="block hover:underline">
          {paragraph}
        </Link>
      ) : (
        paragraph
      )}
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setOpen((v) => !v)}
          className="mt-1 min-h-11 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          {expanded ? 'Sembunyikan' : 'Selengkapnya'}
        </button>
      )}
    </div>
  );
}
