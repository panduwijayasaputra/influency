import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { DomainError } from '../../common/domain-error.js';
import { type MidtransNotification, midtransNotificationSchema } from '../../common/midtrans.js';
import { RateLimit, RateLimitGuard } from '../../common/rate-limit.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { TopupCreditService } from './topup-credit.service.js';

/** TBD placeholder: provider deliveries per source IP per minute (Midtrans retries and bursts are well below this). */
export const MIDTRANS_WEBHOOK_RATE_LIMIT = { max: 300, timeWindow: '1 minute' };

/**
 * Midtrans payment notification (koin-wallet US-031). Provider-only: no session, so the global CSRF guard does not
 * apply; authenticity is the `signature_key` check. 200 only after the payload is durably stored and handled, so a
 * storage failure answers 500 and Midtrans retries. Set its URL in the Midtrans Sandbox dashboard.
 */
@Controller('webhooks/payments')
@UseGuards(RateLimitGuard)
export class MidtransWebhookController {
  constructor(private readonly credit: TopupCreditService) {}

  @Post('midtrans')
  @HttpCode(200)
  @RateLimit(MIDTRANS_WEBHOOK_RATE_LIMIT)
  async midtrans(
    @Body(new ZodValidationPipe(midtransNotificationSchema)) body: MidtransNotification,
  ): Promise<{ ok: true }> {
    const outcome = await this.credit.handleNotification(body);
    if (outcome === 'REJECTED_SIGNATURE') throw new DomainError('PAYMENT_VERIFICATION_FAILED');
    return { ok: true };
  }
}
