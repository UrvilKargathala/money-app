import { query } from "../db";
import { isoDate } from "../utils/format";
import { cagr, round2, xirr } from "../utils/finance";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export const INVESTMENT_TYPES = [
  "mutual_fund",
  "stock",
  "fd",
  "ppf",
  "nps",
  "gold",
  "crypto",
  "other",
] as const;

export const INVESTMENT_CATEGORIES = [
  "equity",
  "debt",
  "hybrid",
  "gold",
  "cash_equiv",
  "crypto",
  "government",
  "other",
] as const;

export const TXN_TYPES = ["buy", "sell", "reinvestment"] as const;

export const DIVIDEND_TYPES = ["dividend", "interest", "maturity_proceeds"] as const;

export type InvestmentFilters = {
  search?: string;
  types?: string[];
  categories?: string[];
  status?: "active" | "closed" | "all";
};

export type InvestmentRowRaw = {
  id: string;
  user_id: number;
  name: string;
  type: string;
  category: string;
  valuation_mode: "unit" | "manual";
  units: string;
  buy_price: string;
  current_price: string;
  invested_value: string;
  current_value: string;
  purchase_date: string;
  maturity_date: string | null;
  account_id: string | null;
  account_name: string | null;
  is_active: number;
  notes: string | null;
  closed_date: string | null;
  version: number;
};

/** Tenant clause baked in; compositions may only append AND conditions. */
const INVESTMENT_SELECT = `
  SELECT i.id, i.user_id, i.name, i.type, i.category, i.valuation_mode,
         i.units::text AS units, i.buy_price::text AS buy_price,
         i.current_price::text AS current_price,
         i.invested_value::text AS invested_value,
         i.current_value::text AS current_value,
         i.purchase_date::text AS purchase_date,
         i.maturity_date::text AS maturity_date,
         i.account_id, a.name AS account_name,
         i.is_active, i.notes, i.closed_date::text AS closed_date, i.version
  FROM investments i
  LEFT JOIN accounts a ON a.id = i.account_id
  WHERE i.user_id = $1
`;

export type Investment = Omit<
  InvestmentRowRaw,
  "units" | "buy_price" | "current_price" | "invested_value" | "current_value"
> & {
  units: number;
  buy_price: number;
  current_price: number;
  invested_value: number;
  current_value: number;
  absolute_return: number;
  return_pct: number | null;
};

function mapInvestment(row: InvestmentRowRaw): Investment {
  const invested = Number(row.invested_value);
  const current = Number(row.current_value);
  return {
    ...row,
    units: Number(row.units),
    buy_price: Number(row.buy_price),
    current_price: Number(row.current_price),
    invested_value: round2(invested),
    current_value: round2(current),
    absolute_return: round2(current - invested),
    return_pct:
      invested > 0 ? round2(((current - invested) / invested) * 100) : null,
  };
}

export async function listInvestments(
  userId: number,
  filters: InvestmentFilters = {},
  q: Queryable = DB
): Promise<Investment[]> {
  let sql = INVESTMENT_SELECT;
  const params: unknown[] = [userId];
  if (filters.search && filters.search.trim()) {
    params.push(`%${filters.search.trim()}%`);
    sql += ` AND (i.name ILIKE $${params.length} OR i.notes ILIKE $${params.length})`;
  }
  if (filters.types && filters.types.length > 0) {
    params.push(filters.types);
    sql += ` AND i.type = ANY($${params.length}::text[])`;
  }
  if (filters.categories && filters.categories.length > 0) {
    params.push(filters.categories);
    sql += ` AND i.category = ANY($${params.length}::text[])`;
  }
  if (filters.status === undefined || filters.status === "active") {
    sql += ` AND i.is_active = 1`;
  } else if (filters.status === "closed") {
    sql += ` AND i.is_active = 0`;
  }
  sql += ` ORDER BY i.is_active DESC, i.name`;
  const result = await q.query<InvestmentRowRaw>(sql, params);
  return result.rows.map(mapInvestment);
}

export async function getInvestmentById(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<Investment | null> {
  const result = await q.query<InvestmentRowRaw>(
    `${INVESTMENT_SELECT} AND i.id = $2`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapInvestment(result.rows[0]) : null;
}

export async function insertInvestment(
  q: Queryable,
  params: {
    userId: number;
    name: string;
    type: string;
    category: string;
    valuationMode: "unit" | "manual";
    units: number | null;
    buyPrice: number | null;
    currentPrice: number | null;
    purchaseDate: string;
    maturityDate: string | null;
    accountId: string | null;
    notes: string | null;
  }
): Promise<string> {
  // invested_value / current_value are GENERATED ALWAYS — never written.
  const result = await q.query<{ id: string }>(
    `INSERT INTO investments
       (user_id, name, type, category, valuation_mode, units, buy_price,
        current_price, purchase_date, maturity_date, account_id, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11::uuid, $12)
     RETURNING id`,
    [
      params.userId, params.name, params.type, params.category,
      params.valuationMode, params.units, params.buyPrice, params.currentPrice,
      params.purchaseDate, params.maturityDate, params.accountId, params.notes,
    ]
  );
  return result.rows[0].id;
}

/** Partial update with optimistic-lock version check. Generated columns are never writable. */
export function updateInvestmentFields(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    name: string | null;
    category: string | null;
    maturityDate: string | null;
    accountId: string | null;
    notes: string | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE investments SET
       name = COALESCE($3, name),
       category = COALESCE($4, category),
       maturity_date = COALESCE($5::date, maturity_date),
       account_id = COALESCE($6::uuid, account_id),
       notes = COALESCE($7, notes),
       version = version + 1
     WHERE user_id = $1 AND id = $2 AND version = $8
     RETURNING id`,
    [
      params.userId, params.id, params.name, params.category,
      params.maturityDate, params.accountId, params.notes, params.version,
    ]
  );
}

export function closeInvestment(
  q: Queryable,
  params: { userId: number; id: string; closedDate: string }
) {
  return q.query<{ id: string }>(
    `UPDATE investments
     SET is_active = 0, closed_date = $3::date, version = version + 1
     WHERE user_id = $1 AND id = $2 AND is_active = 1
     RETURNING id`,
    [params.userId, params.id, params.closedDate]
  );
}

export function reopenInvestment(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE investments
     SET is_active = 1, closed_date = NULL, version = version + 1
     WHERE user_id = $1 AND id = $2 AND is_active = 0
     RETURNING id`,
    [userId, id]
  );
}

export function deleteInvestment(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM investments WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id]
  );
}

export async function investmentRowExists(
  q: Queryable,
  userId: number,
  id: string
): Promise<boolean> {
  const result = await q.query<{ id: string }>(
    `SELECT id FROM investments WHERE user_id = $1 AND id = $2`,
    [userId, id]
  );
  return result.rowCount === 1;
}

export type PortfolioSummary = {
  total_invested: number;
  total_current: number;
  absolute_return: number;
  return_pct: number | null;
  active_count: number;
  profit_count: number;
  loss_count: number;
};

export async function getPortfolioSummary(
  userId: number,
  q: Queryable = DB
): Promise<PortfolioSummary> {
  const result = await q.query<{
    invested: string;
    current: string;
    count: string;
    profit: string;
    loss: string;
  }>(
    `SELECT
       COALESCE(SUM(i.invested_value), 0)::text AS invested,
       COALESCE(SUM(i.current_value), 0)::text AS current,
       COUNT(*)::text AS count,
       COUNT(*) FILTER (WHERE i.current_value > i.invested_value)::text AS profit,
       COUNT(*) FILTER (WHERE i.current_value < i.invested_value)::text AS loss
     FROM investments i
     WHERE i.user_id = $1 AND i.is_active = 1`,
    [userId]
  );
  const row = result.rows[0];
  const invested = Number(row?.invested ?? 0);
  const current = Number(row?.current ?? 0);
  return {
    total_invested: round2(invested),
    total_current: round2(current),
    absolute_return: round2(current - invested),
    return_pct:
      invested > 0 ? round2(((current - invested) / invested) * 100) : null,
    active_count: Number(row?.count ?? 0),
    profit_count: Number(row?.profit ?? 0),
    loss_count: Number(row?.loss ?? 0),
  };
}

export type AllocationSlice = {
  category: string;
  value: number;
  pct: number;
};

export async function getAssetAllocation(
  userId: number,
  q: Queryable = DB
): Promise<AllocationSlice[]> {
  const result = await q.query<{ category: string; value: string }>(
    `SELECT COALESCE(NULLIF(i.category, ''), 'other') AS category,
            SUM(i.current_value)::text AS value
     FROM investments i
     WHERE i.user_id = $1 AND i.is_active = 1 AND i.current_value IS NOT NULL
     GROUP BY 1
     ORDER BY SUM(i.current_value) DESC`,
    [userId]
  );
  const total = result.rows.reduce((sum, r) => sum + Number(r.value), 0);
  return result.rows.map((r) => ({
    category: r.category,
    value: round2(Number(r.value)),
    pct: total > 0 ? round2((Number(r.value) / total) * 100) : 0,
  }));
}

export type MaturityAlert = {
  id: string;
  name: string;
  type: string;
  maturity_date: string;
  days_until: number;
};

export async function getMaturityAlerts(
  userId: number,
  windowDays: number,
  q: Queryable = DB
): Promise<MaturityAlert[]> {
  const result = await q.query<{
    id: string;
    name: string;
    type: string;
    maturity_date: Date;
  }>(
    `SELECT id, name, type, maturity_date
     FROM investments
     WHERE user_id = $1 AND is_active = 1
       AND maturity_date IS NOT NULL
       AND maturity_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
     ORDER BY maturity_date`,
    [userId, windowDays]
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
    maturity_date: isoDate(row.maturity_date),
    days_until: Math.round(
      (new Date(`${isoDate(row.maturity_date)}T00:00:00`).getTime() -
        today.getTime()) /
        86_400_000
    ),
  }));
}

export type HoldingTxnRowRaw = {
  id: string;
  investment_id: string;
  type: "buy" | "sell" | "reinvestment";
  units: string;
  price_per_unit: string;
  total_amount: string;
  date: string;
  transaction_id: string | null;
  notes: string | null;
};

export type HoldingTxn = Omit<
  HoldingTxnRowRaw,
  "units" | "price_per_unit" | "total_amount"
> & {
  units: number;
  price_per_unit: number;
  total_amount: number;
};

function mapHoldingTxn(row: HoldingTxnRowRaw): HoldingTxn {
  return {
    ...row,
    units: Number(row.units),
    price_per_unit: Number(row.price_per_unit),
    total_amount: Number(row.total_amount),
  };
}

export async function listHoldingTransactions(
  userId: number,
  investmentId: string,
  q: Queryable = DB
): Promise<HoldingTxn[]> {
  const result = await q.query<HoldingTxnRowRaw>(
    `SELECT id, investment_id, type, units::text AS units,
            price_per_unit::text AS price_per_unit,
            total_amount::text AS total_amount,
            date::text AS date, transaction_id, notes
     FROM investment_transactions
     WHERE user_id = $1 AND investment_id = $2
     ORDER BY date DESC, id DESC`,
    [userId, investmentId]
  );
  return result.rows.map(mapHoldingTxn);
}

export async function insertHoldingTransaction(
  q: Queryable,
  params: {
    userId: number;
    investmentId: string;
    type: "buy" | "sell" | "reinvestment";
    units: number;
    pricePerUnit: number;
    totalAmount: number;
    date: string;
    transactionId: string | null;
    notes: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO investment_transactions
       (user_id, investment_id, type, units, price_per_unit, total_amount,
        date, transaction_id, notes)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::date, $8::uuid, $9)
     RETURNING id`,
    [
      params.userId, params.investmentId, params.type, params.units,
      params.pricePerUnit, params.totalAmount, params.date,
      params.transactionId, params.notes,
    ]
  );
  return result.rows[0].id;
}

export function updateHoldingTransaction(
  q: Queryable,
  params: {
    userId: number;
    investmentId: string;
    txnId: string;
    type: "buy" | "sell" | "reinvestment";
    units: number;
    pricePerUnit: number;
    totalAmount: number;
    date: string;
    notes: string | null;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE investment_transactions SET
       type = $4, units = $5, price_per_unit = $6, total_amount = $7,
       date = $8::date, notes = $9
     WHERE user_id = $1 AND investment_id = $2 AND id = $3`,
    [
      params.userId, params.investmentId, params.txnId, params.type,
      params.units, params.pricePerUnit, params.totalAmount, params.date,
      params.notes,
    ]
  );
}

export function deleteHoldingTransaction(
  q: Queryable,
  userId: number,
  investmentId: string,
  txnId: string
) {
  return q.query<{ id: string }>(
    `DELETE FROM investment_transactions
     WHERE user_id = $1 AND investment_id = $2 AND id = $3`,
    [userId, investmentId, txnId]
  );
}

/**
 * Re-derives the holding's units and average cost from its full transaction
 * history (single SELECT + pure arithmetic + one UPDATE — never a query loop).
 * Generated columns invested/current value follow automatically.
 */
export async function recomputeHoldingAggregates(
  q: Queryable,
  userId: number,
  investmentId: string
): Promise<void> {
  const result = await q.query<{
    type: string;
    units: string;
    price_per_unit: string;
  }>(
    `SELECT type, units::text AS units, price_per_unit::text AS price_per_unit
     FROM investment_transactions
     WHERE user_id = $1 AND investment_id = $2
     ORDER BY date ASC, id ASC`,
    [userId, investmentId]
  );

  let units = 0;
  let avgPrice = 0;
  for (const row of result.rows) {
    const qty = Number(row.units);
    const price = Number(row.price_per_unit);
    if (row.type === "sell") {
      units = Math.max(0, units - qty);
    } else {
      const nextUnits = units + qty;
      avgPrice =
        nextUnits > 0 ? (units * avgPrice + qty * price) / nextUnits : 0;
      units = nextUnits;
    }
  }

  await q.query(
    `UPDATE investments
     SET units = $3, buy_price = $4, version = version + 1
     WHERE user_id = $1 AND id = $2`,
    [userId, investmentId, round2(units), round2(avgPrice)]
  );
}

export async function getInvestmentPrice(
  q: Queryable,
  userId: number,
  investmentId: string
): Promise<string | null> {
  const result = await q.query<{ current_price: string }>(
    `SELECT current_price::text AS current_price
     FROM investments WHERE user_id = $1 AND id = $2`,
    [userId, investmentId]
  );
  return result.rows[0]?.current_price ?? null;
}

/** One price point: append to history + update the holding + refresh portfolio snapshot. */
export async function recordPriceUpdate(
  q: Queryable,
  params: {
    userId: number;
    investmentId: string;
    price: number;
    date: string;
  }
): Promise<void> {
  await q.query(
    `INSERT INTO investment_price_history (user_id, investment_id, price, date)
     VALUES ($1, $2::uuid, $3, $4::date)`,
    [params.userId, params.investmentId, params.price, params.date]
  );
  await q.query(
    `UPDATE investments
     SET current_price = $3, version = version + 1
     WHERE user_id = $1 AND id = $2`,
    [params.userId, params.investmentId, params.price]
  );
  await upsertPortfolioSnapshot(q, {
    userId: params.userId,
    date: params.date,
  });
}

/**
 * Bulk price update: one SELECT for prior prices + multi-row history INSERT +
 * single UPDATE ... FROM unnest. Zero per-row queries regardless of batch size.
 */
export async function bulkPriceUpdates(
  q: Queryable,
  userId: number,
  updates: { id: string; price: number }[],
  date: string
): Promise<number> {
  if (updates.length === 0) return 0;
  const ids = updates.map((u) => u.id);

  const existing = await q.query<{ id: string; is_active: number }>(
    `SELECT id, is_active FROM investments
     WHERE user_id = $1 AND id = ANY($2::uuid[])`,
    [userId, ids]
  );
  const known = new Set(existing.rows.map((r) => r.id));
  const applied = updates.filter((u) => known.has(u.id));
  if (applied.length === 0) return 0;

  await q.query(
    `INSERT INTO investment_price_history (user_id, investment_id, price, date)
     SELECT $1, x.id, x.price, $3::date
     FROM unnest($2::uuid[], $4::numeric(12,4)[]) AS x(id, price)
     JOIN investments i ON i.user_id = $1 AND i.id = x.id`,
    [
      userId,
      applied.map((u) => u.id),
      date,
      applied.map((u) => u.price),
    ]
  );

  await q.query(
    `UPDATE investments i
     SET current_price = x.price, version = version + 1
     FROM unnest($2::uuid[], $3::numeric(12,4)[]) AS x(id, price)
     WHERE i.user_id = $1 AND i.id = x.id`,
    [userId, applied.map((u) => u.id), applied.map((u) => u.price)]
  );

  await upsertPortfolioSnapshot(q, { userId, date });
  return applied.length;
}

export type PricePoint = { price: number; date: string };

export async function listPriceHistory(
  userId: number,
  investmentId: string,
  q: Queryable = DB
): Promise<PricePoint[]> {
  const result = await q.query<{ price: string; date: Date }>(
    `SELECT price::text AS price, date
     FROM investment_price_history
     WHERE user_id = $1 AND investment_id = $2
     ORDER BY date ASC, id ASC`,
    [userId, investmentId]
  );
  return result.rows.map((row) => ({
    price: Number(row.price),
    date: isoDate(row.date),
  }));
}

/** Recomputes today's portfolio totals into portfolio_snapshots (upsert on user+date). */
export async function upsertPortfolioSnapshot(
  q: Queryable,
  params: { userId: number; date: string }
): Promise<void> {
  await q.query(
    `INSERT INTO portfolio_snapshots (user_id, date, total_invested, total_current)
     SELECT $1, $2::date,
            COALESCE(SUM(i.invested_value), 0)::numeric(12,2),
            COALESCE(SUM(i.current_value), 0)::numeric(12,2)
     FROM investments i
     WHERE i.user_id = $1 AND i.is_active = 1
     ON CONFLICT (user_id, date)
     DO UPDATE SET total_invested = EXCLUDED.total_invested,
                   total_current = EXCLUDED.total_current`,
    [params.userId, params.date]
  );
}

export type HoldingSnapshotRow = {
  id: string;
  investment_id: string;
  invested_value: number;
  current_value: number;
  date: string;
};

export async function listHoldingSnapshots(
  userId: number,
  investmentId: string,
  q: Queryable = DB
): Promise<HoldingSnapshotRow[]> {
  const result = await q.query<{
    id: string;
    investment_id: string;
    invested_value: string;
    current_value: string;
    date: Date;
  }>(
    `SELECT id, investment_id, invested_value::text AS invested_value,
            current_value::text AS current_value, date
     FROM investment_snapshots
     WHERE user_id = $1 AND investment_id = $2
     ORDER BY date ASC`,
    [userId, investmentId]
  );
  return result.rows.map((row) => ({
    id: row.id,
    investment_id: row.investment_id,
    invested_value: Number(row.invested_value),
    current_value: Number(row.current_value),
    date: isoDate(row.date),
  }));
}

export async function createHoldingSnapshot(
  q: Queryable,
  params: { userId: number; investmentId: string; date: string }
): Promise<void> {
  await q.query(
    `INSERT INTO investment_snapshots
       (user_id, investment_id, invested_value, current_value, date)
     SELECT $1, $2::uuid, invested_value, current_value, $3::date
     FROM investments
     WHERE user_id = $1 AND id = $2::uuid
     ON CONFLICT DO NOTHING`,
    [params.userId, params.investmentId, params.date]
  );
}

export type PortfolioSnapshotRow = {
  date: string;
  total_invested: number;
  total_current: number;
};

export async function listPortfolioSnapshots(
  userId: number,
  fromDate: string | null,
  q: Queryable = DB
): Promise<PortfolioSnapshotRow[]> {
  const result = await q.query<{
    date: Date;
    total_invested: string;
    total_current: string;
  }>(
    `SELECT date, total_invested::text AS total_invested,
            total_current::text AS total_current
     FROM portfolio_snapshots
     WHERE user_id = $1 AND ($2::date IS NULL OR date >= $2::date)
     ORDER BY date ASC`,
    [userId, fromDate]
  );
  return result.rows.map((row) => ({
    date: isoDate(row.date),
    total_invested: Number(row.total_invested),
    total_current: Number(row.total_current),
  }));
}

export type HoldingReturns = {
  xirr_pct: number | null;
  cagr_pct: number | null;
  method: "xirr" | "cagr";
};

/** XIRR over holding cash flows; CAGR fallback for single-flow holdings. */
export async function getHoldingReturns(
  userId: number,
  investmentId: string,
  q: Queryable = DB
): Promise<HoldingReturns | null> {
  const holding = await getInvestmentById(userId, investmentId, q);
  if (!holding) return null;

  const txns = await q.query<{ type: string; total_amount: string; date: string }>(
    `SELECT type, total_amount::text AS total_amount, date::text AS date
     FROM investment_transactions
     WHERE user_id = $1 AND investment_id = $2
     ORDER BY date ASC`,
    [userId, investmentId]
  );

  const flows = txns.rows.map((row) => ({
    date: row.date,
    amount:
      row.type === "sell"
        ? Number(row.total_amount)
        : -Number(row.total_amount),
  }));
  flows.push({ date: new Date().toISOString().slice(0, 10), amount: holding.current_value });

  const rate = xirr(flows);
  if (rate !== null) {
    return { xirr_pct: round2(rate * 100), cagr_pct: null, method: "xirr" };
  }
  const growth = cagr(holding.invested_value, holding.current_value, holding.purchase_date);
  return { xirr_pct: null, cagr_pct: growth === null ? null : round2(growth * 100), method: "cagr" };
}

export async function getPortfolioXirr(
  userId: number,
  q: Queryable = DB
): Promise<number | null> {
  const txns = await q.query<{ total_amount: string; date: string; type: string }>(
    `SELECT it.total_amount::text AS total_amount, it.date::text AS date, it.type
     FROM investment_transactions it
     JOIN investments i ON i.id = it.investment_id AND i.user_id = it.user_id
     WHERE it.user_id = $1 AND i.is_active = 1
     ORDER BY it.date ASC`,
    [userId]
  );
  const summary = await getPortfolioSummary(userId, q);

  const flows = txns.rows.map((row) => ({
    date: row.date,
    amount:
      row.type === "sell" ? Number(row.total_amount) : -Number(row.total_amount),
  }));
  flows.push({
    date: new Date().toISOString().slice(0, 10),
    amount: summary.total_current,
  });

  const rate = xirr(flows);
  return rate === null ? null : round2(rate * 100);
}

export type PortfolioExportRow = {
  name: string;
  type: string;
  category: string;
  units: number | null;
  buy_price: number | null;
  current_price: number | null;
  invested_value: number;
  current_value: number;
  return_pct: number | null;
  status: "active" | "closed";
};

export async function getPortfolioExportRows(
  userId: number,
  q: Queryable = DB
): Promise<PortfolioExportRow[]> {
  const list = await listInvestments(userId, { status: "all" }, q);
  return list.map((h) => ({
    name: h.name,
    type: h.type,
    category: h.category,
    units: h.valuation_mode === "unit" ? h.units : null,
    buy_price: h.valuation_mode === "unit" ? h.buy_price : null,
    current_price: h.valuation_mode === "unit" ? h.current_price : null,
    invested_value: h.invested_value,
    current_value: h.current_value,
    return_pct: h.return_pct,
    status: h.is_active === 1 ? "active" : "closed",
  }));
}

export type DividendRowRaw = {
  id: string;
  investment_id: string;
  investment_name: string;
  type: "dividend" | "interest" | "maturity_proceeds";
  amount: string;
  date: Date;
  transaction_id: string | null;
  notes: string | null;
};

export type Dividend = Omit<DividendRowRaw, "amount" | "date"> & {
  amount: number;
  date: string;
};

function mapDividend(row: DividendRowRaw): Dividend {
  return { ...row, amount: Number(row.amount), date: isoDate(row.date) };
}

export async function listDividends(
  userId: number,
  investmentId: string | null,
  q: Queryable = DB
): Promise<Dividend[]> {
  const result = await q.query<DividendRowRaw>(
    `SELECT d.id, d.investment_id, i.name AS investment_name, d.type,
            d.amount::text AS amount, d.date, d.transaction_id, d.notes
     FROM dividend_income d
     JOIN investments i ON i.id = d.investment_id
     WHERE d.user_id = $1 AND ($2::uuid IS NULL OR d.investment_id = $2::uuid)
     ORDER BY d.date DESC`,
    [userId, investmentId]
  );
  return result.rows.map(mapDividend);
}

export async function getDividendById(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<Dividend | null> {
  const result = await q.query<DividendRowRaw>(
    `SELECT d.id, d.investment_id, i.name AS investment_name, d.type,
            d.amount::text AS amount, d.date, d.transaction_id, d.notes
     FROM dividend_income d
     JOIN investments i ON i.id = d.investment_id
     WHERE d.user_id = $1 AND d.id = $2`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapDividend(result.rows[0]) : null;
}

export async function insertDividend(
  q: Queryable,
  params: {
    userId: number;
    investmentId: string;
    type: "dividend" | "interest" | "maturity_proceeds";
    amount: number;
    date: string;
    transactionId: string | null;
    notes: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO dividend_income
       (user_id, investment_id, type, amount, date, transaction_id, notes)
     VALUES ($1, $2::uuid, $3, $4, $5::date, $6::uuid, $7)
     RETURNING id`,
    [
      params.userId, params.investmentId, params.type, params.amount,
      params.date, params.transactionId, params.notes,
    ]
  );
  return result.rows[0].id;
}

export function updateDividend(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    type: "dividend" | "interest" | "maturity_proceeds";
    amount: number;
    date: string;
    notes: string | null;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE dividend_income SET type = $3, amount = $4, date = $5::date, notes = $6
     WHERE user_id = $1 AND id = $2
     RETURNING id`,
    [params.userId, params.id, params.type, params.amount, params.date, params.notes]
  );
}

export function deleteDividend(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM dividend_income WHERE user_id = $1 AND id = $2 RETURNING id`,
    [userId, id]
  );
}
