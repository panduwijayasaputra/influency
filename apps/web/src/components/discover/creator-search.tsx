'use client';

import { Search, X } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { CREATOR_SEARCH_MAX_LENGTH, type CreatorSearchResult } from '@influency/shared';
import { Button } from '@/components/ui/button';
import { searchCreators } from '@/lib/api/discover';
import { removeRecentCreator, useRecentCreators } from '@/lib/recent-creators';
import { initials } from '@/lib/utils';

const DEBOUNCE_MS = 300;
const RECENT_SHOWN = 5;

type Results =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; query: string; creators: CreatorSearchResult[] }
  | { status: 'error' };

/** Jelajahi → Cari (US-066): search creators; with an empty query, "Baru dilihat" from this device. */
export function CreatorSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results>({ status: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const latest = useRef('');
  const q = query.trim();

  useEffect(() => {
    latest.current = q;
    if (!q) return;
    const timer = setTimeout(() => {
      setResults({ status: 'loading' });
      searchCreators(q).then(
        (creators) => {
          // A slower answer for an older query must not overwrite the current one.
          if (latest.current === q) setResults({ status: 'done', query: q, creators });
        },
        () => {
          if (latest.current === q) setResults({ status: 'error' });
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, attempt]);

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-4 py-4">
      <div className="relative">
        <label htmlFor="discover-search" className="sr-only">
          Cari creator
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="discover-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari creator"
          maxLength={CREATOR_SEARCH_MAX_LENGTH}
          autoComplete="off"
          autoFocus={autoFocus}
          className="h-12 w-full rounded-xl border bg-card pr-3.5 pl-11 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>
      {q ? (
        <SearchResults query={q} results={results} onRetry={() => setAttempt((a) => a + 1)} />
      ) : (
        <RecentCreators />
      )}
    </div>
  );
}

function SearchResults({
  query,
  results,
  onRetry,
}: {
  query: string;
  results: Results;
  onRetry: () => void;
}) {
  if (results.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-center gap-3 py-6 text-center">
        <p className="text-sm text-muted-foreground">Pencarian gagal.</p>
        <Button type="button" variant="outline" onClick={onRetry}>
          Coba lagi
        </Button>
      </div>
    );
  }
  // Until the answer for this exact query is in (debounce or request), show a quiet status.
  if (results.status !== 'done' || results.query !== query) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Mencari…
      </p>
    );
  }
  if (results.creators.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Tidak ada creator yang cocok dengan &ldquo;{query}&rdquo;.
      </p>
    );
  }
  return (
    <section aria-label="Hasil pencarian" className="flex flex-col gap-1">
      {results.creators.map((c) => (
        <CreatorRow key={c.slug} creator={c} />
      ))}
    </section>
  );
}

function RecentCreators() {
  const recent = useRecentCreators();
  const [all, setAll] = useState(false);
  const shown = all ? recent : recent.slice(0, RECENT_SHOWN);
  return (
    <section aria-labelledby="recent-creators" className="flex flex-col gap-1">
      <h2 id="recent-creators" className="mb-1 text-[15px] font-extrabold">
        Baru dilihat
      </h2>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Creator yang kamu lihat akan muncul di sini.
        </p>
      ) : (
        <>
          {shown.map((c) => (
            <CreatorRow
              key={c.slug}
              creator={c}
              action={
                <button
                  type="button"
                  aria-label={`Hapus ${c.displayName} dari baru dilihat`}
                  onClick={() => removeRecentCreator(c.slug)}
                  className="-mr-3 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <X aria-hidden className="size-5" />
                </button>
              }
            />
          ))}
          {!all && recent.length > RECENT_SHOWN && (
            <button
              type="button"
              onClick={() => setAll(true)}
              className="min-h-10 self-start text-sm font-bold text-primary-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Lihat semua
            </button>
          )}
        </>
      )}
    </section>
  );
}

function CreatorRow({ creator, action }: { creator: CreatorSearchResult; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/${creator.slug}`}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {creator.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin API image
          <img
            src={creator.avatarUrl}
            alt=""
            className="size-11 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground"
          >
            {initials(creator.displayName)}
          </span>
        )}
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-bold">{creator.displayName}</span>
          <span className="truncate text-sm text-muted-foreground">@{creator.slug}</span>
        </span>
      </Link>
      {action}
    </div>
  );
}
