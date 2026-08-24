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
 * — the column abstracts the backend.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type StoredObject = {
  /** Provider path/URL to persist in note_attachments.file_path. */
  path: string;
};

export interface ObjectStorage {
  put(key: string, bytes: Uint8Array): Promise<StoredObject>;
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
    // Key is server-generated (`notes/<userId>/<noteId>/<uuid>`) — no traversal
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
