import { CREATOR_AGREEMENT_VERSION } from '@influency/shared';

/** Required application columns for creator_profiles rows created directly in specs. */
export function profileFields(displayName = 'Spec Creator') {
  return {
    displayName,
    agreementVersion: CREATOR_AGREEMENT_VERSION,
    agreementAcceptedAt: new Date(),
  };
}
