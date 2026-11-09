import {
  type OwnSubscriptionPlanResponse,
  ownSubscriptionPlanResponseSchema,
  type PutSubscriptionPlanRequest,
} from '@influency/shared';
import { sendJson } from './errors';

/** PUT /creators/me/subscription-plan: appends a new plan version; it applies to later subscriptions only. */
export async function saveOwnPlan(
  body: PutSubscriptionPlanRequest,
): Promise<OwnSubscriptionPlanResponse> {
  return sendJson('PUT', '/creators/me/subscription-plan', ownSubscriptionPlanResponseSchema, {
    body,
  });
}
