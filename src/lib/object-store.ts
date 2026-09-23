import { getContext } from "~/lib/context";

// The subset of the R2 bucket API the media module uses. On Cloudflare the
// MEDIA_BUCKET binding satisfies it directly; the Node server and tests use the
// in-memory store below, which does not survive a restart.
export interface StoredObject {
  body: ReadableStream;
  size: number;
}

export interface ObjectStore {
  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  get(key: string): Promise<StoredObject | null>;
  head(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
}

export function createMemoryObjectStore(): ObjectStore {
  const objects = new Map<string, Uint8Array>();
  return {
    async put(key, value) {
      objects.set(key, value instanceof Uint8Array ? value.slice() : new Uint8Array(value));
    },
    async get(key) {
      const data = objects.get(key);
      if (!data) return null;
      return { body: new Blob([data]).stream(), size: data.byteLength };
    },
    async head(key) {
      const data = objects.get(key);
      return data ? { size: data.byteLength } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
}

export const localObjectStore = createMemoryObjectStore();

// The store for the current request: the R2 binding on Cloudflare, else the local store.
export function objectStore(): ObjectStore {
  return getContext()?.objects ?? localObjectStore;
}
