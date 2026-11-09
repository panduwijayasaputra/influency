import {
  EARNINGS_PENDING_DAYS,
  type EarningsActivityItem,
  type EarningsActivityType,
  KOIN_TO_IDR,
} from '@influency/shared';
import { toSafeInt } from '../../common/bigint.js';

/** The ledger source behind each activity type. */
export const ACTIVITY_SOURCE = {
  subscription: 'SUBSCRIPTION_PERIOD',
  unlock: 'POST_PURCHASE',
  tip: 'TIP',
} as const satisfies Record<Exclude<EarningsActivityType, 'all'>, string>;

const TYPE_OF_SOURCE: Record<string, EarningsActivityItem['type']> = {
  SUBSCRIPTION_PERIOD: 'subscription',
  POST_PURCHASE: 'unlock',
  TIP: 'tip',
};

export const CAPTION_EXCERPT_MAX = 60;
const DAY_MS = 86_400_000;

/** First non-empty line of a caption, cut at 60 characters with an ellipsis; null when there is nothing to show. */
export function captionExcerpt(caption: string | null): string | null {
  const line = caption
    ?.split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '');
  if (!line) return null;
  const chars = [...line];
  return chars.length > CAPTION_EXCERPT_MAX
    ? `${chars.slice(0, CAPTION_EXCERPT_MAX).join('')}…`
    : line;
}

/** A row of the activity query (see EarningsService.activity). Amounts are BigInt, times are epoch milliseconds. */
export interface ActivityRow {
  id: string;
  kind: 'SALE' | 'REVERSAL';
  source_type: string;
  amount_idr: bigint;
  gross_idr: bigint;
  fee_bps: number;
  /** When the row was posted (a reversal: when it was cancelled). */
  created_ms: bigint;
  /** When the earning starts to accrue, as the instant it was meant (see writtenInstant). */
  accrues_ms: bigint;
  /** accrues_at + 14 days has passed, by the database clock. */
  available: boolean;
  buyer_name: string | null;
  post_caption: string | null;
}

/** Only the buyer's display name and a caption excerpt leave the API: no ids, usernames or Telegram data. */
export function toActivityItem(row: ActivityRow): EarningsActivityItem {
  return {
    id: row.id,
    type: TYPE_OF_SOURCE[row.source_type] ?? 'unlock',
    kind: row.kind,
    occurredAt: new Date(Number(row.created_ms)).toISOString(),
    buyerName: row.buyer_name ?? 'Pengguna',
    postCaption: captionExcerpt(row.post_caption),
    grossKoin: toSafeInt(row.gross_idr / BigInt(KOIN_TO_IDR)),
    feeBps: row.fee_bps,
    netIdr: toSafeInt(row.amount_idr),
    status: row.available ? 'AVAILABLE' : 'PENDING',
    availableAt: new Date(Number(row.accrues_ms) + EARNINGS_PENDING_DAYS * DAY_MS).toISOString(),
  };
}
