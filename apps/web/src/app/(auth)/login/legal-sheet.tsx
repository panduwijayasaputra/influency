'use client';

import { useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Button } from '@/components/ui/button';
import { LEGAL_UPDATED_AT, type LegalDoc } from '@/lib/legal-placeholder';

/** Inline link in the consent line that opens one legal document in a bottom sheet. */
export function LegalSheet({ doc }: { doc: LegalDoc }) {
  const [open, setOpen] = useState(false);
  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      title={doc.title}
      eyebrow="Teks final dari legal"
      description={`Terakhir diperbarui: ${LEGAL_UPDATED_AT}`}
      trigger={
        // Inline text control in a sentence: exempt from the 44 px target (WCAG 2.5.8).
        <button
          type="button"
          className="rounded-sm font-semibold text-primary-ink underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {doc.title}
        </button>
      }
    >
      {doc.sections.map(([heading, body]) => (
        <section key={heading} className="flex flex-col gap-1">
          <h3 className="text-sm font-bold">{heading}</h3>
          <p className="text-sm text-muted-foreground">{body}</p>
        </section>
      ))}
      <Button variant="secondary" size="lg" className="w-full" onClick={() => setOpen(false)}>
        Selesai
      </Button>
    </BottomSheet>
  );
}
