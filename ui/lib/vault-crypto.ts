const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const VAULT_KDF_ITERATIONS = 310_000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64ToBuffer(value: string): ArrayBuffer {
  return Uint8Array.from(base64ToBytes(value)).buffer;
}

export function randomBase64(length = 16): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(length)));
}

async function deriveWrappingKey(password: string, salt: string, iterations: number) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: base64ToBuffer(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createVault(password: string) {
  const vaultKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", vaultKey));
  const salt = randomBase64();
  const wrappingKey = await deriveWrappingKey(password, salt, VAULT_KDF_ITERATIONS);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, raw);
  return {
    vaultKey,
    wrapped: JSON.stringify({ v: 1, iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(encrypted)) }),
    salt,
    iterations: VAULT_KDF_ITERATIONS,
  };
}

export async function unwrapVaultKey(password: string, wrapped: string, salt: string, iterations: number) {
  const payload = JSON.parse(wrapped) as { v: number; iv: string; data: string };
  if (payload.v !== 1 || !payload.iv || !payload.data) throw new Error("Unsupported vault key format.");
  const wrappingKey = await deriveWrappingKey(password, salt, iterations);
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(payload.iv) },
    wrappingKey,
    base64ToBuffer(payload.data),
  );
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptVaultText(key: CryptoKey, value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value));
  return { data_encrypted: bytesToBase64(new Uint8Array(encrypted)), data_iv: bytesToBase64(iv) };
}

export async function decryptVaultText(key: CryptoKey, encrypted: string, iv: string) {
  // Notes created by the old UI used a fake `iv-*` marker and Base64 only.
  // Reading them allows the owner to migrate them by saving once in the new vault.
  if (iv.startsWith("iv-")) return { content: decoder.decode(base64ToBytes(encrypted)), legacy: true };
  const clear = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBuffer(iv) },
    key,
    base64ToBuffer(encrypted),
  );
  return { content: decoder.decode(clear), legacy: false };
}

export async function encryptVaultBytes(key: CryptoKey, value: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer));
  const envelope = new Uint8Array(13 + encrypted.length);
  envelope[0] = 1;
  envelope.set(iv, 1);
  envelope.set(encrypted, 13);
  return envelope;
}

export async function decryptVaultBytes(key: CryptoKey, envelope: Uint8Array) {
  if (envelope[0] !== 1 || envelope.length < 30) throw new Error("Unsupported encrypted attachment.");
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: envelope.slice(1, 13) },
    key,
    envelope.buffer.slice(envelope.byteOffset + 13, envelope.byteOffset + envelope.byteLength) as ArrayBuffer,
  ));
}
