import { Controller, HttpCode, Inject, Post, type RawBodyRequest, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { verifyStreamWebhook } from '../../common/stream-webhook.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { PostMediaService } from './post-media.service.js';

// Only the uid is used; the state is re-read from the provider, never taken from the event.
const eventPipe = new ZodValidationPipe(z.object({ uid: z.string().regex(/^[A-Za-z0-9]{1,64}$/) }));

/** Cloudflare Stream processing webhook (docs/video-processing.md). Off (404) without CLOUDFLARE_STREAM_WEBHOOK_SECRET. */
@Controller('webhooks/video')
export class VideoWebhookController {
  constructor(
    private readonly media: PostMediaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('cloudflare-stream')
  @HttpCode(200)
  async cloudflareStream(@Req() req: RawBodyRequest<FastifyRequest>): Promise<object> {
    const secret = this.env.CLOUDFLARE_STREAM_WEBHOOK_SECRET;
    if (!secret) throw new DomainError('NOT_FOUND');
    const signature = req.headers['webhook-signature'];
    if (
      !req.rawBody ||
      typeof signature !== 'string' ||
      !verifyStreamWebhook(req.rawBody, signature, secret, new Date())
    ) {
      throw new DomainError('FORBIDDEN');
    }
    // Validated only after the signature, so unsigned junk gets the same 403.
    const { uid } = eventPipe.transform(req.body);
    await this.media.handleVideoEvent(uid);
    return {};
  }
}
