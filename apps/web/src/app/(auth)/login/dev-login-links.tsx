import { API_PREFIX, safeReturnTo } from '@influency/shared';
import { Button } from '@/components/ui/button';

// Keys match DEMO_USER_IDS in the API (apps/api/src/common/demo-ids.ts); the API rejects unknown ones.
const DEMO_USERS = [
  { user: 'claudia', label: 'Claudia (kreator)' },
  { user: 'creatorB', label: 'Creator B (kreator)' },
  { user: 'subscriberA', label: 'Subscriber A' },
  { user: 'subscriberB', label: 'Subscriber B' },
  { user: 'admin', label: 'Admin' },
];

export function devLoginHref(user: string, returnTo: unknown): string {
  const params = new URLSearchParams({ user });
  const safe = safeReturnTo(returnTo);
  if (safe !== '/') params.set('returnTo', safe);
  return `/${API_PREFIX}/auth/dev/login?${params.toString()}`;
}

/** Dev only (the login page renders it only outside production; the API also refuses there). */
export function DevLoginLinks({ returnTo }: { returnTo?: unknown }) {
  return (
    <section
      aria-labelledby="dev-login"
      className="flex flex-col gap-2 rounded-md border border-dashed p-4"
    >
      <h2 id="dev-login" className="text-sm font-semibold">
        Mode pengembangan: masuk sebagai pengguna demo
      </h2>
      <div className="flex flex-wrap gap-2">
        {DEMO_USERS.map(({ user, label }) => (
          <Button key={user} asChild variant="outline" size="sm">
            {/* Full navigation: the API sets the cookie and redirects. */}
            <a href={devLoginHref(user, returnTo)}>{label}</a>
          </Button>
        ))}
      </div>
    </section>
  );
}
