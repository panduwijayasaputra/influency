'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  type CreatorProfileResponse,
  errorResponseSchema,
  updateCreatorProfileSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Field = 'displayName' | 'bio' | 'category';
type FieldErrors = Partial<Record<Field, string>>;

/** First message per field; `path` is the field name (API issues use dotted strings). */
function byField(issues: { path: string; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) errors[path as Field] ??= message;
  return errors;
}

export function CreatorProfileForm({ profile }: { profile: CreatorProfileResponse }) {
  const router = useRouter();
  const [values, setValues] = useState({
    displayName: profile.displayName,
    bio: profile.bio ?? '',
    category: profile.category ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const set = (field: Field, value: string) => {
    setSaved(false);
    setValues((v) => ({ ...v, [field]: value }));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    setSaved(false);
    const parsed = updateCreatorProfileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(byField(parsed.error.issues.map((i) => ({ ...i, path: String(i.path[0]) }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch('/api/v1/creators/me', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        const { error } = errorResponseSchema.parse(await res.json());
        if (error.code === 'VALIDATION_FAILED') {
          setErrors(byField((error.details?.issues ?? []) as { path: string; message: string }[]));
        } else {
          setFormError(error.message);
        }
      }
    } catch {
      setFormError('Gagal menyimpan profil. Silakan coba lagi.');
    }
    setPending(false);
  }

  const fieldProps = (field: Field) => ({
    id: field,
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `${field}-error` : undefined,
  });
  const fieldError = (field: Field) =>
    errors[field] && (
      <p id={`${field}-error`} className="text-sm text-destructive">
        {errors[field]}
      </p>
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Nama tampilan</Label>
        <Input
          {...fieldProps('displayName')}
          value={values.displayName}
          onChange={(e) => set('displayName', e.target.value)}
          maxLength={60}
        />
        {fieldError('displayName')}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="bio">Bio (opsional)</Label>
        <Textarea
          {...fieldProps('bio')}
          value={values.bio}
          onChange={(e) => set('bio', e.target.value)}
          maxLength={500}
        />
        {fieldError('bio')}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="category">Kategori (opsional)</Label>
        <Input
          {...fieldProps('category')}
          value={values.category}
          onChange={(e) => set('category', e.target.value)}
          maxLength={50}
        />
        {fieldError('category')}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      {saved && (
        <p role="status" className="text-sm text-muted-foreground">
          Profil disimpan.
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Menyimpan…' : 'Simpan'}
      </Button>
    </form>
  );
}
