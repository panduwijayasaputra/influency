'use client';

import { type SyntheticEvent, useEffect, useState } from 'react';
import { API_PREFIX, type MediaAccessResponse, mediaAccessResponseSchema } from '@influency/shared';
import { Button } from '@/components/ui/button';

/** Fetch fresh URLs this long before the current ones expire. */
const REFRESH_LEAD_MS = 60_000;

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; access: MediaAccessResponse }
  | { kind: 'locked' | 'missing' | 'failed' };

const MESSAGES = {
  loading: 'Memuat media…',
  locked: 'Konten ini terkunci.',
  missing: 'Media tidak tersedia.',
  failed: 'Gagal memuat media.',
} as const;

const blockMenu = (event: SyntheticEvent) => event.preventDefault();

async function fetchAccess(postId: string): Promise<State> {
  try {
    const res = await fetch(`/${API_PREFIX}/posts/${postId}/media-access`, { cache: 'no-store' });
    if (res.status === 403) return { kind: 'locked' };
    if (res.status === 404) return { kind: 'missing' };
    const parsed = mediaAccessResponseSchema.safeParse(res.ok ? await res.json() : null);
    return parsed.success ? { kind: 'ready', access: parsed.data } : { kind: 'failed' };
  } catch {
    return { kind: 'failed' };
  }
}

/**
 * Viewable media of a post. URLs come from GET /posts/:id/media-access (server-side access check) in the browser
 * only, so they never end up in SSR HTML, and are refreshed before they expire. The watermark deters casual sharing;
 * it doesn't stop screen recording (docs/media-protection.md).
 */
export function PostMediaViewer({ postId }: { postId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  // Bumped to fetch again (retry, refresh before expiry).
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    void fetchAccess(postId).then((next) => live && setState(next));
    return () => {
      live = false;
    };
  }, [postId, version]);

  const expiresAt = state.kind === 'ready' ? state.access.expiresAt : null;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(
      () => setVersion((v) => v + 1),
      Math.max(0, Date.parse(expiresAt) - Date.now() - REFRESH_LEAD_MS),
    );
    return () => clearTimeout(timer);
  }, [expiresAt]);

  if (state.kind !== 'ready') {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-muted-foreground">{MESSAGES[state.kind]}</p>
        {state.kind === 'failed' && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setVersion((v) => v + 1)}
          >
            Coba lagi
          </Button>
        )}
      </div>
    );
  }

  const { media, watermark } = state.access;
  if (media.length === 0) return <p className="text-sm text-muted-foreground">Belum ada media.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {media.map((item) => (
        <li key={item.id} className="relative overflow-hidden rounded-md bg-muted">
          {item.kind === 'IMAGE' ? (
            /* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL; next/image would fetch and cache it */
            <img
              src={item.url}
              alt=""
              draggable={false}
              onContextMenu={blockMenu}
              className="w-full select-none"
            />
          ) : item.player === 'iframe' ? (
            <iframe
              src={item.url}
              title="Video"
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full border-0"
            />
          ) : (
            <video
              src={item.url}
              controls
              controlsList="nodownload"
              disablePictureInPicture
              onContextMenu={blockMenu}
              className="aspect-video w-full"
            />
          )}
          {watermark && (
            <span
              aria-hidden
              data-testid="watermark"
              className="pointer-events-none absolute top-2 right-2 rounded bg-black/30 px-1.5 py-0.5 text-xs text-white/70 select-none"
            >
              influency · {watermark}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
