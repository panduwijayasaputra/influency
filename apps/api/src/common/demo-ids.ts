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
