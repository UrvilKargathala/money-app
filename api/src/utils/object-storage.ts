/**
 * Object-storage seam for client-encrypted attachment bytes.
 *
 * Production runs the Vercel Blob provider (active when
 * BLOB_READ_WRITE_TOKEN is set); tests run the in-memory provider so no
 * network is touched. `note_attachments.file_path` stores whatever path/url
 * the provider returns — the column abstracts the backend.
 */

export type StoredObject = {
  /** Provider path/URL to persist in note_attachments.file_path. */
  path: string;
};

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array): Promise<StoredObject>;
  get(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
}

class MemoryProvider implements ObjectStorage {
  private store = new Map<string, Uint8Array>();

  async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
    this.store.set(key, bytes);
    return { path: `memory://${key}` };
  }

  async get(path: string): Promise<Uint8Array> {
    const key = path.replace(/^memory:\/\//, "");
    const bytes = this.store.get(key);
    if (!bytes) throw new Error("NOT_FOUND");
    return bytes;
  }

  async delete(path: string): Promise<void> {
    this.store.delete(path.replace(/^memory:\/\//, ""));
  }
}

class VercelBlobProvider implements ObjectStorage {
  async #blob(): Promise<typeof import("@vercel/blob")> {
    return import("@vercel/blob");
  }

  async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
    const blob = await this.#blob();
    const result = await blob.put(key, bytes as unknown as Blob, {
      access: "public",
      addRandomSuffix: false,
    });
    // Persist the full URL — get()/delete() need nothing else.
    return { path: result.url };
  }

  async get(path: string): Promise<Uint8Array> {
    const res = await fetch(path);
    if (!res.ok) throw new Error("NOT_FOUND");
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(path: string): Promise<void> {
    const blob = await this.#blob();
    await blob.del(path);
  }
}

let memoryProvider: MemoryProvider | null = null;

export function getObjectStorage(): ObjectStorage {
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    return new VercelBlobProvider();
  }
  if (!memoryProvider) memoryProvider = new MemoryProvider();
  return memoryProvider;
}
