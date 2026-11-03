import { z } from 'zod';

/** Placeholder limit (TBD business decision): max caption length in characters. Mirrored by a DB CHECK. */
export const POST_CAPTION_MAX_LENGTH = 2000;
export const POST_VISIBILITIES = ['FREE', 'PREMIUM'] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];
export const POST_STATUSES = [
  'DRAFT',
  'PROCESSING',
  'PENDING_REVIEW',
  'PUBLISHED',
  'HIDDEN',
  'REMOVED',
] as const;
export type PostStatus = (typeof POST_STATUSES)[number];
/** Statuses in which visibility and media may change; live posts (PUBLISHED, PENDING_REVIEW) only allow caption edits. */
export const POST_EDITABLE_STATUSES = ['DRAFT', 'HIDDEN'] as const satisfies readonly PostStatus[];
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

/** Placeholder limits (TBD business decision) for per-post unlock offers. */
export const POST_OFFER_MIN_PRICE_COINS = 1;
export const POST_OFFER_MAX_PRICE_COINS = 10_000;
export const POST_OFFER_MIN_DURATION_DAYS = 1;
export const POST_OFFER_MAX_DURATION_DAYS = 365;
export const SECONDS_PER_DAY = 86_400;

/** Body of PUT /creators/me/posts/:id/offer. Whole Koin, whole days. */
export const setPostOfferSchema = z.object({
  priceCoins: z
    .int('Harga harus bilangan bulat Koin.')
    .min(POST_OFFER_MIN_PRICE_COINS, `Harga minimal ${POST_OFFER_MIN_PRICE_COINS} Koin.`)
    .max(POST_OFFER_MAX_PRICE_COINS, `Harga maksimal ${POST_OFFER_MAX_PRICE_COINS} Koin.`),
  durationDays: z
    .int('Durasi harus bilangan bulat hari.')
    .min(POST_OFFER_MIN_DURATION_DAYS, `Durasi minimal ${POST_OFFER_MIN_DURATION_DAYS} hari.`)
    .max(POST_OFFER_MAX_DURATION_DAYS, `Durasi maksimal ${POST_OFFER_MAX_DURATION_DAYS} hari.`),
});
export type SetPostOfferInput = z.infer<typeof setPostOfferSchema>;

/** Current (highest) offer version of a post. Older versions stay in the DB for existing buyers. */
export const postOfferSchema = z.object({
  version: z.int(),
  priceCoins: z.int(),
  durationSeconds: z.int(),
  createdAt: z.string(),
});
export type PostOffer = z.infer<typeof postOfferSchema>;

/** The caller's own post (studio endpoints). Dates are ISO strings. */
export const studioPostSchema = z.object({
  id: z.string(),
  caption: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  status: z.enum(POST_STATUSES),
  offer: postOfferSchema.nullable(),
  /** First publish time; kept when a hidden post is published again. */
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioPost = z.infer<typeof studioPostSchema>;
export const studioPostListSchema = z.object({ posts: z.array(studioPostSchema) });
export type StudioPostList = z.infer<typeof studioPostListSchema>;

/** Number of newest published posts the public feed returns. */
export const PUBLIC_FEED_LIMIT = 30;

/** Public feed item. Safe preview only: never media ids, keys or URLs. */
export const publicPostSchema = z.object({
  id: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  caption: z.string(),
  publishedAt: z.string(),
  imageCount: z.int(),
  videoCount: z.int(),
  /** Current offer terms; null for FREE posts. */
  offer: z.object({ priceCoins: z.int(), durationSeconds: z.int() }).nullable(),
});
export type PublicPost = z.infer<typeof publicPostSchema>;
export const publicPostListSchema = z.object({ posts: z.array(publicPostSchema) });
export type PublicPostList = z.infer<typeof publicPostListSchema>;
