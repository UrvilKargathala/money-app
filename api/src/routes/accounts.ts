import { Hono } from "hono";
import { withUser } from "../db";
import {
  countAccounts,
  deleteAccountById,
  deactivateAccount,
  getAccountById,
  getAccountTypes,
  getAccountUsageSummary,
  getAccountsWithBalances,
  getBalanceHistory,
  insertAccount,
  reactivateAccount,
  updateAccountDetails,
  getAccountSummaryTotals,
  getCreditUtilization,
} from "../queries/accounts";
import { createManualSnapshot } from "../queries/accounts";
import { ACCOUNT_COLOR_PALETTE, ACCOUNT_TYPES } from "../constants";
import { parseAmount, parseBoolean } from "../validation";
import { readJson } from "./helpers";
import { requireAuth } from "../middleware";
import { csvEscape } from "../utils/format";
import { checkCountLimit, isRowLocked } from "../queries/entitlements";

const accounts = new Hono();

const accountTypes = new Hono();

accountTypes.get("/", requireAuth, async (c) => {
  const types = await getAccountTypes();
  return c.json({ types });
});

const RANGES: Record<string, { label: string; days: number | null }> = {
  "1M": { label: "1M", days: 30 },
  "3M": { label: "3M", days: 90 },
  "6M": { label: "6M", days: 182 },
  "1Y": { label: "1Y", days: 365 },
  "5Y": { label: "5Y", days: 1826 },
  All: { label: "All", days: null },
};

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

  const limitHit = await checkCountLimit(user.user_id, "accounts");
  if (limitHit) {
    return c.json({ error: "plan_limit", feature: "accounts", plan: limitHit.plan, limit: limitHit.limit, used: limitHit.used }, 403);
  }

  let assignedColor = color;
  if (!assignedColor) {
    assignedColor =
      ACCOUNT_COLOR_PALETTE[(await countAccounts(user.user_id)) % ACCOUNT_COLOR_PALETTE.length];
  }

  try {
    await withUser(user.user_id, (client) =>
      insertAccount(client, {
        userId: user.user_id,
        name,
        type,
        institution,
        openingBalance,
        creditLimit: type === "credit_card" ? creditLimit : null,
        color: assignedColor,
        notes,
      })
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
  const lock = await isRowLocked(user.user_id, "accounts", accountId);
  if (lock.locked) return c.json({ error: "plan_locked", feature: "accounts", plan: lock.plan }, 403);
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
      updateAccountDetails(client, {
        userId: user.user_id,
        accountId,
        name,
        institution,
        notes,
        color,
        creditLimit: type === "credit_card" ? creditLimit : null,
        version,
      })
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
    deactivateAccount(client, user.user_id, accountId)
  );

  return c.json({ success: true });
});

accounts.post("/:id/reactivate", requireAuth, async (c) => {
  const user = c.get("user");
  const accountId = c.req.param("id");
  const limitHit = await checkCountLimit(user.user_id, "accounts");
  if (limitHit) return c.json({ error: "plan_limit", feature: "accounts", plan: limitHit.plan, limit: limitHit.limit, used: limitHit.used }, 403);

  await withUser(user.user_id, (client) =>
    reactivateAccount(client, user.user_id, accountId)
  );

  return c.json({ success: true });
});

accounts.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const accountId = c.req.param("id");

  const [usage, acct] = await Promise.all([
    getAccountUsageSummary(user.user_id, accountId),
    getAccountById(user.user_id, accountId),
  ]);
  const totalBalance = Number(acct?.opening_balance ?? 0) + usage.balance;
  if (usage.txns > 0 || Math.abs(totalBalance) > 0.01) {
    return c.json(
      {
        error:
          "This account has transaction history or a non-zero balance, so it cannot be deleted. Deactivate it instead.",
      },
      409
    );
  }

  await withUser(user.user_id, (client) =>
    deleteAccountById(client, user.user_id, accountId)
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

accounts.get("/summary", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ summary: await getAccountSummaryTotals(user.user_id) });
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

accounts.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const account = await getAccountById(user.user_id, id);
  if (!account) return c.json({ error: "Not found" }, 404);

  // Compute balance inline (opening + signed txns).
  const usage = await getAccountUsageSummary(user.user_id, id);
  return c.json({
    account: { ...account, balance: account.opening_balance + usage.balance },
    txn_count: usage.txns,
  });
});

accounts.get("/:id/balance", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await getAccountById(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  const usage = await getAccountUsageSummary(user.user_id, id);
  const detail = await getAccountById(user.user_id, id);
  return c.json({
    account_id: id,
    balance: Math.round((Number(detail?.opening_balance ?? 0) + usage.balance) * 100) / 100,
    txn_count: usage.txns,
  });
});

accounts.post("/:id/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const balance = Number(body.balance ?? NaN);
  const date = String(body.date ?? new Date().toISOString().slice(0, 10));
  if (!Number.isFinite(balance)) {
    return c.json({ fieldErrors: { balance: "Enter a valid balance." } }, 400);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }
  await withUser(user.user_id, (client) =>
    createManualSnapshot(client, { userId: user.user_id, accountId: id, balance, date })
  );
  return c.json({ success: true });
});

accounts.get("/:id/credit-utilization", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await getCreditUtilization(user.user_id, c.req.param("id"));
  if (!result) return c.json({ error: "Not found or not a credit card" }, 404);
  return c.json(result);
});

export { accounts, accountTypes };
