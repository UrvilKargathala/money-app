import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import { sipFutureValue, type SipFrequency } from "../utils/finance";
import {
  INVESTMENT_CATEGORIES,
  INVESTMENT_TYPES,
  TXN_TYPES,
  bulkPriceUpdates,
  closeInvestment,
  createHoldingSnapshot,
  deleteHoldingTransaction,
  deleteInvestment,
  getAssetAllocation,
  getHoldingReturns,
  getInvestmentById,
  getMaturityAlerts,
  getPortfolioExportRows,
  getPortfolioSummary,
  getPortfolioXirr,
  insertHoldingTransaction,
  insertInvestment,
  listHoldingSnapshots,
  listHoldingTransactions,
  listInvestments,
  listPortfolioSnapshots,
  listPriceHistory,
  recordPriceUpdate,
  recomputeHoldingAggregates,
  updateHoldingTransaction,
  updateInvestmentFields,
  upsertPortfolioSnapshot,
} from "../queries/investments";
import type { InvestmentFilters } from "../queries/investments";
import { accountExists } from "../queries/references";
import { transactionExists } from "../queries/transactions";

const investments = new Hono();

const RANGES: Record<string, number | null> = {
  "1M": 30,
  "3M": 90,
  "6M": 182,
  "1Y": 365,
  "5Y": 1826,
  All: null,
};

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function csvResponse(header: string[], rows: (string | number)[][], filename: string) {
  const csv =
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  });
}

function parseListParam(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const items = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

investments.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const filters: InvestmentFilters = {
    search: c.req.query("search") || undefined,
    types: parseListParam(c.req.query("type")),
    categories: parseListParam(c.req.query("category")),
    status: (c.req.query("status") as InvestmentFilters["status"]) || undefined,
  };
  if (
    filters.status !== undefined &&
    !["active", "closed", "all"].includes(filters.status)
  ) {
    return c.json({ error: "Invalid status filter." }, 400);
  }
  return c.json({
    investments: await listInvestments(user.user_id, filters),
  });
});

investments.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const category = String(body.category ?? "") || "other";
  const purchaseDate = String(body.purchase_date ?? "");
  const maturityDate = String(body.maturity_date ?? "") || null;
  const accountId = String(body.account_id ?? "") || null;
  const notes = String(body.notes ?? "").trim() || null;

  // Unit-based pricing is optional; manual-mode holdings send the valuation
  // through buy_price/current_price with units = 1.
  const hasPricing =
    body.units !== undefined ||
    body.buy_price !== undefined ||
    body.current_price !== undefined;
  const units = hasPricing ? Number(body.units ?? 1) : 1;
  const buyPrice = hasPricing ? parseAmount(body.buy_price) : null;
  const currentPrice = hasPricing ? parseAmount(body.current_price) : null;

  const fieldErrors: Record<string, string> = {};
  if (!name) fieldErrors.name = "Please enter the investment name.";
  if (!(INVESTMENT_TYPES as readonly string[]).includes(type)) {
    fieldErrors.type = "Please choose a valid investment type.";
  }
  if (!(INVESTMENT_CATEGORIES as readonly string[]).includes(category)) {
    fieldErrors.category = "Please choose a valid asset class.";
  }
  if (!isValidDate(purchaseDate)) {
    fieldErrors.purchase_date = "Choose a valid purchase date.";
  }
  if (maturityDate !== null && !isValidDate(maturityDate)) {
    fieldErrors.maturity_date = "Choose a valid maturity date.";
  }
  if (accountId && !/^[0-9a-f-]{36}$/i.test(accountId)) {
    fieldErrors.account_id = "Please choose a valid account.";
  }
  if (
    hasPricing &&
    (!Number.isFinite(units) ||
      units <= 0 ||
      buyPrice === null ||
      buyPrice <= 0 ||
      currentPrice === null ||
      currentPrice <= 0)
  ) {
    fieldErrors.units =
      "Units, buy price and current price must all be greater than zero.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (accountId && !(await accountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      const holdingId = await insertInvestment(client, {
        userId: user.user_id,
        name,
        type,
        category,
        valuationMode: hasPricing ? "unit" : "manual",
        units,
        buyPrice,
        currentPrice,
        purchaseDate,
        maturityDate,
        accountId,
        notes,
      });
      // Seed the opening lot so XIRR and the purchase history work out of the box.
      if (buyPrice !== null) {
        await insertHoldingTransaction(client, {
          userId: user.user_id,
          investmentId: holdingId,
          type: "buy",
          units,
          pricePerUnit: buyPrice,
          totalAmount: Math.round(units * buyPrice * 100) / 100,
          date: purchaseDate,
          transactionId: null,
          notes: "Initial purchase",
        });
      }
      return holdingId;
    });
    return c.json({ success: true, investment: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] create investment failed:", err);
    return c.json(
      { error: "Could not save the investment. Please try again." },
      500
    );
  }
});

investments.get("/portfolio-summary", requireAuth, async (c) => {
  const user = c.get("user");
  const [summary, xirr] = [
    await getPortfolioSummary(user.user_id),
    await getPortfolioXirr(user.user_id),
  ];
  return c.json({ summary, xirr_pct: xirr });
});

investments.get("/asset-allocation", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ allocation: await getAssetAllocation(user.user_id) });
});

investments.get("/returns/portfolio", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ xirr_pct: await getPortfolioXirr(user.user_id) });
});

investments.get("/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const range = c.req.query("range") ?? "All";
  const days = RANGES[range] ?? null;
  let from: string | null = null;
  if (days !== null) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    from = isoDate(d);
  }
  return c.json({ snapshots: await listPortfolioSnapshots(user.user_id, from) });
});

investments.post("/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const date = String(body.date ?? isoDate(new Date()));
  if (!isValidDate(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }
  await withUser(user.user_id, (client) =>
    upsertPortfolioSnapshot(client, { userId: user.user_id, date })
  );
  return c.json({ success: true });
});

investments.get("/portfolio-trend", requireAuth, async (c) => {
  const user = c.get("user");
  const range = c.req.query("range") ?? "6M";
  const days = RANGES[range] ?? RANGES["6M"];
  let from: string | null = null;
  if (days !== null) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    from = isoDate(d);
  }
  const snapshots = await listPortfolioSnapshots(user.user_id, from);
  return c.json({
    range,
    trend: snapshots.map((s) => ({
      date: s.date,
      invested: s.total_invested,
      value: s.total_current,
    })),
  });
});

investments.get("/maturity-alerts", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ alerts: await getMaturityAlerts(user.user_id, 30) });
});

investments.post("/prices/bulk-update", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const rawUpdates = Array.isArray(body.updates) ? body.updates : [];
  if (rawUpdates.length === 0 || rawUpdates.length > 200) {
    return c.json(
      { error: "Provide between 1 and 200 price updates." },
      400
    );
  }

  const updates: { id: string; price: number }[] = [];
  const fieldErrors: Record<string, string> = {};
  rawUpdates.forEach((u: unknown, i: number) => {
    const entry = u as { id?: unknown; price?: unknown };
    const id = String(entry.id ?? "");
    const price = parseAmount(entry.price != null ? String(entry.price) : null);
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      fieldErrors[`updates.${i}.id`] = "Invalid holding id.";
    }
    if (price === null || price <= 0) {
      fieldErrors[`updates.${i}.price`] =
        "Price must be greater than zero.";
    }
    updates.push({ id, price: price as number });
  });
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const date = String(body.date ?? isoDate(new Date()));
  if (!isValidDate(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  const updated = await withUser(user.user_id, (client) =>
    bulkPriceUpdates(client, user.user_id, updates, date)
  );
  return c.json({ success: true, updated });
});

investments.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await getPortfolioExportRows(user.user_id);
  const header = [
    "Name", "Type", "Category", "Units", "Buy Price", "Current Price",
    "Invested", "Current Value", "Return %", "Status",
  ];
  const csvRows = rows.map((h) => [
    h.name,
    h.type,
    h.category,
    h.units === null ? "" : String(h.units),
    h.buy_price === null ? "" : h.buy_price.toFixed(4),
    h.current_price === null ? "" : h.current_price.toFixed(4),
    h.invested_value.toFixed(2),
    h.current_value.toFixed(2),
    h.return_pct === null ? "" : h.return_pct.toFixed(2),
    h.status,
  ]);
  return csvResponse(
    header,
    csvRows,
    `portfolio-${new Date().toISOString().slice(0, 10)}.csv`
  );
});

investments.post("/sip-calculator", requireAuth, async (c) => {
  const body = await readJson(c);
  const amount = parseAmount(body.amount);
  const frequency = String(body.frequency ?? "");
  const years = Number(body.years);
  const expectedReturnPct = Number(body.expected_return);

  const fieldErrors: Record<string, string> = {};
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Enter an installment amount greater than zero.";
  }
  if (frequency !== "monthly" && frequency !== "quarterly") {
    fieldErrors.frequency = "Frequency must be monthly or quarterly.";
  }
  if (!Number.isFinite(years) || years <= 0 || years > 40) {
    fieldErrors.years = "Years must be between 1 and 40.";
  }
  if (
    !Number.isFinite(expectedReturnPct) ||
    expectedReturnPct < -50 ||
    expectedReturnPct > 60
  ) {
    fieldErrors.expected_return =
      "Expected annual return must be between -50% and 60%.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  return c.json({
    projection: sipFutureValue({
      amount: amount as number,
      frequency: frequency as SipFrequency,
      years,
      expectedReturnPct,
    }),
  });
});

investments.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const holding = await getInvestmentById(user.user_id, id);
  if (!holding) return c.json({ error: "Not found" }, 404);
  const [transactions, snapshots] = [
    await listHoldingTransactions(user.user_id, id),
    await listHoldingSnapshots(user.user_id, id),
  ];
  return c.json({ investment: holding, transactions, snapshots });
});

investments.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const category = body.category === undefined ? undefined : String(body.category);
  const maturityDate =
    body.maturity_date === undefined ? undefined : String(body.maturity_date ?? "") || null;
  const accountId = body.account_id === undefined ? undefined : String(body.account_id ?? "") || null;
  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name !== undefined && !name) {
    fieldErrors.name = "Please enter the investment name.";
  }
  if (category !== undefined &&
      !(INVESTMENT_CATEGORIES as readonly string[]).includes(category)) {
    fieldErrors.category = "Please choose a valid asset class.";
  }
  if (maturityDate !== undefined && maturityDate !== null && !isValidDate(maturityDate)) {
    fieldErrors.maturity_date = "Choose a valid maturity date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const ok = await withUser(user.user_id, async (client) => {
      if (accountId !== undefined && accountId !== null &&
          !(await accountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      const result = await updateInvestmentFields(client, {
        userId: user.user_id,
        id,
        name: name ?? null,
        category: category ?? null,
        maturityDate: maturityDate ?? null,
        accountId: accountId ?? null,
        notes: notes ?? null,
        version,
      });
      return result.rowCount === 1;
    });
    if (!ok) {
      const existing = await getInvestmentById(user.user_id, id);
      return c.json(
        existing
          ? { error: "This investment was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        existing ? 409 : 404
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] update investment failed:", err);
    return c.json(
      { error: "Could not update the investment. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

investments.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Cascades to transactions/snapshots/prices/dividends/SIPs (FK ON DELETE CASCADE).
  const result = await withUser(user.user_id, (client) =>
    deleteInvestment(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

investments.post("/:id/close", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const closedDate = String(body.closed_date ?? isoDate(new Date()));
  if (!isValidDate(closedDate)) {
    return c.json({ fieldErrors: { closed_date: "Choose a valid date." } }, 400);
  }

  const result = await withUser(user.user_id, (client) =>
    closeInvestment(client, { userId: user.user_id, id, closedDate })
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

investments.post("/:id/price", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const price = parseAmount(body.price != null ? String(body.price) : null);
  const date = String(body.date ?? isoDate(new Date()));
  if (price === null || price <= 0) {
    return c.json({ fieldErrors: { price: "Price must be greater than zero." } }, 400);
  }
  if (!isValidDate(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      const holding = await getInvestmentById(user.user_id, id, client);
      if (!holding) throw new Error("NOT_FOUND");
      if (holding.is_active !== 1) throw new Error("CLOSED");
      await recordPriceUpdate(client, {
        userId: user.user_id,
        investmentId: id,
        price,
        date,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "CLOSED") {
      return c.json({ error: "Closed holdings can't be repriced." }, 409);
    }
    console.error("[api] price update failed:", err);
    return c.json({ error: "Could not update the price. Please try again." }, 500);
  }

  return c.json({ success: true });
});

investments.get("/:id/price-history", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await getInvestmentById(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    price_history: await listPriceHistory(user.user_id, id),
  });
});

investments.get("/:id/returns", requireAuth, async (c) => {
  const user = c.get("user");
  const returns = await getHoldingReturns(user.user_id, c.req.param("id"));
  if (!returns) return c.json({ error: "Not found" }, 404);
  return c.json({ returns });
});

investments.get("/:id/transactions", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await getInvestmentById(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({
    transactions: await listHoldingTransactions(user.user_id, id),
  });
});

investments.post("/:id/transactions", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const type = String(body.type ?? "");
  const units = Number(body.units);
  const pricePerUnit = parseAmount(body.price_per_unit);
  const date = String(body.date ?? isoDate(new Date()));
  const transactionId = String(body.transaction_id ?? "") || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!(TXN_TYPES as readonly string[]).includes(type)) {
    fieldErrors.type = "Type must be buy, sell or reinvestment.";
  }
  if (!Number.isFinite(units) || units <= 0) {
    fieldErrors.units = "Units must be greater than zero.";
  }
  if (pricePerUnit === null || pricePerUnit <= 0) {
    fieldErrors.price_per_unit = "Price per unit must be greater than zero.";
  }
  if (!isValidDate(date)) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (transactionId && !/^[0-9a-f-]{36}$/i.test(transactionId)) {
    fieldErrors.transaction_id = "Please choose a valid transaction.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  const validPrice = pricePerUnit as number;

  try {
    await withUser(user.user_id, async (client) => {
      if (!(await getInvestmentById(user.user_id, id, client))) {
        throw new Error("NOT_FOUND");
      }
      if (transactionId !== null &&
          !(await transactionExists(user.user_id, transactionId, client)).rowCount) {
        throw new Error("INVALID_TRANSACTION");
      }
      await insertHoldingTransaction(client, {
        userId: user.user_id,
        investmentId: id,
        type: type as "buy" | "sell" | "reinvestment",
        units,
        pricePerUnit: validPrice,
        totalAmount: Math.round(units * validPrice * 100) / 100,
        date,
        transactionId,
        notes,
      });
      await recomputeHoldingAggregates(client, user.user_id, id);
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "INVALID_TRANSACTION") {
      return c.json(
        { fieldErrors: { transaction_id: "This transaction doesn't exist." } },
        400
      );
    }
    console.error("[api] add holding transaction failed:", err);
    return c.json(
      { error: "Could not record the transaction. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

investments.patch("/:id/transactions/:txnId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const txnId = c.req.param("txnId");
  const body = await readJson(c);

  const type = String(body.type ?? "");
  const units = Number(body.units);
  const pricePerUnit = parseAmount(body.price_per_unit);
  const date = String(body.date ?? "");
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!(TXN_TYPES as readonly string[]).includes(type)) {
    fieldErrors.type = "Type must be buy, sell or reinvestment.";
  }
  if (!Number.isFinite(units) || units <= 0) {
    fieldErrors.units = "Units must be greater than zero.";
  }
  if (pricePerUnit === null || pricePerUnit <= 0) {
    fieldErrors.price_per_unit = "Price per unit must be greater than zero.";
  }
  if (!isValidDate(date)) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const result = await withUser(user.user_id, async (client) => {
      const updated = await updateHoldingTransaction(client, {
        userId: user.user_id,
        investmentId: id,
        txnId,
        type: type as "buy" | "sell" | "reinvestment",
        units,
        pricePerUnit: pricePerUnit as number,
        totalAmount: Math.round(units * (pricePerUnit as number) * 100) / 100,
        date,
        notes,
      });
      if (updated.rowCount !== 1) return false;
      await recomputeHoldingAggregates(client, user.user_id, id);
      return true;
    });
    if (!result) return c.json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[api] update holding transaction failed:", err);
    return c.json(
      { error: "Could not update the transaction. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

investments.delete("/:id/transactions/:txnId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const txnId = c.req.param("txnId");

  try {
    const ok = await withUser(user.user_id, async (client) => {
      const deleted = await deleteHoldingTransaction(client, user.user_id, id, txnId);
      if (deleted.rowCount !== 1) return false;
      await recomputeHoldingAggregates(client, user.user_id, id);
      return true;
    });
    if (!ok) return c.json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[api] delete holding transaction failed:", err);
    return c.json(
      { error: "Could not delete the transaction. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

investments.get("/:id/transactions/export", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const holding = await getInvestmentById(user.user_id, id);
  if (!holding) return c.json({ error: "Not found" }, 404);

  const txns = await listHoldingTransactions(user.user_id, id);
  return csvResponse(
    ["Date", "Type", "Units", "Price", "Amount"],
    [...txns].reverse().map((t) => [
      t.date,
      t.type,
      String(t.units),
      t.price_per_unit.toFixed(4),
      t.total_amount.toFixed(2),
    ]),
    `investment-${id.slice(0, 8)}-transactions.csv`
  );
});

investments.get("/:id/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!(await getInvestmentById(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ snapshots: await listHoldingSnapshots(user.user_id, id) });
});

investments.post("/:id/snapshots", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const date = String(body.date ?? isoDate(new Date()));
  if (!isValidDate(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      if (!(await getInvestmentById(user.user_id, id, client))) {
        throw new Error("NOT_FOUND");
      }
      await createHoldingSnapshot(client, {
        userId: user.user_id,
        investmentId: id,
        date,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    console.error("[api] holding snapshot failed:", err);
    return c.json(
      { error: "Could not record the snapshot. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

export { investments };
