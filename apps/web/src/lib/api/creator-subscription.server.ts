import {
  API_PREFIX,
  type CreatorSubscriptionState,
  creatorSubscriptionStateSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { cookies } from 'next/headers';
import { API_ORIGIN } from './origin';

const NONE: CreatorSubscriptionState = { plan: null, viewer: null };

/**
 * Server only. The creator's plan and the viewer's subscription state (cookie forwarded, uncached). Any failure reads
 * as "no plan" so the public page still renders; the API decides every purchase anyway.
 */
export async function getCreatorSubscription(slug: string): Promise<CreatorSubscriptionState> {
  try {
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    const res = await fetch(
      `${API_ORIGIN}/${API_PREFIX}/creators/${encodeURIComponent(slug)}/subscription`,
      { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {}, cache: 'no-store' },
    );
    if (!res.ok) return NONE;
    const parsed = creatorSubscriptionStateSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : NONE;
  } catch {
    return NONE;
  }
}
