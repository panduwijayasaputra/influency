import { Injectable, Logger } from '@nestjs/common';
import type { CreatePostReportInput, PostReportResponse } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import { PostAccessService } from '../entitlements/post-access.service.js';

/** Post reports (US-042): one open report per (post, reporter); admins resolve them in the moderation queue. */
@Injectable()
export class PostReportsService {
  private readonly logger = new Logger(PostReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PostAccessService,
  ) {}

  /** userId from the session only. hidden → NOT_FOUND, own post → CANNOT_REPORT_OWN_POST, not published → POST_NOT_AVAILABLE. */
  async report(
    postId: string,
    userId: string,
    input: CreatePostReportInput,
  ): Promise<PostReportResponse> {
    if ((await this.access.check(postId, userId)) === 'hidden') throw new DomainError('NOT_FOUND');
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { status: true, creatorProfile: { select: { userId: true } } },
    });
    if (!post) throw new DomainError('NOT_FOUND');
    if (post.creatorProfile.userId === userId) throw new DomainError('CANNOT_REPORT_OWN_POST');
    if (post.status !== 'PUBLISHED') throw new DomainError('POST_NOT_AVAILABLE');

    // ON CONFLICT DO NOTHING on post_reports_one_open: a repeat while open keeps the first report.
    await this.prisma.postReport.createMany({
      data: [{ postId, reporterId: userId, reason: input.reason, note: input.note || null }],
      skipDuplicates: true,
    });
    // Never the note: free text from the user.
    this.logger.log(`post_report post=${postId} reason=${input.reason}`);
    return { reported: true };
  }
}
