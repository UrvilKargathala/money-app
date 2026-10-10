/**
 * Object-storage seam for client-encrypted attachment bytes.
 *
 * Selection (resolveStorageKind):
 *   BLOB_READ_WRITE_TOKEN set        → Vercel Blob   (production)
 *   NODE_ENV === "test"              → in-memory     (tests, zero network)
 *   local dev                        → .data/attachments on disk
 *   deployed without a token         → hard error    (misconfiguration guard)
 *
 * `note_attachments.file_path` stores whatever path/url the provider returns
 * - the column abstracts the backend.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StoredObject = {
  /** Provider path/URL to persist in note_attachments.file_path. */
  path: string;
};

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array, contentType?: string): Promise<StoredObject>;
  get(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
}

export type StorageKind = "vercel-blob" | "memory" | "local-file" | "misconfigured-vercel";

export function resolveStorageKind(
  env: NodeJS.ProcessEnv = process.env
): StorageKind {
  if (env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  if (env.NODE_ENV === "test") return "memory";
  if (env.VERCEL === "1") return "misconfigured-vercel";
  return "local-file";
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

/** Local development: files under <repo-root>/.data/attachments (gitignored). */
const LOCAL_SCHEME = "local://";

class LocalFileProvider implements ObjectStorage {
  #baseDir = join(
    dirname(fileURLToPath(import.meta.url)),
    "..",
    "..",
    "..",
    "..",
    ".data",
    "attachments"
  );

  #resolve(key: string): string {
    // Key is server-generated (`notes/<userId>/<noteId>/<uuid>`) - no traversal
    // surface, but normalize anyway.
    const safe = key.replace(/\.\./g, "").replace(/^\/+/, "");
    return join(this.#baseDir, safe);
  }

  async put(key: string, bytes: Uint8Array): Promise<StoredObject> {
    const target = this.#resolve(key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return { path: `${LOCAL_SCHEME}${key}` };
  }

  async get(path: string): Promise<Uint8Array> {
    const key = path.startsWith(LOCAL_SCHEME)
      ? path.slice(LOCAL_SCHEME.length)
      : path;
    try {
      return new Uint8Array(await readFile(this.#resolve(key)));
    } catch {
      throw new Error("NOT_FOUND");
    }
  }

  async delete(path: string): Promise<void> {
    const key = path.startsWith(LOCAL_SCHEME)
      ? path.slice(LOCAL_SCHEME.length)
      : path;
    await rm(this.#resolve(key), { force: true });
  }
}

class VercelBlobProvider implements ObjectStorage {
  // Server-only token read: this module is imported by API routes alone,
  // never by client components, so the secret never reaches the browser.
  #token(): string {
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      throw new Error(
        "Attachment storage is not configured: set the BLOB_READ_WRITE_TOKEN " +
          "environment variable in your Vercel project (Storage → Blob → connect)."
      );
    }
    return token;
  }

  async #blob(): Promise<typeof import("@vercel/blob")> {
    return import("@vercel/blob");
  }

  async put(key: string, bytes: Uint8Array, contentType?: string): Promise<StoredObject> {
    const token = this.#token();
    const blob = await this.#blob();
    // Real Blob (not a cast): the store is private, so uploads must use
    // access "private" — "public" is rejected with
    // "Cannot use public access on a private store". slice() copies the view
    // into an exact-length ArrayBuffer (satisfies BlobPart on all TS libs).
    const body = new Blob([bytes.slice().buffer as ArrayBuffer], contentType ? { type: contentType } : undefined);
    const result = await blob.put(key, body, {
      access: "private",
      addRandomSuffix: false,
      ...(contentType ? { contentType } : {}),
      token,
    });
    // Persist the full URL - get()/delete() need nothing else.
    return { path: result.url };
  }

  async get(path: string): Promise<Uint8Array> {
    // Private blobs 403 anonymous reads: our download endpoints run
    // server-side and proxy the bytes through authed routes, so Bearer here
    // never leaks to the client.
    const res = await fetch(path, {
      headers: { authorization: `Bearer ${this.#token()}` },
    });
    if (!res.ok) throw new Error("NOT_FOUND");
    return new Uint8Array(await res.arrayBuffer());
  }

  async delete(path: string): Promise<void> {
    const blob = await this.#blob();
    await blob.del(path);
  }
}

/** True when err is the missing-token misconfiguration (deserves a 503, not a 500). */
export function isStorageMisconfigured(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.message.includes("BLOB_READ_WRITE_TOKEN")
  );
}

let memoryProvider: MemoryProvider | null = null;
let localFileProvider: LocalFileProvider | null = null;

export function getObjectStorage(): ObjectStorage {
  switch (resolveStorageKind()) {
    case "vercel-blob":
      return new VercelBlobProvider();
    case "memory":
      if (!memoryProvider) memoryProvider = new MemoryProvider();
      return memoryProvider;
    case "local-file":
      if (!localFileProvider) localFileProvider = new LocalFileProvider();
      return localFileProvider;
    case "misconfigured-vercel":
      throw new Error(
        "Attachment storage is not configured: set the BLOB_READ_WRITE_TOKEN " +
          "environment variable in your Vercel project (Storage → Blob → connect)."
      );
  }
}
