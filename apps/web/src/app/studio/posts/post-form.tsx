'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  createPostSchema,
  errorResponseSchema,
  isPostEditable,
  POST_CAPTION_MAX_LENGTH,
  POST_VISIBILITIES,
  type PostVisibility,
  type StudioPost,
  studioPostSchema,
  updatePostSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { VISIBILITY_LABELS } from './labels';

type Field = 'caption' | 'visibility';
type FieldErrors = Partial<Record<Field, string>>;

/** First message per field; `path` is the field name (API issues use dotted strings). */
export function byField<F extends string>(
  issues: { path: string; message: string }[],
): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  for (const { path, message } of issues) errors[path as F] ??= message;
  return errors;
}

/** Creates a draft (no `post`) or edits an existing one. */
export function PostForm({ post }: { post?: StudioPost }) {
  const router = useRouter();
  const [caption, setCaption] = useState(post?.caption ?? '');
  const [visibility, setVisibility] = useState<PostVisibility | undefined>(post?.visibility);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  // Live posts keep their visibility; the current value is still sent and accepted unchanged.
  const visibilityLocked = post !== undefined && !isPostEditable(post.status);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    setSaved(false);
    const parsed = (post ? updatePostSchema : createPostSchema).safeParse({ caption, visibility });
    if (!parsed.success) {
      setErrors(
        byField<Field>(parsed.error.issues.map((i) => ({ ...i, path: String(i.path[0]) }))),
      );
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch(
        post ? `/api/v1/creators/me/posts/${post.id}` : '/api/v1/creators/me/posts',
        {
          method: post ? 'PATCH' : 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
        },
      );
      if (res.ok) {
        if (post) {
          setSaved(true);
          router.refresh();
        } else {
          router.push(`/studio/posts/${studioPostSchema.parse(await res.json()).id}`);
          return; // keep the button disabled while navigating
        }
      } else {
        const { error } = errorResponseSchema.parse(await res.json());
        if (error.code === 'VALIDATION_FAILED') {
          setErrors(
            byField<Field>((error.details?.issues ?? []) as { path: string; message: string }[]),
          );
        } else {
          setFormError(error.message);
        }
      }
    } catch {
      setFormError('Gagal menyimpan post. Silakan coba lagi.');
    }
    setPending(false);
  }

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="caption">Caption (opsional)</Label>
        <Textarea
          id="caption"
          value={caption}
          onChange={(e) => {
            setSaved(false);
            setCaption(e.target.value);
          }}
          maxLength={POST_CAPTION_MAX_LENGTH}
          aria-invalid={errors.caption ? true : undefined}
          aria-describedby={errors.caption ? 'caption-error caption-count' : 'caption-count'}
          rows={6}
        />
        <p id="caption-count" className="text-right text-xs text-muted-foreground">
          {caption.length}/{POST_CAPTION_MAX_LENGTH}
        </p>
        <p className="text-sm text-muted-foreground">
          Caption tampil di halaman publik, termasuk untuk post Premium.
        </p>
        {errors.caption && (
          <p id="caption-error" className="text-sm text-destructive">
            {errors.caption}
          </p>
        )}
      </div>

      <fieldset
        disabled={visibilityLocked}
        className="flex flex-col gap-2"
        aria-invalid={errors.visibility ? true : undefined}
        aria-describedby={errors.visibility ? 'visibility-error' : undefined}
      >
        <legend className="mb-2 text-sm font-medium">Jenis post</legend>
        {POST_VISIBILITIES.map((value) => (
          <label key={value} className="flex items-center gap-2 text-base">
            <input
              type="radio"
              name="visibility"
              value={value}
              checked={visibility === value}
              onChange={() => {
                setSaved(false);
                setVisibility(value);
              }}
              className="size-4 accent-primary"
            />
            {VISIBILITY_LABELS[value]}
          </label>
        ))}
        {visibilityLocked && (
          <p className="text-sm text-muted-foreground">
            Sembunyikan post dulu untuk mengubah jenis post.
          </p>
        )}
        {errors.visibility && (
          <p id="visibility-error" className="text-sm text-destructive">
            {errors.visibility}
          </p>
        )}
      </fieldset>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          Tersimpan.
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Menyimpan…' : post ? 'Simpan' : 'Buat draf'}
      </Button>
    </form>
  );
}
