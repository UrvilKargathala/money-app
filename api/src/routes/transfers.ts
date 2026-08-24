import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { withUser } from "../db";
import { getTransfers } from "../queries/accounts";
import {
  createTransfer,
  deleteTransferByGroupId,
  deleteTransferRecord,
  deleteTransferTransactions,
  getActiveAccountsByIds,
  getTransferLegs,
  updateTransferGroupNotes,
  updateTransferLeg,
} from "../queries/transfers";
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
  const transferAmount = amount as number;

  try {
    await withUser(user.user_id, async (client) => {
      const accounts = await getActiveAccountsByIds(client, user.user_id, [fromId, toId]);
      if (accounts.length !== 2 || accounts.some((a) => a.is_active !== 1)) {
        throw new Error("INVALID_ACCOUNTS");
      }
      await createTransfer(client, {
        userId: user.user_id,
        fromId,
        toId,
        amount: transferAmount,
        date: rawDate,
        notes,
        groupId: randomUUID(),
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNTS") {
      return c.json({ error: "One of the accounts is no longer active." }, 409);
    }
    console.error("[api] transfer failed:", err);
    return c.json({ error: "Could not complete the transfer. Please try again." }, 500);
  }

  return c.json({ success: true });
});

/** Read a single transfer by group_id. */
transfers.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const list = await getTransfers(user.user_id);
  const match = list.find((t) => t.transfer_group_id === id);
  if (!match) return c.json({ error: "Not found" }, 404);
  return c.json({ transfer: match });
});

/** Edit a transfer's notes/date. */
transfers.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");
  const body = await readJson(c);

  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;
  const date = body.date === undefined ? undefined : String(body.date ?? "");
  if (date !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  const result = await withUser(user.user_id, async (client) => {
    const legs = await getTransferLegs(client, user.user_id, groupId);
    if (legs.length === 0) return { notFound: true as const };

    for (const leg of legs) {
      await updateTransferLeg(client, {
        userId: user.user_id, legId: leg.id,
        notes: notes ?? null, date: date ?? null,
      });
    }
    if (notes !== undefined && notes !== null) {
      await updateTransferGroupNotes(client, {
        userId: user.user_id, groupId, notes,
      });
    }
    void date;
    return { ok: true as const };
  });

  if ("notFound" in result && result.notFound) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

/** Delete a transfer: removes both legs and the group record atomically. */
transfers.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const groupId = c.req.param("id");

  try {
    await withUser(user.user_id, async (client) => {
      const check = await deleteTransferByGroupId(client, user.user_id, groupId);
      if (check.rowCount !== 1) throw new Error("NOT_FOUND");

      await deleteTransferTransactions(client, user.user_id, groupId);
      await deleteTransferRecord(client, user.user_id, groupId);
    });
    return c.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    console.error("[api] delete transfer failed:", err);
    return c.json({ error: "Could not delete the transfer. Please try again." }, 500);
  }
});

export { transfers };
