import type { NotificationType } from '@influency/shared';

/** Opt-outs of a user without a preferences row; must equal the `opt_out_types` column default. */
export const DEFAULT_OPT_OUT_TYPES: NotificationType[] = ['COMMENT_LIKE'];

/** Account events every user gets: no toggle can turn them off. */
export const TRANSACTIONAL_TYPES: NotificationType[] = ['TOPUP_CREDITED', 'PAYOUT_STATUS'];
