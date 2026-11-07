import { type NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@influency/shared';
import { isGuestPath } from '@/lib/guest-paths';
import { loginHref } from '@/lib/login-href';

// Default-deny for guests (US-007): only isGuestPath pages open without a session cookie. UX only; the API authorizes.
// shortcut: cookie presence only; a server-revoked session passes until a page validates it (Home does); validate in proxy via /auth/me if that matters.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (request.cookies.has(SESSION_COOKIE) || isGuestPath(pathname)) return NextResponse.next();
  return NextResponse.redirect(new URL(loginHref(pathname + search), request.url));
}

export const config = {
  // Not the API proxy (/api/v1 is rewritten to the API and authorizes itself), Next internals or files.
  matcher: ['/((?!api/|_next/|.*\\.[\\w]+$).*)'],
};
