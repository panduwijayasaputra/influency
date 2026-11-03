export interface StoredObject {
  body: Uint8Array;
  contentType: string;
}

export interface ObjectHead {
  size: number;
  contentType: string;
}

/** A presigned single-object PUT. The client must send exactly `headers`. */
export interface UploadUrl {
  url: string;
  headers: Record<string, string>;
  expiresAt: Date;
}

/** Private object storage (Cloudflare R2 or local files). Keys are server-generated, never taken from clients. */
export interface ObjectStorage {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** null when the object does not exist. */
  get(key: string): Promise<StoredObject | null>;
  /** Size and type without downloading; null when the object does not exist. */
  head(key: string): Promise<ObjectHead | null>;
  /** Idempotent: deleting a missing object succeeds. */
  delete(key: string): Promise<void>;
  /** Presigned PUT for one key; the signed content type must be sent as-is. Never log the URL. */
  createUploadUrl(key: string, contentType: string, expiresInSeconds: number): Promise<UploadUrl>;
}

/** Injection token for the `ObjectStorage` (`@Inject(OBJECT_STORAGE) storage: ObjectStorage`). */
export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');
