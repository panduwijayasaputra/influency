import { z } from 'zod';
import { PLAN_PRICE_MAX, PLAN_PRICE_MIN } from './constants.js';
import { POST_OFFER_MAX_PRICE_COINS, POST_OFFER_MIN_PRICE_COINS } from './posts.js';

/** LOCKED (Monetization Spec v1 §2). Unlock bounds are POST_OFFER_*_PRICE_COINS. */
export const SUBSCRIPTION_DAYS = 30;
/** LOCKED (Monetization Spec v1 §2): Influency keeps 15% of a subscription, the creator 85%. */
export const SUBSCRIPTION_FEE_BPS = 1500;
export const TIP_MIN = 1;
export const TIP_MAX = 1000;

/** `expectedPriceCoins` is the price the user saw; the server answers OFFER_CHANGED if the DB price differs. */
export const purchasePostRequestSchema = z.strictObject({
  expectedPriceCoins: z.int().min(POST_OFFER_MIN_PRICE_COINS).max(POST_OFFER_MAX_PRICE_COINS),
});
export type PurchasePostRequest = z.infer<typeof purchasePostRequestSchema>;
export const purchasePostResponseSchema = z.object({
  purchaseId: z.uuid(),
  postId: z.uuid(),
  priceCoins: z.int(),
  balanceCoins: z.int().nonnegative(),
  /** true when this response charged nothing: the viewer already owned the post, or it replays an earlier request. */
  alreadyOwned: z.boolean(),
});
export type PurchasePostResponse = z.infer<typeof purchasePostResponseSchema>;

export const subscriptionPeriodSchema = z.object({
  periodId: z.uuid(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  priceCoins: z.int(),
});
export type SubscriptionPeriod = z.infer<typeof subscriptionPeriodSchema>;

/** GET /creators/:slug/subscription: the plan, plus the signed-in viewer's state (null for guests). */
export const creatorSubscriptionStateSchema = z.object({
  plan: z.object({ priceCoins: z.int(), durationDays: z.literal(SUBSCRIPTION_DAYS) }).nullable(),
  viewer: z
    .object({
      /** The period covering server now. */
      current: subscriptionPeriodSchema.nullable(),
      /** A prepaid future period (at most one). */
      scheduled: subscriptionPeriodSchema.nullable(),
      canTip: z.boolean(),
    })
    .nullable(),
});
export type CreatorSubscriptionState = z.infer<typeof creatorSubscriptionStateSchema>;

export const subscribeRequestSchema = z.strictObject({
  expectedPriceCoins: z.int().min(PLAN_PRICE_MIN).max(PLAN_PRICE_MAX),
});
export type SubscribeRequest = z.infer<typeof subscribeRequestSchema>;
export const subscribeResponseSchema = subscriptionPeriodSchema.extend({
  scheduled: z.boolean(),
  balanceCoins: z.int().nonnegative(),
});
export type SubscribeResponse = z.infer<typeof subscribeResponseSchema>;

export const cancelScheduledResponseSchema = z.object({
  periodId: z.uuid(),
  refundedCoins: z.int().positive(),
  balanceCoins: z.int().nonnegative(),
});
export type CancelScheduledResponse = z.infer<typeof cancelScheduledResponseSchema>;

export const tipRequestSchema = z.strictObject({ amountCoins: z.int().min(TIP_MIN).max(TIP_MAX) });
export type TipRequest = z.infer<typeof tipRequestSchema>;
export const tipResponseSchema = z.object({
  tipId: z.uuid(),
  amountCoins: z.int(),
  balanceCoins: z.int().nonnegative(),
});
export type TipResponse = z.infer<typeof tipResponseSchema>;

/** PUT /creators/me/subscription-plan. Strict: the duration is fixed at 30 days, so it cannot be sent. */
export const putSubscriptionPlanRequestSchema = z.strictObject({
  priceCoins: z.int().min(PLAN_PRICE_MIN).max(PLAN_PRICE_MAX),
  active: z.boolean(),
});
export type PutSubscriptionPlanRequest = z.infer<typeof putSubscriptionPlanRequestSchema>;

/** The owner's current plan version (active or not), or null when they never set one. */
export const ownSubscriptionPlanResponseSchema = z.object({
  plan: z
    .object({
      version: z.int(),
      priceCoins: z.int(),
      durationDays: z.literal(SUBSCRIPTION_DAYS),
      active: z.boolean(),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
});
export type OwnSubscriptionPlanResponse = z.infer<typeof ownSubscriptionPlanResponseSchema>;

/** Creator share in IDR of a subscription price, same half-up rule as the API revenue split (gross × bps / 10.000). */
export function subscriptionCreatorShareIdr(priceCoins: number, koinToIdr: number): number {
  const gross = priceCoins * koinToIdr;
  return gross - Math.floor((gross * SUBSCRIPTION_FEE_BPS + 5_000) / 10_000);
}
