import { describe, expect, it } from 'vitest';
import { NOTIFICATION_PREFERENCE_DEFAULTS } from '@influency/shared';
import { applyPatch, toToggles } from './notification-preferences.js';
import { DEFAULT_OPT_OUT_TYPES } from './notification-types.js';

describe('toToggles', () => {
  it('matches the shared defaults for a user without a row', () => {
    expect(toToggles(DEFAULT_OPT_OUT_TYPES, true)).toEqual(NOTIFICATION_PREFERENCE_DEFAULTS);
  });

  it('hides the earnings toggle for non-creators', () => {
    expect(toToggles([], false).earnings).toBeNull();
  });

  it('shows earnings off when any of its types is opted out', () => {
    expect(toToggles(['TIP_RECEIVED'], true).earnings).toBe(false);
  });
});

describe('applyPatch', () => {
  it('adds and removes only the patched types', () => {
    expect(applyPatch(['COMMENT_LIKE'], { commentLike: true, newPost: false })).toEqual([
      'NEW_POST',
    ]);
  });

  it('switches all earnings types together', () => {
    expect(applyPatch([], { earnings: false })).toEqual([
      'NEW_SUBSCRIBER',
      'POST_UNLOCKED',
      'TIP_RECEIVED',
    ]);
    expect(applyPatch(['POST_UNLOCKED', 'TIP_RECEIVED'], { earnings: true })).toEqual([]);
  });

  it('is idempotent and ignores telegramAllowed and transactional types', () => {
    const once = applyPatch(['TOPUP_CREDITED'], { newPost: false, telegramAllowed: true });
    expect(applyPatch(once, { newPost: false })).toEqual(once);
    expect(once).toEqual(['NEW_POST', 'TOPUP_CREDITED']);
  });
});
