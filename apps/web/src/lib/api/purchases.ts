import {
  API_PREFIX,
  type CancelScheduledResponse,
  cancelScheduledResponseSchema,
  type CreatorSubscriptionState,
  creatorSubscriptionStateSchema,
  type PublicPostDetail,
  publicPostDetailSchema,
  type PurchasePostResponse,
  purchasePostResponseSchema,
  type SubscribeResponse,
  subscribeResponseSchema,
  type TipResponse,
  tipResponseSchema,
} from '@influency/shared';
import { postJson } from './errors';

/** Unlocks a premium post. `expectedPriceCoins` is the price the user saw; `key` is kept across retries of one attempt. */
export function purchasePost(
  postId: string,
  expectedPriceCoins: number,
  key: string,
): Promise<PurchasePostResponse> {
  return postJson(`/posts/${encodeURIComponent(postId)}/purchase`, purchasePostResponseSchema, {
    body: { expectedPriceCoins },
    idempotencyKey: key,
  });
}

/** Subscribes (30 days), or prepays the next period when already subscribed. `key` is kept across retries of one attempt. */
export function subscribeCreator(
  slug: string,
  expectedPriceCoins: number,
  key: string,
): Promise<SubscribeResponse> {
  return postJson(`/creators/${encodeURIComponent(slug)}/subscribe`, subscribeResponseSchema, {
    body: { expectedPriceCoins },
    idempotencyKey: key,
  });
}

/** Cancels the caller's prepaid renewal before it starts and returns all of its Koin. Safe to repeat. */
export function cancelScheduledRenewal(periodId: string): Promise<CancelScheduledResponse> {
  return postJson(
    `/subscription-periods/${encodeURIComponent(periodId)}/cancel-scheduled`,
    cancelScheduledResponseSchema,
  );
}

/**
 * Sends a tip to a creator (profile) or on a premium post. All of it goes to the creator and it opens nothing. `key` is
 * kept across retries of the same amount; the API checks eligibility again.
 */
export function sendTip(
  target: { creatorSlug: string } | { postId: string },
  amountCoins: number,
  key: string,
): Promise<TipResponse> {
  const path =
    'postId' in target
      ? `/posts/${encodeURIComponent(target.postId)}/tips`
      : `/creators/${encodeURIComponent(target.creatorSlug)}/tips`;
  return postJson(path, tipResponseSchema, { body: { amountCoins }, idempotencyKey: key });
}

/** The creator's plan and the signed-in viewer's subscription state (client side, for a refresh). */
export async function fetchCreatorSubscription(slug: string): Promise<CreatorSubscriptionState> {
  const res = await fetch(`/${API_PREFIX}/creators/${encodeURIComponent(slug)}/subscription`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`GET /creators/:slug/subscription failed: ${res.status}`);
  return creatorSubscriptionStateSchema.parse(await res.json());
}

/** The post as the signed-in viewer sees it now (real endpoint); used to re-render a card after an unlock. */
export async function fetchPublicPost(slug: string, postId: string): Promise<PublicPostDetail> {
  const res = await fetch(
    `/${API_PREFIX}/creators/${encodeURIComponent(slug)}/posts/${encodeURIComponent(postId)}`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) throw new Error(`GET /creators/:slug/posts/:postId failed: ${res.status}`);
  return publicPostDetailSchema.parse(await res.json());
}
