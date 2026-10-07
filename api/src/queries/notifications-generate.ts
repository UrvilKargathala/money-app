import { query } from "../db";
import type { Queryable } from "./notes";
import { isoDate } from "../utils/format";
import {
  getPreferenceMatrix,
  insertNotifications,
  listActiveAlertPayloads,
  listActiveAlertPayloadsForUsers,
  type NewNotification,
} from "./notifications";
import { getAccountsWithBalances } from "./accounts";
import { getBudgets } from "./budgets";
import { getHealthAlerts } from "./debts";

const DB: Queryable = { query: query };

export type GenerateCounts = Record<string, number>;

/**
 * Dedup key carried in every generated data_payload. Readers never see it;
 * generators compare it to decide whether an equivalent unread alert already
 * exists. `period` scopes re-alerting (month label, exact date, or "" for
 * rolling conditions whose expiry alone re-arms them).
 */
export type AlertKey = { kind: string; ref: string; period: string };

function payloadKey(payload: Record<string, unknown>): string | null {
  if (
    typeof payload.kind !== "string" ||
    typeof payload.ref !== "string" ||
    typeof payload.period !== "string"
  ) {
    return null;
  }
  return `${payload.kind}|${payload.ref}|${payload.period}`;
}

function keySet(payloads: Record<string, unknown>[]): Set<string> {
  const out = new Set<string>();
  for (const p of payloads) {
    const key = payloadKey(p);
    if (key) out.add(key);
  }
  return out;
}

/**
 * Hoisted dedupe index: building one keySet per candidate row is O(n^2) in
 * the user's alert count. Build each user's set once, then probe per row.
 */
function seenByUser(existing: Map<number, Record<string, unknown>[]>): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const [userId, payloads] of existing) out.set(userId, keySet(payloads));
  return out;
}

const EMPTY_SET: Set<string> = new Set();

function prefOn(
  matrix: { notification_type: string; channel: string; is_enabled: boolean }[],
  type: string
): boolean {
  const row = matrix.find(
    (p) => p.notification_type === type && p.channel === "in_app"
  );
  // No stored row means default-on for in_app (matches getPreferenceMatrix).
  return row ? row.is_enabled : true;
}

// --- small date helpers (generator-local; canonical UI copy lives in
// routes/bills.ts nextDueDate — same monthly-occurrence semantics) ---

function daysBetween(from: Date, to: Date): number {
  const utc = (d: Date) =>
    Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

function monthLabel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthEndIso(year: number, month: number): string {
  const days = new Date(year, month, 0).getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(days).padStart(2, "0")}`;
}

function plusDaysIso(base: Date, days: number): string {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days);
  return isoDate(d);
}

/** Next monthly-style occurrence of a due-day on/after `from`. Quarterly /
 * half-yearly / annual bills step whole periods forward (max 24 steps). */
function nextBillDue(dueDay: number, frequency: string, from: Date): Date {
  const step =
    frequency === "quarterly" ? 3 : frequency === "half_yearly" ? 6 : frequency === "annual" ? 12 : 1;
  let y = from.getFullYear();
  let m = from.getMonth();
  for (let i = 0; i < 24; i++) {
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const candidate = new Date(y, m, Math.min(Math.max(dueDay, 1), daysInMonth));
    if (candidate >= new Date(from.getFullYear(), from.getMonth(), from.getDate())) {
      return candidate;
    }
    const stepped = new Date(y, m + step, 1);
    y = stepped.getFullYear();
    m = stepped.getMonth();
  }
  return new Date(y, m, 1);
}

// ---------------------------------------------------------------------------
// Set-based triggers: one candidate query across all users, in-memory
// filter, one bulk insert. No per-row and no per-user query loops.
// ---------------------------------------------------------------------------

type BillCandidate = {
  user_id: number;
  id: string;
  name: string;
  amount: string | null;
  due_day: number;
  frequency: string;
  reminder_days: number;
  reminder_on: boolean;
  warning_on: boolean;
};

/** Bills due soon (per-bill reminder window) or overdue, excluding paid/skipped.
 * NOTE: current_period_status is trusted only to *suppress* (paid/skipped);
 * due-ness itself is recomputed from due_day, since no status-refresh job
 * maintains it yet. Stale-'paid' rows are a known gap (see module docs). */
export async function generateBillAlerts(q: Queryable = DB): Promise<number> {
  const exec = q.query;
  const result = await exec<BillCandidate>(
    `SELECT b.user_id, b.id, b.name,
            COALESCE(b.amount, b.estimated_amount, 0)::text AS amount,
            b.due_day, b.frequency, COALESCE(b.reminder_days, 3)::int AS reminder_days,
            (npr.is_enabled IS NULL OR npr.is_enabled = 1) AS reminder_on,
            (npw.is_enabled IS NULL OR npw.is_enabled = 1) AS warning_on
     FROM bills b
     LEFT JOIN notification_preferences npr
       ON npr.user_id = b.user_id AND npr.notification_type = 'reminder' AND npr.channel = 'in_app'
     LEFT JOIN notification_preferences npw
       ON npw.user_id = b.user_id AND npw.notification_type = 'warning' AND npw.channel = 'in_app'
     WHERE b.is_active = 1 AND b.current_period_status NOT IN ('paid', 'skipped')`,
    []
  );
  if (result.rows.length === 0) return 0;
  const today = new Date();
  const existing = await listActiveAlertPayloadsForUsers(
    [...new Set(result.rows.map((r) => r.user_id))],
    "bills",
    q
  );
  const seen = seenByUser(existing);
  const rows: NewNotification[] = [];
  for (const bill of result.rows) {
    const due = nextBillDue(bill.due_day, bill.frequency, today);
    const diff = daysBetween(today, due);
    const overdue = diff < 0;
    if (overdue && !bill.warning_on) continue;
    if (!overdue && (diff > bill.reminder_days || !bill.reminder_on)) continue;
    const period = monthLabel(due);
    const key: AlertKey = {
      kind: overdue ? "bill_overdue" : "bill_due",
      ref: bill.id,
      period,
    };
    if ((seen.get(bill.user_id) ?? EMPTY_SET).has(`${key.kind}|${key.ref}|${key.period}`)) continue;
    const amount = Number(bill.amount ?? 0);
    rows.push({
      userId: bill.user_id,
      type: overdue ? "warning" : "reminder",
      module: "bills",
      title: overdue ? `${bill.name} is overdue` : `${bill.name} due soon`,
      message: overdue
        ? `${bill.name} was due ${-diff}d ago — ₹${amount.toFixed(2)} pending.`
        : `${bill.name} is due in ${diff}d — ₹${amount.toFixed(2)}.`,
      dataPayload: { ...key },
      deepLink: "/money/bills",
      priority: overdue ? "high" : "medium",
      expiresAt: plusDaysIso(due, 7),
    });
  }
  return insertNotifications(q, rows);
}

type SubscriptionCandidate = {
  user_id: number;
  id: string;
  service_name: string;
  amount: string;
  renewal: string;
  reminder_on: boolean;
};

/** Active subscriptions renewing within 7 days (overdue renewals included). */
export async function generateSubscriptionAlerts(q: Queryable = DB): Promise<number> {
  const exec = q.query;
  const result = await exec<SubscriptionCandidate>(
    `SELECT s.user_id, s.id, s.service_name, s.amount::text AS amount,
            s.next_renewal_date::text AS renewal,
            (np.is_enabled IS NULL OR np.is_enabled = 1) AS reminder_on
     FROM subscriptions s
     LEFT JOIN notification_preferences np
       ON np.user_id = s.user_id AND np.notification_type = 'reminder' AND np.channel = 'in_app'
     WHERE s.status = 'active'
       AND s.next_renewal_date <= CURRENT_DATE + INTERVAL '7 days'`,
    []
  );
  if (result.rows.length === 0) return 0;
  const today = new Date();
  const existing = await listActiveAlertPayloadsForUsers(
    [...new Set(result.rows.map((r) => r.user_id))],
    "subscription",
    q
  );
  const seen = seenByUser(existing);
  const rows: NewNotification[] = [];
  for (const sub of result.rows) {
    if (!sub.reminder_on) continue;
    const renewal = new Date(`${sub.renewal}T00:00:00`);
    const diff = daysBetween(today, renewal);
    const overdue = diff < 0;
    const key: AlertKey = {
      kind: "subscription_renewal",
      ref: sub.id,
      period: sub.renewal,
    };
    if ((seen.get(sub.user_id) ?? EMPTY_SET).has(`${key.kind}|${key.ref}|${key.period}`)) continue;
    const amount = Number(sub.amount ?? 0);
    rows.push({
      userId: sub.user_id,
      type: "reminder",
      module: "subscription",
      title: overdue
        ? `${sub.service_name} renewal overdue`
        : `${sub.service_name} renews soon`,
      message: overdue
        ? `${sub.service_name} was due for renewal on ${sub.renewal} — ₹${amount.toFixed(2)}.`
        : `${sub.service_name} renews in ${diff}d (${sub.renewal}) — ₹${amount.toFixed(2)}.`,
      dataPayload: { ...key },
      deepLink: "/money/subscriptions",
      priority: overdue ? "high" : "medium",
      expiresAt: plusDaysIso(renewal, 7),
    });
  }
  return insertNotifications(q, rows);
}

type GoalCandidate = {
  user_id: number;
  id: string;
  name: string;
  target: string;
  target_date: string;
  created_at: string;
  saved: string;
  insight_on: boolean;
};

/** Active goals behind their linear savings pace (with a tolerance band, so
 * day-one goals never alert). One alert per goal per month. */
export async function generateGoalAlerts(q: Queryable = DB): Promise<number> {
  const exec = q.query;
  const result = await exec<GoalCandidate>(
    `SELECT g.user_id, g.id, g.name, g.target::text AS target,
            g.target_date::text AS target_date, g.created_at::text AS created_at,
            COALESCE(SUM(c.amount), 0)::text AS saved,
            (np.is_enabled IS NULL OR np.is_enabled = 1) AS insight_on
     FROM goals g
     LEFT JOIN goal_contributions c ON c.goal_id = g.id
     LEFT JOIN notification_preferences np
       ON np.user_id = g.user_id AND np.notification_type = 'insight' AND np.channel = 'in_app'
     WHERE g.status = 'active'
       AND g.target_date IS NOT NULL AND g.target_date > CURRENT_DATE
       AND g.target > 0
     GROUP BY g.user_id, g.id, g.name, g.target, g.target_date, g.created_at,
              np.is_enabled`,
    []
  );
  if (result.rows.length === 0) return 0;
  const today = new Date();
  const period = monthLabel(today);
  const existing = await listActiveAlertPayloadsForUsers(
    [...new Set(result.rows.map((r) => r.user_id))],
    "goals",
    q
  );
  const seen = seenByUser(existing);
  const rows: NewNotification[] = [];
  for (const goal of result.rows) {
    if (!goal.insight_on) continue;
    const start = new Date(`${goal.created_at.slice(0, 10)}T00:00:00`);
    const end = new Date(`${goal.target_date}T00:00:00`);
    const total = Math.max(1, daysBetween(start, end));
    const elapsed = Math.max(0, daysBetween(start, today));
    if (elapsed / total <= 0.15) continue;
    const expected = (elapsed / total) * 100;
    const actual = (Number(goal.saved) / Number(goal.target)) * 100;
    if (actual >= expected - 10) continue;
    const key: AlertKey = { kind: "goal_behind", ref: goal.id, period };
    if ((seen.get(goal.user_id) ?? EMPTY_SET).has(`${key.kind}|${key.ref}|${key.period}`)) continue;
    const now = new Date();
    rows.push({
      userId: goal.user_id,
      type: "insight",
      module: "goals",
      title: `${goal.name} is behind pace`,
      message: `${Math.round(actual)}% saved vs ${Math.round(expected)}% expected by now.`,
      dataPayload: { ...key },
      deepLink: "/wealth/goals",
      priority: "medium",
      expiresAt: monthEndIso(now.getFullYear(), now.getMonth() + 1),
    });
  }
  return insertNotifications(q, rows);
}

// ---------------------------------------------------------------------------
// Per-user builders for triggers that reuse canonical module math (spend
// rollups, balances, health engine). The dispatcher fans these out once per
// user per nightly run — a deliberate, bounded cron fan-out (see DEV-ENV
// nightly-jobs; routes/ carries no SQL and no per-row query loops).
// ---------------------------------------------------------------------------

/**
 * Asset accounts below ₹1,000 (same bar the dashboard's "needs attention"
 * card uses). Rolling key with 7-day expiry, so a persistent low balance
 * re-alerts weekly instead of spamming or going silent forever.
 */
export async function buildAccountAlerts(
  userId: number
): Promise<NewNotification[]> {
  const matrix = await getPreferenceMatrix(userId, DB);
  if (!prefOn(matrix, "warning")) return [];
  const accounts = await getAccountsWithBalances(userId);
  const seen = keySet(await listActiveAlertPayloads(userId, DB));
  const rows: NewNotification[] = [];
  for (const account of accounts) {
    if (account.is_asset !== 1 || account.balance >= 1000) continue;
    const key: AlertKey = { kind: "low_balance", ref: account.id, period: "" };
    if (seen.has(`${key.kind}|${key.ref}|${key.period}`)) continue;
    rows.push({
      userId,
      type: "warning",
      module: "account",
      title: `${account.name} is running low`,
      message: `${account.name} balance is ₹${account.balance.toFixed(2)} (below ₹1,000).`,
      dataPayload: { ...key },
      deepLink: "/money/accounts",
      priority: "medium",
      expiresAt: plusDaysIso(new Date(), 7),
    });
  }
  return rows;
}

/**
 * Budget threshold crossings for a month, honoring each budget's own
 * alert_50/80/100 flags. Spend math stays canonical (getBudgets); this only
 * maps crossed levels to alerts, once per level per month.
 */
export async function buildBudgetAlerts(
  userId: number,
  month: number,
  year: number
): Promise<NewNotification[]> {
  const matrix = await getPreferenceMatrix(userId, DB);
  if (!prefOn(matrix, "alert")) return [];
  const budgets = await getBudgets(userId, month, year);
  const seen = keySet(await listActiveAlertPayloads(userId, DB));
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const rows: NewNotification[] = [];
  for (const budget of budgets) {
    if (budget.amount <= 0) continue;
    const label = budget.category_name ?? "Overall";
    const levels = [
      { level: 50, enabled: budget.alert_50 === 1 },
      { level: 80, enabled: budget.alert_80 === 1 },
      { level: 100, enabled: budget.alert_100 === 1 },
    ];
    for (const { level, enabled } of levels) {
      if (!enabled || budget.utilization_pct < level) continue;
      const key: AlertKey = {
        kind: "budget_threshold",
        ref: budget.id,
        period: `${period}:${level}`,
      };
      if (seen.has(`${key.kind}|${key.ref}|${key.period}`)) continue;
      rows.push({
        userId,
        type: "alert",
        module: "budget",
        title: `${label} budget ${Math.round(budget.utilization_pct)}% used`,
        message: `${label}: ₹${budget.spent.toFixed(2)} of ₹${budget.amount.toFixed(2)} (${level}% alert).`,
        dataPayload: { ...key },
        deepLink: "/money/budgets",
        priority: level >= 100 ? "high" : level >= 80 ? "medium" : "low",
        expiresAt: monthEndIso(year, month),
      });
    }
  }
  return rows;
}

type MissedDebts = { debt_id: string; name: string; missed_months: string[] }[];

/**
 * Debt signals straight from the canonical health engine (getHealthAlerts):
 * missed EMIs per debt per month + portfolio high-DTI. Partial months and
 * info-level staleness are skipped deliberately (noise control).
 */
export async function buildDebtAlerts(userId: number): Promise<NewNotification[]> {
  const matrix = await getPreferenceMatrix(userId, DB);
  if (!prefOn(matrix, "warning")) return [];
  const health = await getHealthAlerts(userId);
  const seen = keySet(await listActiveAlertPayloads(userId, DB));
  const period = monthLabel(new Date());
  const rows: NewNotification[] = [];
  const now = new Date();
  for (const alert of health.alerts) {
    if (alert.type === "missed_payments") {
      const debts = (alert.details as { debts?: MissedDebts } | null)?.debts ?? [];
      for (const debt of debts) {
        const priority = debt.missed_months.length >= 3 ? "high" : "medium";
        for (const missedMonth of debt.missed_months) {
          const key: AlertKey = {
            kind: "debt_missed",
            ref: debt.debt_id,
            period: missedMonth,
          };
          if (seen.has(`${key.kind}|${key.ref}|${key.period}`)) continue;
          rows.push({
            userId,
            type: "warning",
            module: "debt",
            title: `Missed EMI: ${debt.name}`,
            message: `${debt.name} has a missed EMI for ${missedMonth}.`,
            dataPayload: { ...key },
            deepLink: "/wealth/debts",
            priority,
            expiresAt: monthEndIso(now.getFullYear(), now.getMonth() + 1),
          });
        }
      }
    } else if (alert.type === "high_dti") {
      const details = (alert.details ?? {}) as { dti?: number };
      const key: AlertKey = { kind: "debt_dti", ref: "portfolio", period };
      if (seen.has(`${key.kind}|${key.ref}|${key.period}`)) continue;
      rows.push({
        userId,
        type: "warning",
        module: "debt",
        title: "Debt load is running high",
        message:
          typeof details.dti === "number"
            ? `Debt-to-income is ${details.dti}% — consider slowing new borrowing.`
            : "Debt-to-income is above the comfort zone.",
        dataPayload: { ...key },
        deepLink: "/wealth/debts",
        priority: alert.severity === "critical" ? "high" : "medium",
        expiresAt: monthEndIso(now.getFullYear(), now.getMonth() + 1),
      });
    }
  }
  return rows;
}

/**
 * Bulk-insert fan-out rows with the ambient pool (the dispatcher in routes/
 * may not import the raw query executor per the security guards).
 */
export async function insertGeneratedAlerts(
  rows: NewNotification[]
): Promise<number> {
  return insertNotifications(DB, rows);
}

/** Users owning anything the fan-out triggers inspect (one query). Cursor-paginated: pass last user_id from the previous page, 0 to start. */
export async function listUsersWithActivity(
  q: Queryable = DB,
  afterUserId = 0,
  limit = 100
): Promise<number[]> {
  const result = await q.query<{ user_id: number }>(
    `SELECT DISTINCT x.user_id FROM (
       SELECT user_id FROM bills WHERE is_active = 1 AND user_id > $1
       UNION SELECT user_id FROM subscriptions WHERE status = 'active' AND user_id > $1
       UNION SELECT user_id FROM accounts WHERE is_active = 1 AND deleted_at IS NULL AND user_id > $1
       UNION SELECT user_id FROM budgets WHERE is_active = 1 AND user_id > $1
       UNION SELECT user_id FROM goals WHERE status = 'active' AND user_id > $1
       UNION SELECT user_id FROM debts WHERE is_active = 1 AND user_id > $1
     ) x JOIN users u ON u.user_id = x.user_id AND u.deleted_at IS NULL
     ORDER BY x.user_id LIMIT $2`,
    [afterUserId, limit]
  );
  return result.rows.map((r) => r.user_id);
}
