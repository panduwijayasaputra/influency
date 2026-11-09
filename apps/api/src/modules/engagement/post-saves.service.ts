import { Injectable } from '@nestjs/common';
import type { PostSaveResponse } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PostAccessService } from '../entitlements/post-access.service.js';

/**
 * Simpan: a private bookmark, one row per (post, user). Saving grants and revokes no access (a locked premium post
 * stays locked) and is never counted publicly. userId comes from the session only.
 */
@Injectable()
export class PostSavesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
  ) {}

  /** hidden → NOT_FOUND, not published → POST_NOT_AVAILABLE. Locked premium and own posts may be saved. */
  async save(postId: string, userId: string): Promise<PostSaveResponse> {
    if ((await this.access.check(postId, userId)) === 'hidden') throw new DomainError('NOT_FOUND');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true },
    });
    if (post?.status !== 'PUBLISHED') throw new DomainError('POST_NOT_AVAILABLE');
    // shortcut: no post-row lock; a save racing an archive is harmless (non-financial, the library hides it).
    await this.prisma.postSave.createMany({ data: [{ postId, userId }], skipDuplicates: true });
    return { saved: true };
  }

  /** No eligibility check: it only removes the caller's own row, so it works after an archive and leaks nothing. */
  async unsave(postId: string, userId: string): Promise<PostSaveResponse> {
    await this.prisma.postSave.deleteMany({ where: { postId, userId } });
    return { saved: false };
  }
}
