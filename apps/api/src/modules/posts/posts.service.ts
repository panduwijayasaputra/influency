import { Injectable } from '@nestjs/common';
import type { CreatePostInput, StudioPost, UpdatePostInput } from '@influency/shared';
import { DomainError } from '../../common/domain-error.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Post } from '../../generated/prisma/client.js';

function toStudioPost(row: Post): StudioPost {
  return {
    id: row.id,
    caption: row.caption,
    visibility: row.visibility,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Studio posts. Every query is scoped to the caller's creator profile: another creator's id is NOT_FOUND. */
@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Status comes from the DB default (DRAFT). */
  async create(creatorProfileId: string, input: CreatePostInput): Promise<StudioPost> {
    const row = await this.prisma.post.create({
      data: { creatorProfileId, caption: input.caption, visibility: input.visibility },
    });
    return toStudioPost(row);
  }

  async list(creatorProfileId: string): Promise<StudioPost[]> {
    // shortcut: no pagination, add cursor pagination when creators exceed ~100 posts.
    const rows = await this.prisma.post.findMany({
      where: { creatorProfileId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    return rows.map(toStudioPost);
  }

  async get(creatorProfileId: string, id: string): Promise<StudioPost> {
    const row = await this.prisma.post.findFirst({ where: { id, creatorProfileId } });
    if (!row) throw new DomainError('NOT_FOUND');
    return toStudioPost(row);
  }

  /** One owner-scoped write, so there is no read-then-write window. */
  async update(creatorProfileId: string, id: string, input: UpdatePostInput): Promise<StudioPost> {
    const { count } = await this.prisma.post.updateMany({
      where: { id, creatorProfileId },
      data: input,
    });
    if (count === 0) throw new DomainError('NOT_FOUND');
    return this.get(creatorProfileId, id);
  }
}
