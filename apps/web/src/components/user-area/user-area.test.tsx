import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LabeledSelect } from './labeled-select';
import { ListEmpty, ListError, ListSkeleton } from './list-states';
import { SegmentedControl } from './segmented-control';
import { ViewToggle } from './view-toggle';

describe('SegmentedControl', () => {
  it('marks the selected option and reports a click', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        label="Hubungan"
        value="all"
        onChange={onChange}
        options={[
          { value: 'all', label: 'Semua' },
          { value: 'saved', label: 'Disimpan' },
        ]}
      />,
    );
    expect(screen.getByRole('group', { name: 'Hubungan' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semua' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Disimpan' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Disimpan' }));
    expect(onChange).toHaveBeenCalledWith('saved');
  });
});

describe('ViewToggle', () => {
  it('shows the current view and switches', () => {
    const onChange = vi.fn();
    render(<ViewToggle value="grid" onChange={onChange} />);
    expect(screen.getByRole('button', { name: 'Tampilan grid' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tampilan vertikal' }));
    expect(onChange).toHaveBeenCalledWith('list');
  });
});

describe('LabeledSelect', () => {
  it('is labelled and reports the chosen value', () => {
    const onChange = vi.fn();
    render(
      <LabeledSelect
        label="Urutkan"
        value="recent"
        onChange={onChange}
        options={[
          { value: 'recent', label: 'Terbaru' },
          { value: 'oldest', label: 'Terlama' },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText('Urutkan'), { target: { value: 'oldest' } });
    expect(onChange).toHaveBeenCalledWith('oldest');
  });
});

describe('list states', () => {
  it('renders the skeleton, empty and error states', () => {
    const onRetry = vi.fn();
    render(
      <>
        <ListSkeleton variant="grid" label="Memuat" />
        <ListEmpty title="Kosong" body="Isi dulu" />
        <ListError onRetry={onRetry} />
      </>,
    );
    expect(screen.getByLabelText('Memuat')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { name: 'Kosong' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Coba lagi' }));
    expect(onRetry).toHaveBeenCalled();
  });
});
