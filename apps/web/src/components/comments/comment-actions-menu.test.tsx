import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentActionsMenu } from './comment-actions-menu';

const base = {
  authorName: 'Ana Putri',
  reply: false,
  canEdit: false,
  canDelete: false,
  canPin: false,
  pinned: false,
};

function setup(props: Partial<Parameters<typeof CommentActionsMenu>[0]> = {}) {
  const fns = { onEdit: vi.fn(), onDelete: vi.fn(), onPin: vi.fn() };
  render(<CommentActionsMenu {...base} {...fns} {...props} />);
  return fns;
}
const trigger = () => screen.queryByRole('button', { name: /Aksi lainnya/ });
const open = () => fireEvent.keyDown(trigger()!, { key: 'Enter' });
const items = () => screen.getAllByRole('menuitem').map((i) => i.textContent);

describe('CommentActionsMenu', () => {
  it('renders nothing when no action is allowed', () => {
    setup();
    expect(trigger()).toBeNull();
  });

  it('lists Edit and Hapus for the author', () => {
    setup({ canEdit: true, canDelete: true });
    open();
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(items()).toEqual(['Edit', 'Hapus']);
  });

  it('offers Hapus and Sematkan to the post owner, and Lepas sematan when pinned', () => {
    setup({ canDelete: true, canPin: true });
    open();
    expect(items()).toEqual(['Hapus', 'Sematkan']);
  });

  it('says Lepas sematan for a pinned comment', () => {
    setup({ canPin: true, pinned: true });
    open();
    expect(items()).toEqual(['Lepas sematan']);
  });

  it('never offers pinning on a reply', () => {
    setup({ canDelete: true, canPin: true, reply: true });
    expect(
      screen.getByRole('button', { name: 'Aksi lainnya untuk balasan Ana Putri' }),
    ).toBeInTheDocument();
    open();
    expect(items()).toEqual(['Hapus']);
  });

  it('labels the trigger and tracks aria-expanded', () => {
    setup({ canDelete: true });
    const t = screen.getByRole('button', { name: 'Aksi lainnya untuk komentar Ana Putri' });
    expect(t).toHaveAttribute('aria-haspopup', 'menu');
    expect(t).toHaveAttribute('aria-expanded', 'false');
    open();
    expect(t).toHaveAttribute('aria-expanded', 'true');
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    setup({ canDelete: true });
    trigger()!.focus();
    open();
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it('runs the picked action once and closes', () => {
    const fns = setup({ canEdit: true, canDelete: true, canPin: true });
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Hapus' }));
    expect(fns.onDelete).toHaveBeenCalledTimes(1);
    expect(fns.onEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Sematkan' }));
    expect(fns.onPin).toHaveBeenCalledTimes(1);
  });

  it('disables the trigger while a request runs', () => {
    setup({ canDelete: true, disabled: true });
    expect(trigger()).toBeDisabled();
  });
});
