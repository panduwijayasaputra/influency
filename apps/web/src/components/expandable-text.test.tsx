import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ExpandableText } from './expandable-text';

describe('ExpandableText', () => {
  it('shows no toggle for short single-line text', () => {
    render(<ExpandableText text="Halo!" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('clamps long text to two lines and toggles', () => {
    render(<ExpandableText text={'Panjang '.repeat(30)} />);
    const p = screen.getByText(/Panjang/);
    expect(p).toHaveClass('line-clamp-2');
    const toggle = screen.getByRole('button', { name: 'Selengkapnya' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(p).not.toHaveClass('line-clamp-2');
    expect(screen.getByRole('button', { name: 'Sembunyikan' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sembunyikan' }));
    expect(p).toHaveClass('line-clamp-2');
  });

  it('gets the toggle for a line break and keeps line breaks', () => {
    render(<ExpandableText text={'Satu\nDua'} />);
    expect(screen.getByRole('button', { name: 'Selengkapnya' })).toBeInTheDocument();
    expect(screen.getByText(/Satu/)).toHaveClass('whitespace-pre-line');
  });

  it('links the text when given an href', () => {
    render(<ExpandableText text="Caption" href="/ana/posts/1" />);
    expect(screen.getByText('Caption').closest('a')).toHaveAttribute('href', '/ana/posts/1');
  });
});
