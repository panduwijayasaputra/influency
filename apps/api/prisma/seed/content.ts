import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { DEMO_CREATOR_PROFILE_IDS, DEMO_USER_IDS } from '../../src/common/demo-ids.js';
import { LocalObjectStorage } from '../../src/common/local-object-storage.js';
import { grantKoin } from './koin.js';
import { PreviewGenerator } from '../../src/common/preview-generator.js';

/** Fixed ids so re-seeding upserts the same rows: 0190a000-…-<kind><index>. */
const id = (kind: number, n: number): string =>
  `0190a000-0000-7000-8000-${(kind * 0x1000 + n).toString(16).padStart(12, '0')}`;

type DemoPost = {
  creator: keyof typeof DEMO_CREATOR_PROFILE_IDS;
  visibility: 'FREE' | 'PREMIUM';
  status: 'PUBLISHED' | 'DRAFT';
  caption: string;
  priceCoins?: bigint;
  images: number;
  hue: number;
};

// Per creator: 3 free, 3 premium (10/25/50 Koin), 1 draft. Newest first in the array = latest publishedAt.
const POSTS: DemoPost[] = (['claudia', 'creatorB'] as const).flatMap((creator, c) => [
  {
    creator,
    visibility: 'FREE',
    status: 'PUBLISHED',
    caption: 'Selamat pagi! Kopi dulu ☕',
    images: 1,
    hue: 20 + c * 150,
  },
  {
    creator,
    visibility: 'PREMIUM',
    status: 'PUBLISHED',
    caption: 'Behind the scenes eksklusif 🎬',
    priceCoins: 10n,
    images: 3,
    hue: 200 + c * 40,
  },
  {
    creator,
    visibility: 'FREE',
    status: 'PUBLISHED',
    caption: 'Jalan sore di kota. Ikuti terus ya!',
    images: 2,
    hue: 120 + c * 90,
  },
  {
    creator,
    visibility: 'PREMIUM',
    status: 'PUBLISHED',
    caption: 'Koleksi foto lengkap sesi terbaru',
    priceCoins: 25n,
    images: 4,
    hue: 300 - c * 60,
  },
  {
    creator,
    visibility: 'FREE',
    status: 'PUBLISHED',
    caption: 'Terima kasih sudah mampir ke halamanku ✨',
    images: 1,
    hue: 60 + c * 100,
  },
  {
    creator,
    visibility: 'PREMIUM',
    status: 'PUBLISHED',
    caption: 'Paket spesial: full album + catatan',
    priceCoins: 50n,
    images: 2,
    hue: 340 - c * 120,
  },
  {
    creator,
    visibility: 'FREE',
    status: 'DRAFT',
    caption: 'Draf yang belum terbit',
    images: 1,
    hue: 0,
  },
]);

/** A coloured gradient with a label: real JPEG bytes so the upload checks and previews behave like real photos. */
function image(label: string, hue: number): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},75%,60%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,35%)"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <text x="540" y="675" font-size="64" font-family="sans-serif" fill="white" text-anchor="middle">${label}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer();
}

/**
 * Demo content for manual testing: posts with images, offers, follows, comments, likes and Koin wallets.
 * Images go to the local object store, so this step is skipped (with a notice) when STORAGE_DRIVER is not `local`.
 */
export async function seedContent(prisma: PrismaClient): Promise<void> {
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') {
    console.warn('seed: STORAGE_DRIVER is not local, skipping demo posts and images.');
    return;
  }
  const storage = new LocalObjectStorage(
    resolve(process.env.LOCAL_STORAGE_DIR ?? '.local-storage'),
  );
  const previews = new PreviewGenerator();
  const now = Date.now();

  for (const [i, post] of POSTS.entries()) {
    const postId = id(1, i);
    const creatorProfileId = DEMO_CREATOR_PROFILE_IDS[post.creator];
    const published = post.status === 'PUBLISHED';
    const media: { id: string; key: string; bytes: Buffer }[] = [];
    for (let m = 0; m < post.images; m++) {
      const mediaId = id(2, i * 10 + m);
      const bytes = await image(`${post.creator} #${i + 1}.${m + 1}`, post.hue + m * 25);
      media.push({ id: mediaId, key: `post-media/${mediaId}`, bytes });
    }
    // The cover (media 0) of a premium post is shown blurred to people who haven't unlocked it.
    const previewKey = post.visibility === 'PREMIUM' ? `post-previews/${id(3, i)}` : null;
    if (previewKey)
      await storage.put(previewKey, await previews.blurred(media[0]!.bytes), 'image/webp');

    await prisma.post.upsert({
      where: { id: postId },
      create: {
        id: postId,
        creatorProfileId,
        visibility: post.visibility,
        status: post.status,
        caption: post.caption,
        publishedAt: published ? new Date(now - (POSTS.length - i) * 3_600_000) : null,
      },
      update: {},
    });
    for (const [m, item] of media.entries()) {
      await storage.put(item.key, item.bytes, 'image/jpeg');
      await prisma.mediaAsset.upsert({
        where: { id: item.id },
        create: {
          id: item.id,
          postId,
          kind: 'IMAGE',
          status: 'READY',
          objectKey: item.key,
          contentType: 'image/jpeg',
          byteSize: item.bytes.length,
          uploadExpiresAt: new Date(now),
          position: m,
        },
        update: {},
      });
    }
    if (previewKey) {
      await prisma.post.update({
        where: { id: postId },
        data: { coverMediaId: media[0]!.id, previewKey },
      });
    }
    if (post.priceCoins) {
      await prisma.postOffer.upsert({
        where: { postId_version: { postId, version: 1 } },
        create: { id: id(4, i), postId, version: 1, priceCoins: post.priceCoins },
        update: {},
      });
    }
  }

  await seedVideos(prisma, storage, now);

  const { claudia, creatorB } = DEMO_CREATOR_PROFILE_IDS;
  const { subscriberA, subscriberB } = DEMO_USER_IDS;
  for (const [userId, creatorProfileId] of [
    [subscriberA, claudia],
    [subscriberA, creatorB],
    [subscriberB, claudia],
  ] as const) {
    await prisma.creatorFollow.upsert({
      where: { userId_creatorProfileId: { userId, creatorProfileId } },
      create: { userId, creatorProfileId },
      update: {},
    });
  }

  // Comments and likes on Claudia's first free post (index 0) and a premium one (index 1).
  const comments = [
    { n: 0, postIdx: 0, userId: subscriberA, body: 'Pagi kak! Semangat ya hari ini 😊' },
    { n: 1, postIdx: 0, userId: subscriberB, body: 'Fotonya bagus banget' },
    { n: 2, postIdx: 1, userId: subscriberA, body: 'Penasaran isinya apa, mau unlock ah' },
  ];
  for (const c of comments) {
    await prisma.postComment.upsert({
      where: { id: id(5, c.n) },
      create: { id: id(5, c.n), postId: id(1, c.postIdx), userId: c.userId, body: c.body },
      update: {},
    });
  }
  await prisma.postComment.upsert({
    where: { id: id(5, 3) },
    create: {
      id: id(5, 3),
      postId: id(1, 0),
      userId: DEMO_USER_IDS.claudia,
      body: 'Makasih ya! 💛',
      parentId: id(5, 0),
    },
    update: {},
  });
  for (const userId of [subscriberA, subscriberB]) {
    await prisma.postLike.upsert({
      where: { postId_userId: { postId: id(1, 0), userId } },
      create: { postId: id(1, 0), userId },
      update: {},
    });
  }

  // Wallets: create-only, so re-seeding never resets a balance you've been spending while testing.
  for (const [userId, coins] of [
    [subscriberA, 500n],
    [subscriberB, 100n],
  ] as const) {
    if (!(await prisma.coinWallet.findUnique({ where: { userId } }))) {
      await grantKoin(prisma, userId, coins);
    }
  }
}

/** 3-second 360x640 test-pattern MP4 made with ffmpeg (dev machines only); null when ffmpeg is missing. */
function makeVideo(label: string): Buffer | null {
  const dir = mkdtempSync(join(tmpdir(), 'seed-video-'));
  const out = join(dir, 'v.mp4');
  try {
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        `testsrc2=size=360x640:rate=24:duration=3`,
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=3',
        '-pix_fmt',
        'yuv420p',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-shortest',
        '-movflags',
        '+faststart',
        '-metadata',
        `title=${label}`,
        out,
      ],
      { stdio: 'ignore' },
    );
    return readFileSync(out);
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Free published video posts, which is what Jelajahi > Video lists. The stub video provider reads `post-video/<uid>`. */
async function seedVideos(
  prisma: PrismaClient,
  storage: LocalObjectStorage,
  now: number,
): Promise<void> {
  const bytes = makeVideo('seed');
  if (!bytes) {
    console.warn('seed: ffmpeg not found, skipping demo videos (brew install ffmpeg).');
    return;
  }
  const captions = [
    'Video singkat hari ini 🎥',
    'Cuplikan latihan pagi',
    'Vlog mini: ngopi bareng',
    'Behind the scenes!',
  ];
  for (const [n, caption] of captions.entries()) {
    const creatorProfileId =
      n % 2 === 0 ? DEMO_CREATOR_PROFILE_IDS.claudia : DEMO_CREATOR_PROFILE_IDS.creatorB;
    const postId = id(7, n);
    const mediaId = id(8, n);
    const videoUid = id(9, n);
    await storage.put(`post-video/${videoUid}`, bytes, 'video/mp4');
    await prisma.post.upsert({
      where: { id: postId },
      create: {
        id: postId,
        creatorProfileId,
        visibility: 'FREE',
        status: 'PUBLISHED',
        caption,
        publishedAt: new Date(now - n * 1_800_000),
      },
      update: {},
    });
    await prisma.mediaAsset.upsert({
      where: { id: mediaId },
      create: {
        id: mediaId,
        postId,
        kind: 'VIDEO',
        status: 'READY',
        videoUid,
        durationSeconds: 3,
        contentType: 'video/mp4',
        byteSize: bytes.length,
        uploadExpiresAt: new Date(now),
      },
      update: {},
    });
  }
}
