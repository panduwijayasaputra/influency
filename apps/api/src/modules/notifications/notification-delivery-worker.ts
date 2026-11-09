import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV, type Env } from '../../common/env.js';
import { TELEGRAM_BOT, type TelegramBot } from '../../common/telegram-bot.js';
import { NotificationDeliveryService } from './notification-delivery.service.js';

/** Sends queued Telegram messages every NOTIFICATION_DELIVERY_INTERVAL_SECONDS (0 = off; never without a bot). */
// shortcut: in-process timer on every API instance (SKIP LOCKED + lease keep sends single); move to a BullMQ worker with Redis (ADR 0001).
@Injectable()
export class NotificationDeliveryWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationDeliveryWorker.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly delivery: NotificationDeliveryService,
    @Inject(ENV) private readonly env: Env,
    @Inject(TELEGRAM_BOT) private readonly bot: TelegramBot | null,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.env.NOTIFICATION_DELIVERY_INTERVAL_SECONDS;
    if (seconds === 0 || !this.bot) return;
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
      await this.delivery.deliverDue();
    } catch (err) {
      this.logger.warn(`notification delivery failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
