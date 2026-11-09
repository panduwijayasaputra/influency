import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { DomainError } from '../../common/domain-error.js';
import { LocalObjectStorage } from '../../common/local-object-storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../common/object-storage.js';

/** Stand-in for a presigned R2 PUT / GET when STORAGE_DRIVER=local; 404 with any other driver. The token is the authorization. */
@Controller('dev-storage')
export class DevStorageController {
  constructor(@Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage) {}

  @Put(':prefix/:id')
  @HttpCode(204)
  async upload(
    @Param('prefix') prefix: string,
    @Param('id') id: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Headers('content-type') contentType: string | undefined,
    @Body() body: unknown,
  ): Promise<void> {
    if (!(this.storage instanceof LocalObjectStorage)) throw new DomainError('NOT_FOUND');
    const key = `${prefix}/${id}`;
    if (
      !exp ||
      !sig ||
      !contentType ||
      !Buffer.isBuffer(body) ||
      !this.storage.verifyUploadToken(key, contentType, exp, sig)
    ) {
      throw new DomainError('FORBIDDEN');
    }
    await this.storage.put(key, body, contentType);
  }

  // shortcut: whole-object reads, no Range support (the stub video plays but can't seek); dev only.
  @Get(':prefix/:id')
  async download(
    @Param('prefix') prefix: string,
    @Param('id') id: string,
    @Query('exp') exp: string | undefined,
    @Query('sig') sig: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<Buffer> {
    if (!(this.storage instanceof LocalObjectStorage)) throw new DomainError('NOT_FOUND');
    const key = `${prefix}/${id}`;
    if (!exp || !sig || !this.storage.verifyDownloadToken(key, exp, sig)) {
      throw new DomainError('FORBIDDEN');
    }
    const object = await this.storage.get(key);
    if (!object) throw new DomainError('NOT_FOUND');
    void reply.headers({
      'content-type': object.contentType,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-disposition': 'inline',
    });
    return Buffer.from(object.body);
  }
}
