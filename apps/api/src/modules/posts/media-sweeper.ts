import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ENV, type Env } from '../../common/env.js';
import { PostMediaService } from './post-media.service.js';

/** Runs the stale-upload sweep every MEDIA_SWEEP_INTERVAL_SECONDS (0 = off). */
// shortcut: in-process timer on every API instance (the sweep is idempotent); move to a BullMQ repeatable job with the worker (Phase 5).
@Injectable()
export class MediaSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MediaSweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly media: PostMediaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    const seconds = this.env.MEDIA_SWEEP_INTERVAL_SECONDS;
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
      await this.media.sweep();
    } catch (err) {
      this.logger.warn(`stale media sweep failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
