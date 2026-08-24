import { query } from "../db";
import type { Queryable } from "./notes";

const DB: Queryable = { query: query };

export type VaultKeyInfo = {
  vault_wrapped: string | null;
  vault_kdf_salt: string | null;
  vault_kdf_iters: number | null;
  has_recovery: boolean;
};

export async function getVaultInfo(
  userId: number,
  q: Queryable = DB
): Promise<VaultKeyInfo | null> {
  const result = await q.query<{
    vault_wrapped: string | null;
    vault_kdf_salt: string | null;
    vault_kdf_iters: number | null;
    vault_recovery_wrapped: string | null;
  }>(
    `SELECT vault_wrapped, vault_kdf_salt, vault_kdf_iters, vault_recovery_wrapped
     FROM user_settings WHERE user_id = $1`,
    [userId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    vault_wrapped: row.vault_wrapped,
    vault_kdf_salt: row.vault_kdf_salt,
    vault_kdf_iters: row.vault_kdf_iters,
    has_recovery: row.vault_recovery_wrapped !== null,
  };
}

/**
 * Upserts the client-wrapped vault key + KDF params. First call initializes
 * the vault; later calls are rewraps (password change/reset flow).
 */
export async function upsertVaultWrap(
  q: Queryable,
  params: {
    userId: number;
    wrapped: string;
    kdfSalt: string;
    kdfIters: number;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO user_settings
       (user_id, vault_wrapped, vault_kdf_salt, vault_kdf_iters)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE SET
       vault_wrapped = EXCLUDED.vault_wrapped,
       vault_kdf_salt = EXCLUDED.vault_kdf_salt,
       vault_kdf_iters = EXCLUDED.vault_kdf_iters,
       updated_at = CURRENT_TIMESTAMP`,
    [params.userId, params.wrapped, params.kdfSalt, params.kdfIters]
  );
}

/** Stores (or replaces) the recovery copy encrypted under the server DEK. */
export function setRecoveryCopy(
  q: Queryable,
  userId: number,
  serverEncrypted: string
) {
  return q.query(
    `UPDATE user_settings SET vault_recovery_wrapped = $2, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1`,
    [userId, serverEncrypted]
  );
}

export async function getUserPasswordHash(
  userId: number,
  q: Queryable = DB
): Promise<string | null> {
  const result = await q.query<{ hashed_password: string | null }>(
    `SELECT hashed_password FROM users WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows[0]?.hashed_password ?? null;
}

// ---- Vault export/import backup ----

export type VaultExportNote = {
  id: string;
  title: string;
  category: string;
  template_code: string | null;
  data_encrypted: string;
  data_iv: string;
  is_pinned: number;
};

export async function loadVaultNotes(
  userId: number,
  q: Queryable = DB
): Promise<VaultExportNote[]> {
  const result = await q.query<VaultExportNote>(
    `SELECT id, title, category, template_code, data_encrypted, data_iv,
            is_pinned
     FROM secure_notes WHERE user_id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return result.rows;
}

export async function insertImportedNote(
  q: Queryable,
  params: {
    userId: number;
    title: string;
    category: string;
    templateCode: string | null;
    dataEncrypted: string;
    dataIv: string;
    isPinned: number;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO secure_notes
       (user_id, title, category, template_code, data_encrypted,
        data_iv, is_pinned, created_by, updated_by)
     VALUES ($1, $2, $3::text, $4::text, $5::text, $6::text, $7, $1, $1)`,
    [
      params.userId, params.title, params.category, params.templateCode,
      params.dataEncrypted, params.dataIv, params.isPinned,
    ]
  );
}
