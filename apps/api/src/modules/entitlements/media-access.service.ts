import { Inject, Injectable, Logger } from '@nestjs/common';
import type { MediaAccessItem, MediaAccessResponse } from '@influency/shared';
import { sha256hex } from '../../common/crypto.js';
import { DomainError } from '../../common/domain-error.js';
import { ENV, type Env } from '../../common/env.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { AuthSession } from '../../common/session.guard.js';
import { VIDEO_PROVIDER, type VideoProvider } from '../../common/video-provider.js';
import { PostAccessService } from './post-access.service.js';

/** Mints short-lived media URLs for a post, only after `PostAccessService.check` returns `full`. */
@Injectable()
export class MediaAccessService {
  private readonly logger = new Logger(MediaAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
    @Inject(ENV) private readonly env: Env,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    @Inject(VIDEO_PROVIDER) private readonly video: VideoProvider,
  ) {}

  /** session must be `req.authSession` (never client-supplied). hidden → 404, locked → 403, no URL either way. */
  async mint(postId: string, session: AuthSession | undefined): Promise<MediaAccessResponse> {
    const decision = await this.access.check(postId, session?.userId ?? null);
    const media = decision === 'full' ? await this.mintAll(postId) : [];
    // Authorization event: ids and the decision only, never URLs or tokens.
    this.logger.log(
      `media_access post=${postId} user=${session?.userId ?? 'anon'} decision=${decision} count=${media.length}`,
    );
    if (decision === 'hidden') throw new DomainError('NOT_FOUND');
    if (decision === 'locked') throw new DomainError('FORBIDDEN');
    return {
      media,
      expiresAt: new Date(Date.now() + this.env.MEDIA_ACCESS_TTL_SECONDS * 1000).toISOString(),
      // Pseudonymous and stable per session: identifies a leak's session for the operator, no personal data.
      watermark: session ? sha256hex(session.sessionId).slice(0, 8) : null,
    };
  }

  private async mintAll(postId: string): Promise<MediaAccessItem[]> {
    const ttl = this.env.MEDIA_ACCESS_TTL_SECONDS;
    const rows = await this.prisma.mediaAsset.findMany({
      where: { postId, status: 'READY' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, kind: true, objectKey: true, videoUid: true, durationSeconds: true },
    });
    const items = await Promise.all(
      rows.map(async (row): Promise<MediaAccessItem | null> => {
        if (row.kind === 'IMAGE') {
          const { url } = await this.storage.createDownloadUrl(row.objectKey!, ttl);
          return { id: row.id, kind: 'IMAGE', url };
        }
        // A READY row whose provider video is gone or not playable is skipped, not fatal.
        const playback = await this.video.createPlaybackUrl(row.videoUid!, ttl);
        return (
          playback && {
            id: row.id,
            kind: 'VIDEO',
            url: playback.url,
            posterUrl: playback.posterUrl,
            player: playback.player,
            durationSeconds: row.durationSeconds,
          }
        );
      }),
    );
    return items.filter((item) => item !== null);
  }
}
