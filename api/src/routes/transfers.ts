import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { withUser } from "../db";
import { getTransfers } from "../queries/accounts";
import { createTransfer, getActiveAccountsByIds } from "../queries/transfers";
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
      const accounts = await getActiveAccountsByIds(client, user.user_id, [
        fromId,
        toId,
      ]);
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
    return c.json(
      { error: "Could not complete the transfer. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

export { transfers };
