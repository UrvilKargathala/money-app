import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Server-side AES-256-GCM for the vault RECOVERY COPY only (FR-11.17).
 * The server never sees plaintext vault keys — this exists solely so the
 * recovery-wrapped blob can be stored under a server-held data-encryption
 * key without it being readable in the database.
 *
 * DATA_ENCRYPTION_KEY is any secret string; a stable 32-byte key is derived.
 */
function dataKey(): Buffer {
  const secret = process.env.DATA_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error(
      "DATA_ENCRYPTION_KEY is not configured — cannot handle the recovery copy."
    );
  }
  return createHash("sha256").update(secret).digest();
}

/** Returns base64(iv).base64(ciphertext+tag) under the server DEK. */
export function serverEncrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${iv.toString("base64")}.${encrypted.toString("base64")}`;
}

export function serverDecrypt(payload: string): string {
  const [ivB64, dataB64] = payload.split(".");
  if (!ivB64 || !dataB64) throw new Error("MALFORMED_PAYLOAD");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    dataKey(),
    Buffer.from(ivB64, "base64")
  );
  const buf = Buffer.from(dataB64, "base64");
  const tag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(0, buf.length - 16);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

/** True when the payload was produced by serverEncrypt (shape check only). */
export function looksServerEncrypted(payload: string | null): boolean {
  if (!payload) return false;
  const parts = payload.split(".");
  return parts.length === 2 && parts.every((p) => p.length > 0);
}
