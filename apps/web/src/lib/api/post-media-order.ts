import { sendJson } from './errors';
import { type StudioMediaList, studioMediaListSchema } from '@influency/shared';

/**
 * PUT /creators/me/posts/:postId/media/order: the creator's order of a draft's media (creator-studio US-059).
 * Rejects with an `ApiError`; the answer is the list in the saved order.
 */
export async function saveMediaOrder(postId: string, mediaIds: string[]): Promise<StudioMediaList> {
  return sendJson('PUT', `/creators/me/posts/${postId}/media/order`, studioMediaListSchema, {
    body: { mediaIds },
  });
}
