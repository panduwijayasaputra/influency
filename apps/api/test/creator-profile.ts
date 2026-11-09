import { CREATOR_AGREEMENT_VERSION } from '@influency/shared';

/** Required application columns for creator_profiles rows created directly in specs. */
export function profileFields(displayName = 'Spec Creator') {
  return {
    displayName,
    agreementVersion: CREATOR_AGREEMENT_VERSION,
    agreementAcceptedAt: new Date(),
  };
}

/**
 * Specs of append-only features (wallet, purchases, subscriptions) cannot delete the creators they create. A very old
 * `createdAt` keeps those leftovers at the end of ranked public lists (e.g. GET /creators/recommended), so other specs
 * that rank creators by follower count and recency are not pushed out of the top N.
 */
export const LEFTOVER_CREATED_AT = new Date('2000-01-01T00:00:00.000Z');
