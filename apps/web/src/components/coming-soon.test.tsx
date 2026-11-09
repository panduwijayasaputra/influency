import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ComingSoon } from './coming-soon';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back: vi.fn() }) }));

describe('ComingSoon', () => {
  it('shows the title heading, the pill, the description and children', () => {
    render(
      <ComingSoon title="Dompet" description="Saldo Koin.">
        <button type="button">Masuk</button>
      </ComingSoon>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Dompet');
    expect(screen.getByText('Segera hadir')).toBeInTheDocument();
    expect(screen.getByText('Saldo Koin.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Masuk' })).toBeInTheDocument();
  });

  it('uses a custom header instead of PageHeader, keeping the title as the h1', () => {
    render(<ComingSoon title="Beranda" description="Feed." header={<div>Bar</div>} />);
    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Beranda');
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('sr-only');
    expect(screen.queryByRole('banner')).toBeNull();
  });
});
