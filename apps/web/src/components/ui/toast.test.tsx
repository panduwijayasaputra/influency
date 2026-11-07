import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOASTS, TOAST_DURATION_MS, Toaster, useToast } from './toast';

let n = 0;
function Shout() {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast(`Halo ${++n}`)}>
      Kirim
    </button>
  );
}

function setup() {
  n = 0;
  render(
    <Toaster>
      <Shout />
    </Toaster>,
  );
  const button = screen.getByRole('button', { name: 'Kirim' });
  button.focus();
  return button;
}

describe('Toast', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the message above the bottom nav without taking focus', () => {
    const button = setup();
    fireEvent.click(button);
    const list = screen.getByRole('listitem').closest('ol')!;
    expect(list).toHaveTextContent('Halo 1');
    expect(list.className).toContain('--bottom-nav-height');
    expect(button).toHaveFocus();
  });

  it('announces the message politely', async () => {
    fireEvent.click(setup());
    await waitFor(() => {
      const live = document.querySelector('[aria-live="polite"]');
      expect(live).toHaveTextContent('Halo 1');
    });
  });

  it('disappears by itself', () => {
    vi.useFakeTimers();
    fireEvent.click(setup());
    expect(screen.getByText('Halo 1')).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(TOAST_DURATION_MS + 100);
    });
    expect(screen.queryByText('Halo 1')).toBeNull();
  });

  it('stacks toasts as separate items, keeping the newest', () => {
    const button = setup();
    for (let i = 0; i <= MAX_TOASTS; i++) fireEvent.click(button);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(MAX_TOASTS);
    expect(items.map((li) => li.textContent)).toEqual(['Halo 2', 'Halo 3', 'Halo 4']);
  });

  it('useToast throws outside the Toaster', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Shout />)).toThrow('useToast must be used inside <Toaster>');
  });
});
