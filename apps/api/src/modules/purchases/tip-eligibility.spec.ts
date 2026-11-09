import { describe, expect, it } from 'vitest';
import { isTipEligible, type TipFacts } from './tip-eligibility.js';

const base: TipFacts = {
  isSelf: false,
  creatorPublic: true,
  hasActivePeriod: false,
  hasPurchaseFromCreator: false,
};

describe('isTipEligible', () => {
  it('needs an active subscription or a purchase from the creator', () => {
    expect(isTipEligible(base)).toBe(false);
    expect(isTipEligible({ ...base, hasActivePeriod: true })).toBe(true);
    expect(isTipEligible({ ...base, hasPurchaseFromCreator: true })).toBe(true);
    expect(isTipEligible({ ...base, hasActivePeriod: true, hasPurchaseFromCreator: true })).toBe(
      true,
    );
  });

  it('never allows a self-tip, even with a purchase or subscription', () => {
    expect(isTipEligible({ ...base, isSelf: true, hasActivePeriod: true })).toBe(false);
    expect(isTipEligible({ ...base, isSelf: true, hasPurchaseFromCreator: true })).toBe(false);
  });

  it('never allows a tip to a creator that is not public', () => {
    expect(isTipEligible({ ...base, creatorPublic: false, hasActivePeriod: true })).toBe(false);
  });
});
