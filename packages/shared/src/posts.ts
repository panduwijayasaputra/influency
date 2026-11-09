import { z } from 'zod';
import { MEDIA_KINDS } from './post-media.js';

/** Placeholder limit (TBD business decision): max caption length in characters. Mirrored by a DB CHECK. */
export const POST_CAPTION_MAX_LENGTH = 2000;
export const POST_VISIBILITIES = ['FREE', 'PREMIUM'] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];
export const POST_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'PENDING_REVIEW',
  'PUBLISHED',
  'ARCHIVED',
  'REMOVED',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
/**
 * Statuses in which visibility and media may change. PUBLISHED, PENDING_REVIEW and ARCHIVED allow caption (and offer
 * price) edits only, so media someone paid for is never removed (US-047).
 */
export const POST_EDITABLE_STATUSES = ['DRAFT'] as const satisfies readonly PostStatus[];
export const isPostEditable = (status: PostStatus): boolean =>
  (POST_EDITABLE_STATUSES as readonly PostStatus[]).includes(status);

const captionSchema = z
  .string()
  .trim()
  .max(POST_CAPTION_MAX_LENGTH, `Caption maksimal ${POST_CAPTION_MAX_LENGTH} karakter.`);
const visibilitySchema = z.enum(POST_VISIBILITIES, 'Pilih Gratis atau Premium.');

/** Body of POST /creators/me/posts. Caption may be empty (media arrives in US-016/017). */
export const createPostSchema = z.object({
  caption: captionSchema.default(''),
  visibility: visibilitySchema,
});
export type CreatePostInput = z.infer<typeof createPostSchema>;

/** Body of PATCH /creators/me/posts/:id: any subset; status is not editable here. */
export const updatePostSchema = z
  .object({ caption: captionSchema, visibility: visibilitySchema })
  .partial()
  .refine((input) => Object.keys(input).length > 0, 'Tidak ada perubahan.');
export type UpdatePostInput = z.infer<typeof updatePostSchema>;

/** LOCKED (Monetization Spec v1 §2): one per-post unlock price in whole Koin; access is permanent. */
export const POST_OFFER_MIN_PRICE_COINS = 5;
export const POST_OFFER_MAX_PRICE_COINS = 1_000;

/** Body of PUT /creators/me/posts/:id/offer. Strict: unknown keys such as the old durationDays are rejected. */
export const setPostOfferSchema = z.strictObject({
  priceCoins: z
    .int('Harga harus bilangan bulat Koin.')
    .min(POST_OFFER_MIN_PRICE_COINS, `Harga minimal ${POST_OFFER_MIN_PRICE_COINS} Koin.`)
    .max(POST_OFFER_MAX_PRICE_COINS, `Harga maksimal ${POST_OFFER_MAX_PRICE_COINS} Koin.`),
});
export type SetPostOfferInput = z.infer<typeof setPostOfferSchema>;

/** Current (highest) offer version of a post. Older versions stay in the DB for existing buyers. */
export const postOfferSchema = z.object({
  version: z.int(),
  priceCoins: z.int(),
  createdAt: z.string(),
});
export type PostOffer = z.infer<typeof postOfferSchema>;

/**
 * Placeholder (TBD business decision): max bytes of a dedicated cover upload (5 MiB). Must stay ≤ the API's raw-image
 * body cap. Accepted types are POST_IMAGE_TYPES.
 */
export const POST_COVER_MAX_BYTES = 5 * 1024 * 1024;

/** Body of PUT /creators/me/posts/:id/cover: use one of the post's READY media as the cover source. */
export const setPostCoverSchema = z.strictObject({ mediaId: z.uuid('Media tidak valid.') });
export type SetPostCoverInput = z.infer<typeof setPostCoverSchema>;

/** A premium post's cover: only its generated preview is ever served. mediaId is null for a dedicated upload. */
export const postCoverSchema = z.object({
  mediaId: z.string().nullable(),
  previewUrl: z.string(),
});
export type PostCover = z.infer<typeof postCoverSchema>;

/** The caller's own post (studio endpoints). Dates are ISO strings. */
export const studioPostSchema = z.object({
  id: z.string(),
  caption: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  status: z.enum(POST_STATUSES),
  offer: postOfferSchema.nullable(),
  cover: postCoverSchema.nullable(),
  /** First publish time; kept when an archived post is restored. */
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioPost = z.infer<typeof studioPostSchema>;
export const studioPostListSchema = z.object({ posts: z.array(studioPostSchema) });
export type StudioPostList = z.infer<typeof studioPostListSchema>;

/** Number of newest published posts the public feed returns. */
export const PUBLIC_FEED_LIMIT = 30;

/** One READY media item of a public post, in display order: kind and duration only (never ids, keys or URLs). */
export const publicMediaSchema = z.object({
  kind: z.enum(MEDIA_KINDS),
  durationSeconds: z.int().nullable(),
});
export type PublicMedia = z.infer<typeof publicMediaSchema>;

/** The signed-in viewer's state on a post; null = anonymous. */
export const publicPostViewerSchema = z.object({
  liked: z.boolean(),
  /** The viewer saved this post (Simpan). Private; grants no access. */
  saved: z.boolean(),
  /** The server-side like rule: published, and access or PREMIUM_LIKES_WITHOUT_ACCESS. */
  canLike: z.boolean(),
  /** Published and not the viewer's own post (US-042). */
  canReport: z.boolean(),
  /** Server rule: a published premium post the viewer has access to and does not own. US-039 narrows it to paid access. */
  canTip: z.boolean(),
  /** The viewer has an active subscription period with this post's creator (Unlock sheet disclosure). */
  subscribed: z.boolean(),
});

/** Public feed item, viewer-aware (US-008). Safe preview only: never media ids, keys, provider ids or original URLs. */
export const publicPostSchema = z.object({
  id: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  caption: z.string(),
  publishedAt: z.string(),
  imageCount: z.int(),
  videoCount: z.int(),
  /** Current offer price (access is permanent); null for FREE posts. */
  offer: z.object({ priceCoins: z.int() }).nullable(),
  /** PREMIUM only: URL of the generated (blurred) cover preview; null → generic locked placeholder. */
  previewUrl: z.string().nullable(),
  /** Likes of the post (US-051); shown on every published post, also to logged-out visitors. */
  likeCount: z.int(),
  /** full = media via GET /posts/:id/media-access; locked = preview only. */
  access: z.enum(['full', 'locked']),
  viewer: publicPostViewerSchema.nullable(),
  /** Comments that are not deleted. */
  commentCount: z.int(),
  /** READY media in display order (the order media-access returns). */
  media: z.array(publicMediaSchema),
});
export type PublicPost = z.infer<typeof publicPostSchema>;
export const publicPostListSchema = z.object({ posts: z.array(publicPostSchema) });
export type PublicPostList = z.infer<typeof publicPostListSchema>;

/** Posts per Home feed page. */
export const HOME_FEED_PAGE_SIZE = 10;

/** A Home feed item: a public post plus the creator fields PostCard needs. */
export const homeFeedItemSchema = publicPostSchema.extend({
  creator: z.object({
    slug: z.string(),
    displayName: z.string(),
    avatarUrl: z.string().nullable(),
  }),
});
export type HomeFeedItem = z.infer<typeof homeFeedItemSchema>;

/** One Home feed page. `nextCursor` is opaque (pass it back as ?cursor=); null = end of the feed. */
export const homeFeedPageSchema = z.object({
  items: z.array(homeFeedItemSchema),
  nextCursor: z.string().nullable(),
});
export type HomeFeedPage = z.infer<typeof homeFeedPageSchema>;

/** GET /creators/:slug/posts/:postId. Like the feed item (no media refs); owner/admin may see non-published posts. */
export const publicPostDetailSchema = publicPostSchema.extend({
  status: z.enum(POST_STATUSES),
  /** null only for a never-published post, visible to its owner/admin. */
  publishedAt: z.string().nullable(),
  // access (hidden is a 404), viewer, commentCount and media come from publicPostSchema.
});
export type PublicPostDetail = z.infer<typeof publicPostDetailSchema>;

/** PUT / DELETE /posts/:id/like (US-051). */
export const postLikeResponseSchema = z.object({ liked: z.boolean(), likeCount: z.int() });
export type PostLikeResponse = z.infer<typeof postLikeResponseSchema>;

/** PUT / DELETE /posts/:id/save (user-area US-044). Private: no count is ever exposed. */
export const postSaveResponseSchema = z.object({ saved: z.boolean() });
export type PostSaveResponse = z.infer<typeof postSaveResponseSchema>;
