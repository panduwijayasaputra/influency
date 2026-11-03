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

/** The caller's own post (studio endpoints). Dates are ISO strings. */
export const studioPostSchema = z.object({
  id: z.string(),
  caption: z.string(),
  visibility: z.enum(POST_VISIBILITIES),
  status: z.enum(POST_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type StudioPost = z.infer<typeof studioPostSchema>;
export const studioPostListSchema = z.object({ posts: z.array(studioPostSchema) });
export type StudioPostList = z.infer<typeof studioPostListSchema>;
