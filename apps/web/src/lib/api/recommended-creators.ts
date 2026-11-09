import {
  API_PREFIX,
  type RecommendedCreator,
  recommendedCreatorListSchema,
} from '@influency/shared';

/** Suggested creators for "Creator untukmu" (signed-in users; the API excludes self and followed). */
export async function fetchRecommendedCreators(): Promise<RecommendedCreator[]> {
  const res = await fetch(`/${API_PREFIX}/creators/recommended`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /creators/recommended failed: ${res.status}`);
  return recommendedCreatorListSchema.parse(await res.json()).creators;
}
