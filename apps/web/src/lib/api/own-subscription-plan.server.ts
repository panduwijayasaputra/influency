import {
  API_PREFIX,
  type OwnSubscriptionPlanResponse,
  ownSubscriptionPlanResponseSchema,
  SESSION_COOKIE,
} from '@influency/shared';
import { cookies } from 'next/headers';
import { API_ORIGIN } from './origin';

/**
 * Server only. The creator's own plan (active or not), or null when they never set one. A failure throws instead of
 * reading as "no plan": Edit Profil must not offer to create a plan over an existing one.
 */
export async function getMyOwnPlan(): Promise<OwnSubscriptionPlanResponse['plan']> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const res = await fetch(`${API_ORIGIN}/${API_PREFIX}/creators/me/subscription-plan`, {
    headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {},
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GET /creators/me/subscription-plan failed: ${res.status}`);
  return ownSubscriptionPlanResponseSchema.parse(await res.json()).plan;
}
