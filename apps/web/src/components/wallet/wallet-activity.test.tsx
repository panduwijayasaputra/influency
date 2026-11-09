import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WalletTransaction } from '@influency/shared';
import { WalletActivity } from './wallet-activity';

const tx = (over: Partial<WalletTransaction>): WalletTransaction => ({
  id: '0198a3c0-0000-7000-8000-000000000101',
  type: 'TOPUP_CREDIT',
  amountCoins: 50,
  createdAt: '2026-11-03T05:00:00.000Z',
  topupOrderId: null,
  detail: null,
  href: null,
  ...over,
});

const show = (items: WalletTransaction[]) =>
  render(
    <WalletActivity
      items={items}
      hasMore={false}
      loadingMore={false}
      loadError={false}
      onLoadMore={vi.fn()}
    />,
  );

describe('WalletActivity', () => {
  it('shows an unlock debit as a minus with a link to the post', () => {
    show([
      tx({
        type: 'POST_PURCHASE_DEBIT',
        amountCoins: -25,
        detail: 'Ana Putri',
        href: '/ana/posts/p1',
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Buka post · Ana Putri' })).toHaveAttribute(
      'href',
      '/ana/posts/p1',
    );
    expect(screen.getByText('−25')).toBeInTheDocument();
  });

  it('shows a subscription debit with a link to the creator', () => {
    show([tx({ type: 'SUBSCRIPTION_DEBIT', amountCoins: -75, detail: 'Ana Putri', href: '/ana' })]);
    expect(screen.getByRole('link', { name: 'Langganan · Ana Putri' })).toHaveAttribute(
      'href',
      '/ana',
    );
    expect(screen.getByText('−75')).toBeInTheDocument();
  });

  it('shows a tip as a minus with a link to the post or creator', () => {
    show([tx({ type: 'TIP_DEBIT', amountCoins: -10, detail: 'Ana Putri', href: '/ana' })]);
    expect(screen.getByRole('link', { name: 'Tip · Ana Putri' })).toHaveAttribute('href', '/ana');
    expect(screen.getByText('−10')).toBeInTheDocument();
  });

  it('shows a cancelled renewal as a refund', () => {
    show([
      tx({
        type: 'SUBSCRIPTION_REFUND_CREDIT',
        amountCoins: 75,
        detail: 'Ana Putri',
        href: '/ana',
      }),
    ]);
    expect(screen.getByRole('link', { name: 'Perpanjangan dibatalkan · Ana Putri' })).toBeVisible();
    expect(screen.getByText('+75')).toBeInTheDocument();
  });

  it('shows a top-up as a plus without a link', () => {
    show([tx({ amountCoins: 50 })]);
    expect(screen.getByText('Isi ulang · 50 Koin')).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
    expect(screen.queryByRole('link')).toBeNull();
  });
});
