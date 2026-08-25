import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { verifyPassword } from "../auth";
import {
  getUserPasswordHash,
  getVaultInfo,
  setRecoveryCopy,
  upsertVaultWrap,
  loadVaultNotes,
  insertImportedNote,
} from "../queries/vault";
import { serverEncrypt } from "../utils/server-crypto";

const vault = new Hono();

/** The client needs wrap params to derive its KEK â€” never any key material. */
vault.get("/wrapped-key", requireAuth, async (c) => {
  const user = c.get("user");
  const info = await getVaultInfo(user.user_id);
  if (!info) return c.json({ error: "Not found" }, 404);
  return c.json({
    initialized: info.vault_wrapped !== null,
    vault_wrapped: info.vault_wrapped,
    kdf: {
      salt: info.vault_kdf_salt,
      iterations: info.vault_kdf_iters,
    },
    has_recovery: info.has_recovery,
  });
});

/**
 * Contract endpoint (FR-11.17): all real unlocking happens in-browser; this
 * verifies credentials server-side so the client may proceed to unwrap.
 */
vault.post("/unlock", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const password = String((body as { password?: unknown }).password ?? "");
  if (!password) {
    return c.json({ error: "Please enter your password." }, 400);
  }
  const hash = await getUserPasswordHash(c.get("user").user_id);
  const ok = hash !== null && (await verifyPassword(password, hash));
  if (!ok) {
    return c.json({ error: "Incorrect password." }, 401);
  }
  return c.json({ success: true });
});

/** Key material lives only in browser memory; lock is a client-side act. */
vault.post("/lock", requireAuth, (c) => c.json({ success: true }));

/**
 * Server-side credential check used before sensitive vault operations
 * (rewrap/purge-style flows). Same contract role as unlock.
 */
vault.post("/verify-password", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const password = String((body as { password?: unknown }).password ?? "");
  if (!password) {
    return c.json({ error: "Please enter your password." }, 400);
  }
  const hash = await getUserPasswordHash(c.get("user").user_id);
  const ok = hash !== null && (await verifyPassword(password, hash));
  return c.json({ verified: ok }, ok ? 200 : 401);
});

/**
 * Initialize or re-wrap the vault key. Body carries ONLY wrapped material:
 *   { wrapped, kdf_salt, kdf_iters, recovery_wrapped? }
 * recovery_wrapped is the vault key re-wrapped by the CLIENT under a fresh
 * random recovery key whose plaintext stays in the browser; we seal that
 * blob under the server DEK at rest.
 */
vault.post("/rewrap", requireAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const wrapped = String((body as { wrapped?: unknown }).wrapped ?? "");
  const kdfSalt = String((body as { kdf_salt?: unknown }).kdf_salt ?? "");
  const kdfIters = Number((body as { kdf_iters?: unknown }).kdf_iters ?? 0);
  const recoveryWrapped =
    (body as { recovery_wrapped?: unknown }).recovery_wrapped === undefined
      ? undefined
      : String((body as { recovery_wrapped?: unknown }).recovery_wrapped ?? "");

  const fieldErrors: Record<string, string> = {};
  if (!wrapped) fieldErrors.wrapped = "Missing wrapped key.";
  if (!kdfSalt) fieldErrors.kdf_salt = "Missing KDF salt.";
  if (!Number.isInteger(kdfIters) || kdfIters < 1000 || kdfIters > 10_000_000) {
    fieldErrors.kdf_iters = "Iterations out of range.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(c.get("user").user_id, async (client) => {
      await upsertVaultWrap(client, {
        userId: c.get("user").user_id,
        wrapped,
        kdfSalt,
        kdfIters,
      });
      if (recoveryWrapped !== undefined) {
        await setRecoveryCopy(
          client,
          c.get("user").user_id,
          serverEncrypt(recoveryWrapped)
        );
      }
    });
  } catch (err) {
    console.error("[api] vault rewrap failed:", err);
    return c.json(
      { error: "Could not update the vault key. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

vault.get("/recovery-status", requireAuth, async (c) => {
  const info = await getVaultInfo(c.get("user").user_id);
  if (!info) return c.json({ error: "Not found" }, 404);
  return c.json({
    has_recovery: info.has_recovery,
    initialized: info.vault_wrapped !== null,
  });
});

// ---- Vault export/import backup (FR-11.x enhancement) ----

vault.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const notes = await loadVaultNotes(user.user_id);

  const manifest = {
    version: 1,
    exported_at: new Date().toISOString(),
    note_count: notes.length,
    format: "moneymind-vault-backup",
    encryption: "AES-256-GCM client-side",
  };

  return new Response(
    JSON.stringify({ manifest, notes }, null, 2),
    {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="vault-backup-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    }
  );
});

vault.post("/import", requireAuth, async (c) => {
  const user = c.get("user");
  const body = (await readJson(c)) as {
    notes?: unknown;
    manifest?: { format?: string };
  };

  if (
    !body.notes || !Array.isArray(body.notes) ||
    body.manifest?.format !== "moneymind-vault-backup"
  ) {
    return c.json({ error: "Invalid vault backup file." }, 400);
  }

  let imported = 0;
  try {
    await withUser(user.user_id, async (client) => {
      for (const note of body.notes as Record<string, unknown>[]) {
        if (
          typeof note.title !== "string" ||
          typeof note.data_encrypted !== "string" ||
          typeof note.data_iv !== "string"
        ) continue;
        await insertImportedNote(client, {
          userId: user.user_id,
          title: String(note.title ?? "Imported note").slice(0, 200),
          category: String(note.category ?? "personal"),
          templateCode: note.template_code ? String(note.template_code) : null,
          dataEncrypted: note.data_encrypted,
          dataIv: note.data_iv,
          isPinned: Number(note.is_pinned ?? 0),
        });
        imported += 1;
      }
    });
    return c.json({ success: true, imported });
  } catch (err) {
    console.error("[api] vault import failed:", err);
    return c.json({ error: "Could not import the backup. Please try again." }, 500);
  }
});

export { vault };
