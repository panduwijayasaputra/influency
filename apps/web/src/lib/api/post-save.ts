import { API_PREFIX, postSaveResponseSchema } from '@influency/shared';

/**
 * Save (PUT) or unsave (DELETE) a post from the browser. Returns the saved state the server now has, and never
 * throws: any failure is null so the caller can roll back (same contract as `setFollow`).
 */
export async function setSaved(postId: string, save: boolean): Promise<boolean | null> {
  try {
    const res = await fetch(`/${API_PREFIX}/posts/${postId}/save`, {
      method: save ? 'PUT' : 'DELETE',
    });
    if (!res.ok) return null;
    const parsed = postSaveResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.saved : null;
  } catch {
    return null;
  }
}
