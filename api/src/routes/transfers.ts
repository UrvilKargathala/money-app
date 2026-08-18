import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { withUser } from "../db";
import { getTransfers } from "../queries/accounts";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { requireAuth } from "../middleware";

const transfers = new Hono();

transfers.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const list = await getTransfers(user.user_id);
  return c.json({ transfers: list });
});

transfers.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const fromId = String(body.from_account_id ?? "");
  const toId = String(body.to_account_id ?? "");
  const amount = parseAmount(body.amount != null ? String(body.amount) : null);
  const rawDate = String(body.date ?? "");
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!fromId) fieldErrors.from_account_id = "Choose the source account.";
  if (!toId) fieldErrors.to_account_id = "Choose the destination account.";
  if (fromId && toId && fromId === toId) {
    fieldErrors.to_account_id = "Source and destination must be different.";
  }
  if (amount == null || amount <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }
  if (!rawDate || Number.isNaN(Date.parse(rawDate))) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      const accounts = await client.query<{ id: string; is_active: number }>(
        `SELECT id, is_active FROM accounts
         WHERE user_id = $1 AND id = ANY($2::uuid[])`,
        [user.user_id, [fromId, toId]]
      );
      if (accounts.rowCount !== 2 || accounts.rows.some((a) => a.is_active !== 1)) {
        throw new Error("INVALID_ACCOUNTS");
      }

      const groupId = randomUUID();
      const date = rawDate;

      const fromTx = await client.query<{ id: string }>(
        `INSERT INTO transactions
           (user_id, account_id, type, amount, description, date, transfer_group_id,
            source, created_by, updated_by)
         VALUES ($1, $2, 'transfer', $3, $4, $5::date, $6, 'manual', $1, $1)
         RETURNING id`,
        [user.user_id, fromId, amount, `Transfer to ${toId.slice(0, 8)}`, date, groupId]
      );
      const toTx = await client.query<{ id: string }>(
        `INSERT INTO transactions
           (user_id, account_id, type, amount, description, date, transfer_group_id,
            source, created_by, updated_by)
         VALUES ($1, $2, 'transfer', $3, $4, $5::date, $6, 'manual', $1, $1)
         RETURNING id`,
        [user.user_id, toId, amount, `Transfer from ${fromId.slice(0, 8)}`, date, groupId]
      );

      await client.query(
        `INSERT INTO account_transfers
           (user_id, transfer_group_id, from_account_id, to_account_id,
            from_transaction_id, to_transaction_id, amount, date, notes, version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, 1)`,
        [
          user.user_id,
          groupId,
          fromId,
          toId,
          fromTx.rows[0].id,
          toTx.rows[0].id,
          amount,
          date,
          notes,
        ]
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNTS") {
      return c.json({ error: "One of the accounts is no longer active." }, 409);
    }
    console.error("[api] transfer failed:", err);
    return c.json(
      { error: "Could not complete the transfer. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

export { transfers };