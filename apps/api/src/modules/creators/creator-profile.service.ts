import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  API_PREFIX,
  type CreatorProfileResponse,
  PROFILE_IMAGE_MAX_BYTES,
  type ProfileImageKind,
  RECOMMENDED_CREATORS_LIMIT,
  type RecommendedCreator,
  type UpdateCreatorProfileInput,
} from '@influency/shared';
import { z } from 'zod';
import { DomainError } from '../../common/domain-error.js';
import { detectImageType } from '../../common/image-type.js';
import {
  OBJECT_STORAGE,
  type ObjectStorage,
  type StoredObject,
} from '../../common/object-storage.js';
import { PrismaService } from '../../common/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { RECOMMENDED_ORDER } from './recommended-order.js';

const KEY_PREFIX = 'profile-images/';
const KEY_COLUMN = { avatar: 'avatarKey', banner: 'bannerKey' } as const;
/** Publicly visible creators: approved, and the account is not suspended. */
export const PUBLIC_CREATOR = {
  status: 'APPROVED',
  user: { status: 'ACTIVE' },
} satisfies Prisma.CreatorProfileWhereInput;

interface ProfileRow {
  slug: string;
  displayName: string;
  bio: string | null;
  category: string | null;
  avatarKey: string | null;
  bannerKey: string | null;
}

/** Studio profile edits for the caller's own (approved) creator profile, plus public profile images. */
@Injectable()
export class CreatorProfileService {
  private readonly logger = new Logger(CreatorProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async getMine(profileId: string): Promise<CreatorProfileResponse> {
    return toResponse(
      await this.prisma.creatorProfile.findUniqueOrThrow({ where: { id: profileId } }),
    );
  }

  /** Applies only display name, bio and category ('' clears bio/category). */
  async update(
    profileId: string,
    input: UpdateCreatorProfileInput,
  ): Promise<CreatorProfileResponse> {
    const { displayName, bio, category } = input;
    const row = await this.prisma.creatorProfile.update({
      where: { id: profileId },
      data: {
        ...(displayName !== undefined && { displayName }),
        ...(bio !== undefined && { bio: bio || null }),
        ...(category !== undefined && { category: category || null }),
      },
    });
    return toResponse(row);
  }

  // shortcut: originals are stored as uploaded (EXIF/GPS kept); strip/re-encode with US-016 image processing.
  async uploadImage(
    profileId: string,
    kind: ProfileImageKind,
    body: unknown,
  ): Promise<CreatorProfileResponse> {
    // Non-image content types (e.g. JSON) arrive parsed, not as a Buffer.
    if (!Buffer.isBuffer(body)) throw new DomainError('UNSUPPORTED_FILE_TYPE');
    const type = detectImageType(body);
    if (!type) throw new DomainError('UNSUPPORTED_FILE_TYPE');
    const maxBytes = PROFILE_IMAGE_MAX_BYTES[kind];
    if (body.length > maxBytes) throw new DomainError('FILE_TOO_LARGE', { maxBytes });

    const column = KEY_COLUMN[kind];
    const before = await this.prisma.creatorProfile.findUniqueOrThrow({
      where: { id: profileId },
      select: { avatarKey: true, bannerKey: true },
    });
    const key = KEY_PREFIX + randomUUID();
    await this.storage.put(key, body, type); // detected type, never the client's header
    const row = await this.prisma.creatorProfile.update({
      where: { id: profileId },
      data: { [column]: key },
    });

    // shortcut: concurrent uploads of one kind can orphan an R2 object; add a sweep job if storage cost matters.
    const old = before[column];
    if (old) {
      this.storage.delete(old).catch((err: unknown) => {
        this.logger.warn(`profile image cleanup failed: ${(err as Error).message}`);
      });
    }
    return toResponse(row);
  }

  /** Public profile for /{creatorSlug}; the same NOT_FOUND for unknown, unapproved and suspended. */
  async getPublic(slug: string): Promise<CreatorProfileResponse> {
    const row = await this.prisma.creatorProfile.findFirst({
      where: { slug: slug.toLowerCase(), ...PUBLIC_CREATOR },
    });
    if (!row) throw new DomainError('NOT_FOUND');
    return toResponse(row);
  }

  /** Approved creators the viewer neither is nor follows, in placeholder rank order. */
  async recommended(userId: string): Promise<RecommendedCreator[]> {
    const rows = await this.prisma.creatorProfile.findMany({
      where: { ...PUBLIC_CREATOR, userId: { not: userId }, follows: { none: { userId } } },
      orderBy: RECOMMENDED_ORDER,
      take: RECOMMENDED_CREATORS_LIMIT,
      select: {
        slug: true,
        displayName: true,
        avatarKey: true,
        bannerKey: true,
        _count: { select: { follows: { where: { user: { status: 'ACTIVE' } } } } },
      },
    });
    return rows.map((r) => ({
      slug: r.slug,
      displayName: r.displayName,
      avatarUrl: imageUrl(r.slug, r.avatarKey),
      bannerUrl: imageUrl(r.slug, r.bannerKey),
      followerCount: r._count.follows,
    }));
  }

  /** Public: only the current avatar/banner of a publicly visible creator is served. */
  async getPublicImage(slug: string, imageId: string): Promise<StoredObject> {
    if (!z.uuid().safeParse(imageId).success) throw new DomainError('NOT_FOUND');
    const key = KEY_PREFIX + imageId;
    const profile = await this.prisma.creatorProfile.findFirst({
      where: {
        slug: slug.toLowerCase(),
        ...PUBLIC_CREATOR,
        OR: [{ avatarKey: key }, { bannerKey: key }],
      },
      select: { id: true },
    });
    if (!profile) throw new DomainError('NOT_FOUND');
    const object = await this.storage.get(key);
    if (!object) throw new DomainError('NOT_FOUND');
    return object;
  }
}

export function imageUrl(slug: string, key: string | null): string | null {
  return key ? `/${API_PREFIX}/creators/${slug}/images/${key.slice(KEY_PREFIX.length)}` : null;
}

function toResponse(row: ProfileRow): CreatorProfileResponse {
  return {
    slug: row.slug,
    displayName: row.displayName,
    bio: row.bio,
    category: row.category,
    avatarUrl: imageUrl(row.slug, row.avatarKey),
    bannerUrl: imageUrl(row.slug, row.bannerKey),
  };
}
