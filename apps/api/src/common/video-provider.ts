export type VideoState = 'pending_upload' | 'processing' | 'ready' | 'error';

export interface VideoStatus {
  state: VideoState;
  durationSeconds: number | null;
  byteSize: number | null;
}

/** A one-shot browser upload. POST = multipart/form-data with the file under `formField`; PUT = raw body with exactly `headers`. */
export interface VideoUpload {
  uid: string;
  upload: {
    url: string;
    method: 'PUT' | 'POST';
    headers: Record<string, string>;
    formField?: string;
  };
}

export interface VideoUploadInput {
  contentType: string;
  maxDurationSeconds: number;
  expiresInSeconds: number;
}

/** Short-lived signed playback for `<video>`: `hls` = an HLS manifest, `video` = a file. `posterUrl` is signed too. */
export interface VideoPlayback {
  url: string;
  posterUrl: string | null;
  player: 'hls' | 'video';
  expiresAt: Date;
}

/** Private video hosting (Cloudflare Stream or the dev stub). Playback always needs a signed token. Never log upload URLs. */
export interface VideoProvider {
  createUpload(input: VideoUploadInput): Promise<VideoUpload>;
  /** null when the provider has no such video. */
  getStatus(uid: string): Promise<VideoStatus | null>;
  /** Default (first) thumbnail frame, fetched server-side — never a public URL. null while the video is missing or not ready. */
  getThumbnail(uid: string): Promise<Uint8Array | null>;
  /** Signed, no-download playback; null while the video is missing or not ready. Never log the URL. */
  createPlaybackUrl(uid: string, expiresInSeconds: number): Promise<VideoPlayback | null>;
  /** Idempotent: deleting a missing video succeeds. */
  delete(uid: string): Promise<void>;
}

/** Injection token for the `VideoProvider` (`@Inject(VIDEO_PROVIDER) video: VideoProvider`). */
export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
