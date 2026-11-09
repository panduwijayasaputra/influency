import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV, type Env } from '../../common/env.js';
import { NotificationProducer } from './notification-producer.service.js';

/** Creates SUBSCRIPTION_ENDING notifications every SUBSCRIPTION_REMINDER_INTERVAL_SECONDS (0 = off). */
// shortcut: in-process timer on every API instance (the dedupe key makes extra runs harmless); move to a BullMQ repeatable job with the worker (ADR 0001).
@Injectable()
export class SubscriptionReminder implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(SubscriptionReminder.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly producer: NotificationProducer,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.env.SUBSCRIPTION_REMINDER_INTERVAL_SECONDS;
    if (seconds === 0) return;
    this.timer = setInterval(() => void this.run(), seconds * 1000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Skips a tick while the previous run is still going. */
  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.producer.remindEndingSubscriptions();
    } catch (err) {
      this.logger.warn(`subscription reminder failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
