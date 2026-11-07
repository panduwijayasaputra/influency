import { API_PREFIX, type FollowState, followStateSchema } from '@influency/shared';

/** Follow (PUT) or unfollow (DELETE) from the browser. Never throws: any failure is null so the caller can roll back. */
export async function setFollow(slug: string, follow: boolean): Promise<FollowState | null> {
  try {
    const res = await fetch(`/${API_PREFIX}/creators/${slug}/follow`, {
      method: follow ? 'PUT' : 'DELETE',
    });
    if (!res.ok) return null;
    const parsed = followStateSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
