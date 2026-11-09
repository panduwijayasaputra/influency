import { z } from 'zod';
import { followStateSchema } from './creators.js';
import { homeFeedItemSchema } from './posts.js';

/** Videos per Jelajahi page. */
export const DISCOVER_VIDEOS_PAGE_SIZE = 10;

/** A Jelajahi reel: a free published video post plus the creator's follow state. */
export const discoverVideoSchema = homeFeedItemSchema.extend({ follow: followStateSchema });
export type DiscoverVideo = z.infer<typeof discoverVideoSchema>;

/** GET /discover/videos. `nextCursor` is opaque; null = end. */
export const discoverVideosPageSchema = z.object({
  items: z.array(discoverVideoSchema),
  nextCursor: z.string().nullable(),
});
export type DiscoverVideosPage = z.infer<typeof discoverVideosPageSchema>;

/** Jelajahi → Cari (US-066/US-070). */
export const CREATOR_SEARCH_MAX_LENGTH = 50;
export const CREATOR_SEARCH_LIMIT = 20;
export const creatorSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(CREATOR_SEARCH_MAX_LENGTH),
});
export type CreatorSearchQuery = z.infer<typeof creatorSearchQuerySchema>;
export const creatorSearchResultSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type CreatorSearchResult = z.infer<typeof creatorSearchResultSchema>;
export const creatorSearchResponseSchema = z.object({
  creators: z.array(creatorSearchResultSchema),
});
export type CreatorSearchResponse = z.infer<typeof creatorSearchResponseSchema>;
