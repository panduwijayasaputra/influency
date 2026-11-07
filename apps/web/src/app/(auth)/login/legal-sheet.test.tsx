import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PRIVACY, TERMS } from '@/lib/legal-placeholder';
import { LegalSheet } from './legal-sheet';

describe('LegalSheet', () => {
  it('opens the document with the placeholder markers and closes on Selesai', async () => {
    render(<LegalSheet doc={TERMS} />);
    const trigger = screen.getByRole('button', { name: 'Syarat' });
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Syarat' });
    expect(dialog).toHaveTextContent('Teks final dari legal');
    expect(dialog).toHaveTextContent('Terakhir diperbarui: [TANGGAL]');
    expect(within(dialog).getByRole('heading', { name: 'Akun kamu' })).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Selesai' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('opens the privacy policy on its own', () => {
    render(<LegalSheet doc={PRIVACY} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kebijakan Privasi' }));
    expect(screen.getByRole('dialog', { name: 'Kebijakan Privasi' })).toBeInTheDocument();
  });
});

describe('legal placeholder copy', () => {
  const bodies = [...TERMS.sections, ...PRIVACY.sections].map(([, body]) => body);

  it.each(bodies)('stays a bracketed placeholder without TBD business values: %s', (body) => {
    expect(body.startsWith('[') && body.endsWith(']')).toBe(true);
    expect(body).not.toMatch(/Rp\s?\d|\d+\s?hari/i);
  });
});
