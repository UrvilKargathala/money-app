import { afterEach, describe, expect, it } from "vitest";
import { getObjectStorage, resolveStorageKind } from "./object-storage";

const ENV_KEYS = ["BLOB_READ_WRITE_TOKEN", "NODE_ENV", "VERCEL"] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function withEnv(overrides: Partial<Record<(typeof ENV_KEYS)[number], string>>): void {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined && process.env[key] !== undefined) {
      saved[key] = process.env[key];
    }
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe("storage provider selection", () => {
  it("prefers Vercel Blob whenever the token exists — even in tests", () => {
    withEnv({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_x", NODE_ENV: "test" });
    expect(resolveStorageKind()).toBe("vercel-blob");
  });

  it("uses memory under the test runner", () => {
    withEnv({ NODE_ENV: "test" });
    expect(resolveStorageKind()).toBe("memory");
    expect(getObjectStorage()).toBe(getObjectStorage()); // singleton
  });

  it("uses local disk for plain local development", () => {
    withEnv({ NODE_ENV: undefined, VERCEL: undefined });
    expect(resolveStorageKind()).toBe("local-file");
  });

  it("flags a Vercel deployment without a token as misconfigured", () => {
    withEnv({ NODE_ENV: "production", VERCEL: "1" });
    expect(resolveStorageKind()).toBe("misconfigured-vercel");
    expect(() => getObjectStorage()).toThrow(/BLOB_READ_WRITE_TOKEN/);
  });

  it("local file provider round-trips bytes through its path scheme", async () => {
    withEnv({ NODE_ENV: undefined, VERCEL: undefined });
    const storage = getObjectStorage();
    const key = `notes/1/00000000-0000-4000-8000-000000000000/test-${Date.now()}.bin`;
    const payload = new TextEncoder().encode("ciphertext-roundtrip");

    const stored = await storage.put(key, payload);
    expect(stored.path.startsWith("local://")).toBe(true);

    const fetched = await storage.get(stored.path);
    expect(Buffer.from(fetched).toString()).toBe("ciphertext-roundtrip");

    await storage.delete(stored.path);
    await expect(storage.get(stored.path)).rejects.toThrow("NOT_FOUND");
  });
});
