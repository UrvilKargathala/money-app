import { Hono } from "hono";
import { query, withUser } from "../db";
import {
  getAccountById,
  getAccountsWithBalances,
  getAccountTypes,
  getBalanceHistory,
} from "../queries/accounts";
import { ACCOUNT_COLOR_PALETTE, ACCOUNT_TYPES } from "../constants";
import { parseAmount, parseBoolean } from "../validation";
import { readJson } from "./helpers";
import { requireAuth } from "../middleware";

const accounts = new Hono();

const RANGES: Record<string, { label: string; days: number | null }> = {
  "1M": { label: "1M", days: 30 },
  "3M": { label: "3M", days: 90 },
  "6M": { label: "6M", days: 182 },
  "1Y": { label: "1Y", days: 365 },
  "5Y": { label: "5Y", days: 1826 },
  All: { label: "All", days: null },
};

function csvEscape(value: string | number | null): string {
  const s = value == null ? "" : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

accounts.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const includeInactive = parseBoolean(c.req.query("includeInactive"));
  const [list, types] = await Promise.all([
    getAccountsWithBalances(user.user_id, includeInactive),
    getAccountTypes(),
  ]);
  return c.json({ accounts: list, types });
});

accounts.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const institution = String(body.institution ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;
  const color = String(body.color ?? "").trim() || null;
  const openingBalance =
    parseAmount(body.opening_balance != null ? String(body.opening_balance) : null) ?? 0;
  const creditLimit = parseAmount(
    body.credit_limit != null ? String(body.credit_limit) : null
  );

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Please enter an account name.";
  if (!(ACCOUNT_TYPES as readonly string[]).includes(type)) {
    fieldErrors.type = "Please choose an account type.";
  }
  if (openingBalance < 0) {
    fieldErrors.opening_balance = "Opening balance cannot be negative.";
  }
  if (type === "credit_card" && creditLimit != null && creditLimit <= 0) {
    fieldErrors.credit_limit = "Credit limit must be greater than zero.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  let assignedColor = color;
  if (!assignedColor) {
    const count = await query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM accounts WHERE user_id = $1`,
      [user.user_id]
    );
    assignedColor =
      ACCOUNT_COLOR_PALETTE[Number(count.rows[0]?.n ?? 0) % ACCOUNT_COLOR_PALETTE.length];
  }

  try {
    await withUser(user.user_id, (client) =>
      client.query(
        `INSERT INTO accounts
           (user_id, name, type, institution, opening_balance, credit_limit, color, notes,
            created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $1, $1)`,
        [
          user.user_id,
          name,
          type,
          institution,
          openingBalance,
          type === "credit_card" ? creditLimit : null,
          assignedColor,
          notes,
        ]
      )
    );
  } catch (err) {
    console.error("[api] create account failed:", err);
    return c.json(
      { error: "Could not create the account. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

accounts.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const accountId = c.req.param("id");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const institution = String(body.institution ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;
  const color = String(body.color ?? "").trim() || null;
  const creditLimit = parseAmount(
    body.credit_limit != null ? String(body.credit_limit) : null
  );
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name.length < 2) fieldErrors.name = "Please enter an account name.";
  if (type === "credit_card" && creditLimit != null && creditLimit <= 0) {
    fieldErrors.credit_limit = "Credit limit must be greater than zero.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const result = await withUser(user.user_id, (client) =>
      client.query(
        `UPDATE accounts
         SET name = $3, institution = $4, notes = $5, color = $6,
             credit_limit = $7, version = version + 1, updated_by = $1
         WHERE user_id = $1 AND id = $2 AND version = $8`,
        [
          user.user_id,
          accountId,
          name,
          institution,
          notes,
          color,
          type === "credit_card" ? creditLimit : null,
          version,
        ]
      )
    );
    if (result.rowCount === 0) {
      return c.json(
        { error: "This account was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    console.error("[api] update account failed:", err);
    return c.json(
      { error: "Could not update the account. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

accounts.post("/:id/deactivate", requireAuth, async (c) => {
  const user = c.get("user");
  const accountId = c.req.param("id");

  await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE accounts
       SET is_active = 0, deleted_at = CURRENT_TIMESTAMP, deleted_by = $1,
           version = version + 1, updated_by = $1
       WHERE user_id = $2 AND id = $3 AND deleted_at IS NULL`,
      [user.user_id, user.user_id, accountId]
    )
  );

  return c.json({ success: true });
});

accounts.post("/:id/reactivate", requireAuth, async (c) => {
  const user = c.get("user");
  const accountId = c.req.param("id");

  await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE accounts
       SET is_active = 1, deleted_at = NULL, deleted_by = NULL,
           version = version + 1, updated_by = $1
       WHERE user_id = $2 AND id = $3`,
      [user.user_id, user.user_id, accountId]
    )
  );

  return c.json({ success: true });
});

accounts.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const accountId = c.req.param("id");

  const counts = await query<{ txns: string; balance: string }>(
    `SELECT
       (SELECT COUNT(*) FROM transactions WHERE user_id = $1 AND account_id = $2)::text AS txns,
       COALESCE((SELECT SUM(CASE
         WHEN type = 'income' THEN amount
         WHEN type = 'expense' THEN -amount
         WHEN type = 'transfer' THEN
           CASE WHEN EXISTS (
             SELECT 1 FROM account_transfers tf
             WHERE tf.from_transaction_id = transactions.id
           ) THEN -amount ELSE amount END
         ELSE 0 END) FROM transactions WHERE user_id = $1 AND account_id = $2), 0)::text AS balance`,
    [user.user_id, accountId]
  );
  const txns = Number(counts.rows[0]?.txns ?? 0);
  const balance = Number(counts.rows[0]?.balance ?? 0);

  if (txns > 0 || balance !== 0) {
    return c.json(
      {
        error:
          "This account has transaction history or a non-zero balance, so it cannot be deleted. Deactivate it instead.",
      },
      409
    );
  }

  await withUser(user.user_id, (client) =>
    client.query(`DELETE FROM accounts WHERE user_id = $1 AND id = $2`, [
      user.user_id,
      accountId,
    ])
  );

  return c.json({ success: true });
});

accounts.get("/export", requireAuth, async (c) => {
  const user = c.get("user");

  const [list, types] = await Promise.all([
    getAccountsWithBalances(user.user_id, true),
    getAccountTypes(),
  ]);

  const typeName = new Map(types.map((t) => [t.type_code, t.display_name]));

  const header = [
    "Name",
    "Type",
    "Institution",
    "Balance",
    "Credit Limit",
    "Opening Balance",
    "Created Date",
    "Status",
  ];
  const rows = list.map((a) => [
    a.name,
    typeName.get(a.type) ?? a.type,
    a.institution,
    a.balance.toFixed(2),
    a.credit_limit != null ? a.credit_limit.toFixed(2) : "",
    a.opening_balance.toFixed(2),
    new Date(a.created_at).toISOString().slice(0, 10),
    a.is_active === 1 ? "Active" : "Deactivated",
  ]);

  const csv =
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="moneymind-accounts-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
});

accounts.get("/:id/history", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const range = c.req.query("range") ?? "6M";
  const spec = RANGES[range] ?? RANGES["6M"];

  const account = await getAccountById(user.user_id, id);
  if (!account) return c.json({ error: "Not found" }, 404);

  const to = new Date();
  const from = spec.days == null ? new Date(1970, 0, 1) : new Date(to);
  if (spec.days != null) from.setDate(to.getDate() - spec.days);

  const history = await getBalanceHistory(user.user_id, id, from, to);
  const points = history.map((h) => ({
    date: h.date.toISOString().slice(0, 10),
    balance: Number(h.balance),
  }));

  return c.json({ account: { name: account.name, type: account.type }, points });
});

export { accounts };