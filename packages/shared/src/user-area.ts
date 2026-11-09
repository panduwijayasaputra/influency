import { z } from 'zod';
import { homeFeedItemSchema } from './posts.js';

// user-area (Koleksi Saya, Diikuti, Langganan). The UI stories ship these shapes first with dummy data; the API
// stories (US-045/046/047) return exactly the same shapes.

export const LIBRARY_RELATIONS = ['all', 'saved', 'purchased'] as const;
export const LIBRARY_MEDIA = ['all', 'image', 'video'] as const;
export const LIBRARY_SORTS = ['recent', 'oldest'] as const;
/** Items per GET /me/library page. */
export const LIBRARY_PAGE_SIZE = 12;

export const libraryQuerySchema = z.object({
  relation: z.enum(LIBRARY_RELATIONS).default('all'),
  media: z.enum(LIBRARY_MEDIA).default('all'),
  sort: z.enum(LIBRARY_SORTS).default('recent'),
  /** Creator slug, case-insensitive. */
  creator: z.string().optional(),
  /** Opaque; the `nextCursor` of the previous page. */
  cursor: z.string().optional(),
});
export type LibraryQuery = z.infer<typeof libraryQuerySchema>;

/** A saved and/or bought post. A post both saved and bought appears once. */
export const libraryItemSchema = homeFeedItemSchema.extend({
  saved: z.boolean(),
  purchased: z.boolean(),
  /** ISO time of the later of the save and the purchase. */
  addedAt: z.string(),
});
export type LibraryItem = z.infer<typeof libraryItemSchema>;

export const libraryPageSchema = z.object({
  items: z.array(libraryItemSchema),
  nextCursor: z.string().nullable(),
  /** Creators in the collection, for the dropdown. Only filled on the first page (no cursor). */
  creators: z.array(z.object({ slug: z.string(), displayName: z.string() })),
});
export type LibraryPage = z.infer<typeof libraryPageSchema>;

export const FOLLOWING_SORTS = ['recent', 'name'] as const;
/** Creators per GET /me/following page. */
export const FOLLOWING_PAGE_SIZE = 20;

export const followingQuerySchema = z.object({
  sort: z.enum(FOLLOWING_SORTS).default('recent'),
  /** Opaque; the `nextCursor` of the previous page. */
  cursor: z.string().optional(),
});
export type FollowingQuery = z.infer<typeof followingQuerySchema>;

/** A followed creator: the public creator shape only. */
export const followingCreatorSchema = z.object({
  slug: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bannerUrl: z.string().nullable(),
  bio: z.string().nullable(),
});
export type FollowingCreator = z.infer<typeof followingCreatorSchema>;

export const followingPageSchema = z.object({
  creators: z.array(followingCreatorSchema),
  /** All visible followed creators, not just this page. */
  total: z.int(),
  nextCursor: z.string().nullable(),
});
export type FollowingPage = z.infer<typeof followingPageSchema>;

/** One active creator subscription of the caller (GET /me/subscriptions). */
export const mySubscriptionSchema = z.object({
  creator: followingCreatorSchema,
  /** End of the current active period (ISO). */
  endsAt: z.string(),
  /** Whole days left, rounded up, computed on the server. At least 1 while the period is active. */
  daysLeft: z.int().min(1),
  /** A prepaid next period exists and is not cancelled. */
  hasScheduledRenewal: z.boolean(),
});
export type MySubscription = z.infer<typeof mySubscriptionSchema>;

export const mySubscriptionListSchema = z.object({ subscriptions: z.array(mySubscriptionSchema) });
export type MySubscriptionList = z.infer<typeof mySubscriptionListSchema>;
