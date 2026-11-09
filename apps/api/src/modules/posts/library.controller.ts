import { Controller, Get, Header, Query, Req, UseGuards } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { type LibraryPage, type LibraryQuery, libraryQuerySchema } from '@influency/shared';
import { SessionGuard } from '../../common/session.guard.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import { libraryCursorSchema } from './library-query.js';
import { PublicPostsService } from './public-posts.service.js';

const querySchema = libraryQuerySchema.extend({ cursor: libraryCursorSchema.optional() });

/** Koleksi Saya (user-area US-045): signed-in only; the answer is the caller's own, so it is never cached. */
@Controller('me')
@UseGuards(SessionGuard)
export class LibraryController {
  constructor(private readonly posts: PublicPostsService) {}

  @Get('library')
  @Header('cache-control', 'no-store')
  get(
    @Query(new ZodValidationPipe(querySchema)) query: LibraryQuery,
    @Req() req: FastifyRequest,
  ): Promise<LibraryPage> {
    return this.posts.library(req.authSession!.userId, query);
  }
}
