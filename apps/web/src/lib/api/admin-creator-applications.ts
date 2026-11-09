import { cookies } from 'next/headers';
import {
  type AdminCreatorApplication,
  adminCreatorApplicationListSchema,
  API_PREFIX,
  SESSION_COOKIE,
} from '@influency/shared';
import { API_ORIGIN } from './origin';

/** Server only. Pending creator applications for the admin review queue (API enforces AdminGuard). */
export async function getPendingCreatorApplications(): Promise<AdminCreatorApplication[]> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/admin/creators/applications`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}, // forward only the session cookie
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GET /admin/creators/applications failed: ${res.status}`);
  return adminCreatorApplicationListSchema.parse(await res.json()).applications;
}
