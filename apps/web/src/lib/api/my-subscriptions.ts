import { API_PREFIX, type MySubscriptionList, mySubscriptionListSchema } from '@influency/shared';

/** The caller's active subscriptions (GET /me/subscriptions), soonest to expire first. */
export async function fetchMySubscriptions(): Promise<MySubscriptionList> {
  const res = await fetch(`/${API_PREFIX}/me/subscriptions`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /me/subscriptions failed: ${res.status}`);
  return mySubscriptionListSchema.parse(await res.json());
}
