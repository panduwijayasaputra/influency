import { API_PREFIX, errorResponseSchema } from '@influency/shared';

export type ApplyInput = {
  displayName: string;
  slug: string;
  bio: string;
  acceptAgreement: true;
  subscriptionPriceCoins: number;
};

export type ApplyResult =
  | { ok: true }
  | {
      ok: false;
      field?: 'displayName' | 'slug' | 'bio' | 'subscriptionPriceCoins';
      message: string;
    };

const FIELDS = ['displayName', 'slug', 'bio', 'subscriptionPriceCoins'] as const;

/** Browser: POST /creators/apply. Never throws; a field error says which step to return to. */
export async function submitCreatorApplication(input: ApplyInput): Promise<ApplyResult> {
  try {
    const res = await fetch(`/${API_PREFIX}/creators/apply`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (res.ok) return { ok: true };
    const { error } = errorResponseSchema.parse(await res.json());
    if (error.code === 'SLUG_TAKEN') return { ok: false, field: 'slug', message: error.message };
    if (error.code === 'VALIDATION_FAILED') {
      const issues = (error.details?.issues ?? []) as { path: string; message: string }[];
      const hit = issues.find((i) => (FIELDS as readonly string[]).includes(i.path));
      if (hit)
        return { ok: false, field: hit.path as (typeof FIELDS)[number], message: hit.message };
    }
    return { ok: false, message: error.message };
  } catch {
    return { ok: false, message: 'Gagal mengirim pengajuan. Silakan coba lagi.' };
  }
}
