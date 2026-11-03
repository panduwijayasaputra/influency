'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import {
  type CreatorApplicationResponse,
  creatorApplicationSchema,
  errorResponseSchema,
} from '@influency/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Field = 'displayName' | 'slug' | 'bio' | 'category' | 'acceptAgreement';
type FieldErrors = Partial<Record<Field, string>>;

/** First message per field; `path` is the field name (API issues use dotted strings). */
function byField(issues: { path: string; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const { path, message } of issues) errors[path as Field] ??= message;
  return errors;
}

export function CreatorApplicationForm({ initial }: { initial?: CreatorApplicationResponse }) {
  const router = useRouter();
  const [values, setValues] = useState({
    displayName: initial?.displayName ?? '',
    slug: initial?.slug ?? '',
    bio: initial?.bio ?? '',
    category: initial?.category ?? '',
    acceptAgreement: false,
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  const set = (field: Field, value: string | boolean) =>
    setValues((v) => ({ ...v, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(undefined);
    const parsed = creatorApplicationSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(byField(parsed.error.issues.map((i) => ({ ...i, path: String(i.path[0]) }))));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch('/api/v1/creators/apply', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (res.ok) {
        router.refresh(); // the page re-renders as "sedang ditinjau"
        return;
      }
      const { error } = errorResponseSchema.parse(await res.json());
      if (error.code === 'VALIDATION_FAILED') {
        setErrors(byField((error.details?.issues ?? []) as { path: string; message: string }[]));
      } else if (error.code === 'SLUG_TAKEN') {
        setErrors({ slug: error.message });
      } else {
        setFormError(error.message);
      }
    } catch {
      setFormError('Gagal mengirim pengajuan. Silakan coba lagi.');
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
  const slugPreview = values.slug.trim().toLowerCase() || 'alamat-anda';

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
        <Label htmlFor="slug">Alamat halaman</Label>
        <Input
          {...fieldProps('slug')}
          value={values.slug}
          onChange={(e) => set('slug', e.target.value)}
          autoCapitalize="none"
          autoComplete="off"
          spellCheck={false}
          maxLength={30}
        />
        <p className="text-sm text-muted-foreground">influency.com/{slugPreview}</p>
        {fieldError('slug')}
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

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            {...fieldProps('acceptAgreement')}
            checked={values.acceptAgreement}
            onChange={(e) => set('acceptAgreement', e.target.checked)}
            className="mt-1 size-4"
          />
          <Label htmlFor="acceptAgreement" className="leading-snug font-normal">
            Saya menyetujui Perjanjian Kreator dan Kebijakan Konten.
          </Label>
        </div>
        <p className="text-sm text-muted-foreground">Dokumen kebijakan sedang disiapkan.</p>
        {fieldError('acceptAgreement')}
      </div>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? 'Mengirim…' : 'Ajukan'}
      </Button>
    </form>
  );
}
