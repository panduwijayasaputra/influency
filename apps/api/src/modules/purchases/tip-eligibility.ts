export interface TipFacts {
  /** The tipper owns the creator profile. */
  isSelf: boolean;
  /** The creator is approved and their account active. */
  creatorPublic: boolean;
  /** The tipper has an active subscription period with the creator right now. */
  hasActivePeriod: boolean;
  /** The tipper has bought at least one post of the creator. */
  hasPurchaseFromCreator: boolean;
}

/**
 * Who may tip a creator (spec §6): someone who supports them, by an active subscription or at least one individual
 * purchase. Never yourself, never a creator that is not public. The UI's button is only a hint: the API runs this again
 * when the tip is committed.
 */
export function isTipEligible(f: TipFacts): boolean {
  return !f.isSelf && f.creatorPublic && (f.hasActivePeriod || f.hasPurchaseFromCreator);
}
