import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query: query };

export type CalendarEvent = {
  date: string;
  source:
    | "bill"
    | "subscription"
    | "debt_emi"
    | "sip"
    | "investment_maturity"
    | "goal"
    | "recurring"
    | "custom"
    | "tax_deadline";
  label: string;
  /** Inflow/outflow/info â€” drives chips + projection sign (info excluded). */
  kind: "inflow" | "outflow" | "info";
  amount: number | null;
  color: string;
  deep_link: string;
  status?: string;
  /** Present only on custom events. */
  event_id?: string;
  /** Linked account when the source carries one (projection folding). */
  account_id?: string | null;
};

export type DateWindow = { from: string; to: string };

/**
 * Composes derived events from seven sources plus custom events.
 * Fixed fan-out: exactly eight single-statement queries via Promise.all,
 * regardless of data volume (no per-row queries anywhere).
 */
export async function getCalendarEvents(
  userId: number,
  window: DateWindow,
  q: Queryable = DB
): Promise<CalendarEvent[]> {
  const [
    bills,
    subscriptions,
    emis,
    sips,
    maturities,
    goals,
    recurringIncome,
    custom,
  ] = await Promise.all([
    // 1. Active bills â†’ due day clamped to month length (FR-C1.5), in JS.
    q.query<{
      id: string;
      name: string;
      amount: string | null;
      estimated_amount: string | null;
      due_day: number;
      current_period_status: string;
      account_id: string | null;
    }>(
      `SELECT id, name, amount::text AS amount, estimated_amount::text AS estimated_amount,
              due_day, current_period_status, account_id
       FROM bills
       WHERE user_id = $1 AND is_active = 1`,
      [userId]
    ),
    // 2. Active subscriptions renewing inside the window.
    q.query<{
      id: string;
      service_name: string;
      amount: string;
      next_renewal_date: Date;
      account_id: string | null;
    }>(
      `SELECT id, service_name, amount::text AS amount, next_renewal_date, account_id
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
         AND next_renewal_date BETWEEN $2::date AND $3::date`,
      [userId, window.from, window.to]
    ),
    // 3. Debt EMIs scheduled in the window for active debts.
    q.query<{
      debt_name: string;
      emi_amount: string | null;
      scheduled_date: Date;
      account_id: string | null;
    }>(
      `SELECT d.name AS debt_name, a.emi_amount::text AS emi_amount, a.scheduled_date,
              d.account_id
       FROM amortization_schedule a
       JOIN debts d ON d.id = a.debt_id
       WHERE a.user_id = $1 AND d.is_active = 1
         AND a.scheduled_date BETWEEN $2::date AND $3::date`,
      [userId, window.from, window.to]
    ),
    // 4. Active SIPs with installments in the window.
    q.query<{
      id: string;
      holding_name: string;
      amount: string;
      next_date: Date;
      account_id: string | null;
    }>(
      `SELECT s.id, i.name AS holding_name, s.amount::text AS amount, s.next_date,
              s.account_id
       FROM sip_trackers s
       JOIN investments i ON i.id = s.investment_id
       WHERE s.user_id = $1 AND s.status = 'active'
         AND s.next_date BETWEEN $2::date AND $3::date`,
      [userId, window.from, window.to]
    ),
    // 5. Investment maturities within 30 days of today (FR-C1.4).
    q.query<{
      id: string;
      name: string;
      current_value: string | null;
      maturity_date: Date;
    }>(
      `SELECT id, name, current_value::text AS current_value, maturity_date
       FROM investments
       WHERE user_id = $1 AND is_active = 1 AND maturity_date IS NOT NULL
         AND maturity_date <= CURRENT_DATE + INTERVAL '30 days'
         AND maturity_date BETWEEN $2::date AND $3::date`,
      [userId, window.from, window.to]
    ),
    // 6. Goal target dates in the window.
    q.query<{ id: string; name: string; target: string; target_date: Date }>(
      `SELECT id, name, target::text AS target, target_date
       FROM goals
       WHERE user_id = $1 AND target_date BETWEEN $2::date AND $3::date`,
      [userId, window.from, window.to]
    ),
    // 7. Recurring income templates due in the window.
    q.query<{
      description: string;
      amount: string;
      next_due_date: Date;
    }>(
      `SELECT description, amount::text AS amount, next_due_date
       FROM recurring_transaction_templates
       WHERE user_id = $1 AND is_active = 1 AND type = 'income'
         AND next_due_date BETWEEN $2::date AND $3::date`,
      [userId, window.from, window.to]
    ),
    // 8. Custom events (incl. multi-day spans overlapping the window).
    q.query<{
      id: string;
      title: string;
      event_type: string | null;
      amount: string | null;
      account_id: string | null;
      color: string | null;
      notes: string | null;
      event_date: Date;
      end_date: Date | null;
    }>(
      `SELECT id, title, event_type, amount::text AS amount, account_id, color,
              notes, event_date, end_date
       FROM calendar_events
       WHERE user_id = $1 AND deleted_at IS NULL
         AND event_date <= $3::date
         AND COALESCE(end_date, event_date) >= $2::date`,
      [userId, window.from, window.to]
    ),
  ]);

  const events: CalendarEvent[] = [];
  const monthLengths = new Map<string, number>();

  const daysInMonthOf = (isoDateStr: string): number => {
    if (!monthLengths.has(isoDateStr)) {
      const [y, m] = isoDateStr.split("-").map(Number);
      monthLengths.set(isoDateStr, new Date(y, m, 0).getDate());
    }
    return monthLengths.get(isoDateStr)!;
  };

  // Bills: one event per month covered by the window (due-day clamp).
  const monthStarts: string[] = [];
  {
    const cursor = new Date(`${window.from}T00:00:00Z`);
    const end = new Date(`${window.to}T00:00:00Z`);
    while (cursor <= end) {
      monthStarts.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
  }

  for (const b of bills.rows) {
    const amount =
      Number(b.amount ?? b.estimated_amount ?? 0) || null;
    for (const month of monthStarts) {
      const lastDay = daysInMonthOf(`${month}-01`);
      const dueDay = Math.min(b.due_day, lastDay);
      const date = `${month}-${String(dueDay).padStart(2, "0")}`;
      if (date < window.from || date > window.to) continue;
      events.push({
        date,
        source: "bill",
        label: b.name,
        kind: "outflow",
        amount,
        color: "blue",
        deep_link: `/bills`,
        status: b.current_period_status,
        account_id: b.account_id,
      });
    }
  }

  for (const s of subscriptions.rows) {
    events.push({
      date: isoDate(s.next_renewal_date),
      source: "subscription",
      label: s.service_name,
      kind: "outflow",
      amount: Number(s.amount),
      color: "purple",
      deep_link: "/subscriptions",
      account_id: s.account_id,
    });
  }

  for (const e of emis.rows) {
    events.push({
      date: isoDate(e.scheduled_date),
      source: "debt_emi",
      label: `${e.debt_name} EMI`,
      kind: "outflow",
      amount: Number(e.emi_amount ?? 0) || null,
      color: "red",
      deep_link: "/debts",
      account_id: e.account_id,
    });
  }

  for (const s of sips.rows) {
    events.push({
      date: isoDate(s.next_date),
      source: "sip",
      label: `${s.holding_name} SIP`,
      kind: "outflow",
      amount: Number(s.amount),
      color: "teal",
      deep_link: "/investments",
      account_id: s.account_id,
    });
  }

  for (const m of maturities.rows) {
    events.push({
      date: isoDate(m.maturity_date),
      source: "investment_maturity",
      label: `${m.name} Maturity`,
      kind: "info",
      amount: m.current_value === null ? null : Number(m.current_value),
      color: "green",
      deep_link: "/investments",
    });
  }

  for (const g of goals.rows) {
    events.push({
      date: isoDate(g.target_date),
      source: "goal",
      label: `${g.name} Target Date`,
      kind: "info",
      amount: Number(g.target),
      color: "orange",
      deep_link: "/goals",
    });
  }

  for (const r of recurringIncome.rows) {
    events.push({
      date: isoDate(r.next_due_date),
      source: "recurring",
      label: r.description ?? "Recurring income",
      kind: "inflow",
      amount: Number(r.amount),
      color: "green",
      deep_link: "/transactions",
    });
  }

  for (const ev of custom.rows) {
    const startIso = isoDate(ev.event_date);
    const endIso = ev.end_date === null ? startIso : isoDate(ev.end_date);
    // Multi-day spans emit one chip per covered day within the window.
    let cursor = startIso < window.from ? window.from : startIso;
    const hardEnd = endIso > window.to ? window.to : endIso;
    while (cursor <= hardEnd) {
      const kind: CalendarEvent["kind"] =
        ev.event_type === "income"
          ? "inflow"
          : ev.event_type === "expense"
            ? "outflow"
            : "info";
      events.push({
        date: cursor,
        source: "custom",
        label: ev.title,
        kind,
        amount: ev.amount === null ? null : Number(ev.amount),
        color: ev.color ?? "grey",
        deep_link: "/calendar",
        event_id: ev.id,
        account_id: ev.account_id,
      });
      const next = new Date(`${cursor}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursor = next.toISOString().slice(0, 10);
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------------------
// Custom event CRUD helpers
// ---------------------------------------------------------------------------

export type CustomEventRow = {
  id: string;
  title: string;
  event_date: string;
  end_date: string | null;
  event_type: string | null;
  amount: number | null;
  account_id: string | null;
  color: string | null;
  notes: string | null;
  version: number;
};

export async function getCustomEvent(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<CustomEventRow | null> {
  const result = await q.query<{
    id: string;
    title: string;
    event_date: Date;
    end_date: Date | null;
    event_type: string | null;
    amount: string | null;
    account_id: string | null;
    color: string | null;
    notes: string | null;
    version: number;
  }>(
    `SELECT id, title, event_date, end_date, event_type,
            amount::text AS amount, account_id, color, notes, version
     FROM calendar_events WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL`,
    [userId, id]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    ...row,
    event_date: isoDate(row.event_date),
    end_date: row.end_date === null ? null : isoDate(row.end_date),
    amount: row.amount === null ? null : Number(row.amount),
  };
}

export function insertCustomEvent(
  q: Queryable,
  params: {
    userId: number;
    title: string;
    eventDate: string;
    endDate: string | null;
    eventType: string | null;
    amount: number | null;
    accountId: string | null;
    color: string | null;
    notes: string | null;
  }
): Promise<string> {
  return q
    .query<{ id: string }>(
      `INSERT INTO calendar_events
         (user_id, title, event_date, end_date, event_type, amount,
          account_id, color, notes, created_by, updated_by)
       VALUES ($1, $2, $3::date, $4::date, $5::text, $6, $7::uuid, $8, $9, $1, $1)
       RETURNING id`,
      [
        params.userId, params.title, params.eventDate, params.endDate,
        params.eventType, params.amount, params.accountId, params.color,
        params.notes,
      ]
    )
    .then((r) => r.rows[0].id);
}

export function updateCustomEvent(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    title: string | null;
    endDate: string | null;
    eventType: string | null;
    amountProvided: boolean;
    amount: number | null;
    color: string | null;
    notes: string | null;
    version: number;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE calendar_events SET
       title = COALESCE($3, title),
       end_date = COALESCE($4::date, end_date),
       event_type = COALESCE($5::text, event_type),
       amount = CASE WHEN $6::boolean THEN $7 ELSE amount END,
       color = COALESCE($8, color),
       notes = COALESCE($9, notes),
       updated_by = $1, version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL AND version = $10
     RETURNING id`,
    [
      params.userId, params.id, params.title, params.endDate, params.eventType,
      params.amountProvided, params.amount, params.color, params.notes,
      params.version,
    ]
  );
}

export function softDeleteCustomEvent(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `UPDATE calendar_events SET deleted_at = CURRENT_TIMESTAMP, deleted_by = $1,
            updated_by = $1, version = version + 1
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL
     RETURNING id`,
    [userId, id]
  );
}

/** Duplicates a custom event under row lock; returns the new id. */
export async function duplicateCustomEvent(
  q: Queryable,
  userId: number,
  id: string
): Promise<string | null> {
  const locked = await q.query<{ id: string }>(
    `SELECT id FROM calendar_events
     WHERE user_id = $1 AND id = $2::uuid AND deleted_at IS NULL
     FOR UPDATE`,
    [userId, id]
  );
  if (locked.rowCount !== 1) return null;

  const dup = await q.query<{ id: string }>(
    `INSERT INTO calendar_events
       (user_id, title, event_date, end_date, event_type, amount,
        account_id, color, notes, created_by, updated_by)
     SELECT user_id, title || ' (copy)', event_date, end_date, event_type,
            amount, account_id, color, notes, $1, $1
     FROM calendar_events WHERE id = $2::uuid
     RETURNING id`,
    [userId, id]
  );
  return dup.rows[0].id;
}

export type AccountProjection = {
  account_id: string;
  account_name: string;
  balance_today: number;
  balance_plus7: number;
  balance_plus30: number;
  negative_days: string[];
};

type ScheduledFlow = {
  account_id: string | null;
  date: string;
  delta: number; // signed
};

/** Current computed balance per active account â€” one grouped aggregate. */
async function loadAccountBalances(
  userId: number,
  q: Queryable
): Promise<{ id: string; name: string; type: string; net: string }[]> {
  const result = await q.query<{
    id: string;
    name: string;
    type: string;
    net: string;
  }>(
    `SELECT a.id, a.name, a.type,
            (a.opening_balance + COALESCE(SUM(CASE
               WHEN t.type = 'income' THEN t.amount
               WHEN t.type = 'expense' THEN -t.amount
               WHEN t.type = 'transfer' THEN
                 CASE WHEN tf.from_transaction_id = t.id THEN -t.amount ELSE t.amount END
               ELSE 0 END), 0))::text AS net
     FROM accounts a
     LEFT JOIN transactions t ON t.account_id = a.id
     LEFT JOIN account_transfers tf
       ON tf.from_transaction_id = t.id OR tf.to_transaction_id = t.id
     WHERE a.user_id = $1 AND a.is_active = 1 AND a.deleted_at IS NULL
     GROUP BY a.id, a.name, a.type
     ORDER BY a.name`,
    [userId]
  );
  return result.rows;
}

/**
 * Builds per-account projections for today/+7/+30. Scheduled flows come from
 * the composer (already loaded); custom events carry their linked account via
 * a dedicated query here so the fold stays accurate.
 */
export async function getProjection(
  userId: number,
  horizonDays: number,
  q: Queryable = DB
): Promise<AccountProjection[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayIso = isoDate(today);
  const horizonIso = isoDate(new Date(today.getTime() + horizonDays * 86_400_000));

  const [accounts, events, customAccounts] = await Promise.all([
    loadAccountBalances(userId, q),
    getCalendarEvents(userId, { from: todayIso, to: horizonIso }, q),
    q.query<{ id: string; account_id: string | null }>(
      `SELECT id, account_id FROM calendar_events
       WHERE user_id = $1 AND deleted_at IS NULL AND event_type IN ('income','expense')`,
      [userId]
    ),
  ]);

  // Custom-event -> linked-account mapping for the fold.
  const customAccountById = new Map<string, string | null>();
  for (const row of customAccounts.rows) {
    customAccountById.set(row.id, row.account_id);
  }

  const accountIdSet = new Set(accounts.map((a) => a.id));

  // Per-account daily deltas. Events without a linked account apply to every
  // active account (conservative aggregate view).
  const deltasByAccount = new Map<string, Map<string, number>>();
  for (const ev of events) {
    if (ev.kind === "info" || ev.amount === null || ev.amount === 0) continue;
    const delta = ev.kind === "inflow" ? ev.amount : -ev.amount;
    const linked =
      ev.source === "custom"
        ? customAccountById.get(ev.event_id ?? "") ?? null
        : ev.account_id ?? null;
    const targets =
      linked !== null && accountIdSet.has(linked)
        ? [linked]
        : accounts.map((a) => a.id);
    if (ev.date < todayIso || ev.date > horizonIso) continue;
    for (const target of targets) {
      if (!deltasByAccount.has(target)) deltasByAccount.set(target, new Map());
      const days = deltasByAccount.get(target)!;
      days.set(ev.date, (days.get(ev.date) ?? 0) + delta);
    }
  }

  const projections: AccountProjection[] = [];

  for (const account of accounts) {
    let balance = Math.round(Number(account.net) * 100) / 100;
    const negativeDays: string[] = [];
    const balancesByDay = new Map<string, number>([[todayIso, balance]]);

    const dailyDeltas = deltasByAccount.get(account.id) ?? new Map<string, number>();
    let cursorIso = todayIso;
    let guard = 0;
    while (cursorIso < horizonIso && guard < 400) {
      balance += dailyDeltas.get(cursorIso) ?? 0;
      const next = new Date(`${cursorIso}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      cursorIso = next.toISOString().slice(0, 10);
      balance = Math.round(balance * 100) / 100;
      balancesByDay.set(cursorIso, balance);
      if (balance < 0) negativeDays.push(cursorIso);
      guard += 1;
    }

    projections.push({
      account_id: account.id,
      account_name: account.name,
      balance_today: balancesByDay.get(todayIso)!,
      balance_plus7:
        balancesByDay.get(isoDate(new Date(today.getTime() + 7 * 86_400_000))) ??
        balancesByDay.get(horizonIso)!,
      balance_plus30: balancesByDay.get(horizonIso)!,
      negative_days: negativeDays,
    });
  }

  return projections;
}
