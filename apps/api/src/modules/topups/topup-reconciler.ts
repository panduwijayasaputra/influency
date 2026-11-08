import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV, type Env } from '../../common/env.js';
import { TopupReconcileService } from './topup-reconcile.service.js';

/** Checks pending top-ups every TOPUP_RECONCILE_INTERVAL_SECONDS (0 = off). */
// shortcut: in-process timer on every API instance (every write is idempotent, extra instances only cost extra status calls); move to a BullMQ repeatable job with the worker (Phase 5).
@Injectable()
export class TopupReconciler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(TopupReconciler.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly reconcile: TopupReconcileService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.env.TOPUP_RECONCILE_INTERVAL_SECONDS;
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
      await this.reconcile.reconcileDue();
    } catch (err) {
      this.logger.warn(`top-up reconcile failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
