import { Controller, Get, Header, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { MySubscriptionList } from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { MySubscriptionsService } from './my-subscriptions.service.js';

/** Langganan (user-area US-047): signed-in only; the answer is the caller's own, so it is never cached. */
@Controller('me')
@UseGuards(SessionGuard)
export class MySubscriptionsController {
  constructor(private readonly subscriptions: MySubscriptionsService) {}

  @Get('subscriptions')
  @Header('cache-control', 'no-store')
  get(@Req() req: FastifyRequest): Promise<MySubscriptionList> {
    return this.subscriptions.list(req.authSession!.userId);
  }
}
