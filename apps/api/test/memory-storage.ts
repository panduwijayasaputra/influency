import type { ObjectStorage, StoredObject } from '../src/common/object-storage.js';

type Op = 'put' | 'get' | 'head' | 'delete';

/**
 * In-memory `ObjectStorage` for tests (override `OBJECT_STORAGE`). Set `failNext.<op>` to make the next call of that op reject.
 * Upload URLs are `memory://upload/<key>`; simulate the browser PUT with `objects.set(key, …)`.
 */
export function createMemoryStorage() {
  const objects = new Map<string, StoredObject>();
  const failNext: Record<Op, boolean> = { put: false, get: false, head: false, delete: false };
  const run = <T>(op: Op, action: () => T): Promise<T> => {
    if (!failNext[op]) return Promise.resolve(action());
    failNext[op] = false;
    return Promise.reject(new Error(`memory storage ${op} failed`));
  };
  const storage: ObjectStorage = {
    put: (key, body, contentType) =>
      run('put', () => void objects.set(key, { body: new Uint8Array(body), contentType })),
    get: (key) => run('get', () => objects.get(key) ?? null),
    head: (key) =>
      run('head', () => {
        const object = objects.get(key);
        return object ? { size: object.body.length, contentType: object.contentType } : null;
      }),
    delete: (key) => run('delete', () => void objects.delete(key)),
    createUploadUrl: (key, contentType, expiresInSeconds) =>
      Promise.resolve({
        url: `memory://upload/${key}`,
        headers: { 'content-type': contentType },
        expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
      }),
  };
  return { storage, objects, failNext };
}
