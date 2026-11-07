import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './bottom-sheet';

function Uncontrolled(props: { hideTitle?: boolean }) {
  return (
    <BottomSheet
      title="Judul"
      eyebrow="Sub"
      description="Penjelasan"
      trigger={<button type="button">Buka</button>}
      {...props}
    >
      <input aria-label="Isi" />
    </BottomSheet>
  );
}

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Buka' }));
  return screen.getByRole('dialog', { name: 'Judul' });
}

function swipe(dy: number, ms: number) {
  const header = screen.getByTestId('bottom-sheet-header');
  fireEvent.pointerDown(header, { clientY: 0, timeStamp: 0 });
  fireEvent.pointerMove(header, { clientY: dy });
  // jsdom ignores timeStamp in the init dict, so set it on the event itself.
  const up = new PointerEvent('pointerup', { bubbles: true, clientY: dy });
  Object.defineProperty(up, 'timeStamp', { value: ms });
  Object.defineProperty(up, 'clientY', { value: dy });
  act(() => {
    header.dispatchEvent(up);
  });
}

describe('BottomSheet', () => {
  it('opens from the trigger with focus inside, and Tutup returns focus to the trigger', async () => {
    render(<Uncontrolled />);
    const dialog = open();
    expect(dialog).toHaveTextContent('Sub');
    expect(dialog).toHaveAccessibleDescription('Penjelasan');
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Buka' })).toHaveFocus());
  });

  it('closes on Escape', () => {
    render(<Uncontrolled />);
    fireEvent.keyDown(open(), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a backdrop tap', async () => {
    render(<Uncontrolled />);
    open();
    // Radix arms its outside-pointer listener one tick after mount.
    await act(() => new Promise((r) => setTimeout(r, 0)));
    const overlay = screen.getByTestId('bottom-sheet-overlay');
    // A primary-button outside press only dismisses once its click lands.
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a swipe down, but not on a short slow drag', () => {
    render(<Uncontrolled />);
    open();
    swipe(20, 1000);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    swipe(120, 1000);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('does not start a drag from the close button', () => {
    render(<Uncontrolled />);
    const dialog = open();
    const close = screen.getByRole('button', { name: 'Tutup' });
    fireEvent.pointerDown(close, { clientY: 0 });
    fireEvent.pointerMove(close, { clientY: 60 });
    expect(dialog.style.transform).toBe('');
  });

  it('locks page scroll while open', () => {
    render(<Uncontrolled />);
    open();
    expect(document.body).toHaveAttribute('data-scroll-locked');
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(document.body).not.toHaveAttribute('data-scroll-locked');
  });

  it('keeps the accessible name when the title is hidden, and turns motion off when reduced', () => {
    render(<Uncontrolled hideTitle />);
    const dialog = open();
    expect(screen.getByText('Judul')).toHaveClass('sr-only');
    expect(dialog.className).toContain('motion-reduce:animate-none');
  });

  it('controlled without a trigger: returns focus to the element focused before opening', async () => {
    const onOpenChange = vi.fn();
    function Controlled() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Hapus
          </button>
          <BottomSheet
            title="Yakin?"
            open={open}
            onOpenChange={(v) => {
              onOpenChange(v);
              setOpen(v);
            }}
          >
            <p>Isi</p>
          </BottomSheet>
        </>
      );
    }
    render(<Controlled />);
    const opener = screen.getByRole('button', { name: 'Hapus' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog', { name: 'Yakin?' })).not.toHaveAttribute('aria-describedby');
    fireEvent.click(screen.getByRole('button', { name: 'Tutup' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
