import {
  API_PREFIX,
  type MeResponse,
  meResponseSchema,
  type UpdateMyProfileInput,
} from '@influency/shared';

/** Saves the caller's display name and bio (PATCH /me/profile). Throws on any failure. */
export async function saveMyProfile(input: UpdateMyProfileInput): Promise<MeResponse> {
  const res = await fetch(`/${API_PREFIX}/me/profile`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`PATCH /me/profile failed: ${res.status}`);
  return meResponseSchema.parse(await res.json());
}

/** Marks onboarding finished or skipped (POST /me/onboarding/complete). Throws on any failure. */
export async function completeOnboarding(): Promise<void> {
  const res = await fetch(`/${API_PREFIX}/me/onboarding/complete`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`POST /me/onboarding/complete failed: ${res.status}`);
}
