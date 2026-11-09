/** Fixed demo ids (handoff §15.5) so later seed steps and tests can reference them. */
export const DEMO_USER_IDS = {
  claudia: '0190a000-0000-7000-8000-000000000001',
  creatorB: '0190a000-0000-7000-8000-000000000002',
  subscriberA: '0190a000-0000-7000-8000-000000000003',
  subscriberB: '0190a000-0000-7000-8000-000000000004',
  admin: '0190a000-0000-7000-8000-000000000005',
} as const;

export const DEMO_CREATOR_PROFILE_IDS = {
  claudia: '0190a000-0000-7000-8000-000000000101',
  creatorB: '0190a000-0000-7000-8000-000000000102',
  subscriberB: '0190a000-0000-7000-8000-000000000103',
} as const;

/** Version 1 of the demo creators' subscription plans (purchases US-035). */
export const DEMO_SUBSCRIPTION_PLAN_IDS = {
  claudia: '0190a000-0000-7000-8000-000000000201',
  creatorB: '0190a000-0000-7000-8000-000000000202',
} as const;

/** The LOCKED Koin top-up packages (Monetization Spec v1 §2), keyed by Koin amount. */
export const DEMO_COIN_PACKAGE_IDS = {
  10: '0190a000-0000-7000-8000-000000000a10',
  25: '0190a000-0000-7000-8000-000000000a25',
  50: '0190a000-0000-7000-8000-000000000a50',
  100: '0190a000-0000-7000-8000-000000000b00',
  250: '0190a000-0000-7000-8000-000000000b50',
} as const;
