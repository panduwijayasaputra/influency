import { Body, Controller, Headers, HttpCode, Inject, Param, Put, Query } from '@nestjs/common';
import { DomainError } from '../../common/domain-error.js';
import { LocalObjectStorage } from '../../common/local-object-storage.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../common/object-storage.js';

/** Stand-in for a presigned R2 PUT when STORAGE_DRIVER=local; 404 with any other driver. The token is the authorization. */
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
}
