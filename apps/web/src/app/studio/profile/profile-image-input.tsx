'use client';

import { useRouter } from 'next/navigation';
import { type ChangeEvent, useState } from 'react';
import {
  errorResponseSchema,
  PROFILE_IMAGE_MAX_BYTES,
  PROFILE_IMAGE_TYPES,
  type ProfileImageKind,
} from '@influency/shared';
import { cn } from '@/lib/utils';

const toMb = (bytes: number) => bytes / (1024 * 1024);

/** Avatar or banner preview + upload. Type/size checks here are UX only; the API checks the bytes. */
export function ProfileImageInput({
  kind,
  label,
  url,
}: {
  kind: ProfileImageKind;
  label: string;
  url: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const id = `${kind}-file`;
  const maxBytes = PROFILE_IMAGE_MAX_BYTES[kind];

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setError(undefined);
    if (!(PROFILE_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError('Format file tidak didukung. Gunakan JPG, PNG, atau WebP.');
      input.value = '';
      return;
    }
    if (file.size > maxBytes) {
      setError(`Ukuran file maksimal ${toMb(maxBytes)} MB.`);
      input.value = '';
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/v1/creators/me/${kind}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'content-type': file.type },
        body: file,
      });
      if (res.ok) {
        router.refresh(); // new image URL from the server
      } else {
        setError(errorResponseSchema.parse(await res.json()).error.message);
      }
    } catch {
      setError('Gagal mengunggah gambar. Silakan coba lagi.');
    }
    input.value = '';
    setPending(false);
  }

  const shape = kind === 'avatar' ? 'size-24 rounded-full' : 'aspect-[3/1] w-full rounded-lg';
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- same-origin API image; next/image adds nothing here
        <img src={url} alt={label} className={cn(shape, 'border object-cover')} />
      ) : (
        <div className={cn(shape, 'border bg-muted')} aria-hidden="true" />
      )}
      <input
        id={id}
        type="file"
        accept={PROFILE_IMAGE_TYPES.join(',')}
        disabled={pending}
        onChange={(e) => void upload(e)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : `${id}-hint`}
        className="text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5"
      />
      {pending ? (
        <p className="text-sm text-muted-foreground">Mengunggah…</p>
      ) : (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          JPG, PNG, atau WebP, maksimal {toMb(maxBytes)} MB.
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
