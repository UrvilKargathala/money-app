import { query } from "../db";
import { isoDate } from "../utils/format";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

export const SIP_FREQUENCIES = ["monthly", "quarterly"] as const;

export type SipRowRaw = {
  id: string;
  investment_id: string;
  investment_name: string;
  amount: string;
  frequency: "monthly" | "quarterly";
  next_date: Date;
  account_id: string | null;
  account_name: string | null;
  status: "active" | "paused" | "completed";
  start_date: Date;
  end_date: Date | null;
  notes: string | null;
};

export type Sip = Omit<SipRowRaw, "amount" | "next_date" | "start_date" | "end_date"> & {
  amount: number;
  next_date: string;
  start_date: string;
  end_date: string | null;
  days_until_next: number;
};

function mapSip(row: SipRowRaw): Sip {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextIso = isoDate(row.next_date);
  return {
    ...row,
    amount: Number(row.amount),
    next_date: nextIso,
    start_date: isoDate(row.start_date),
    end_date: row.end_date === null ? null : isoDate(row.end_date),
    days_until_next: Math.round(
      (new Date(`${nextIso}T00:00:00`).getTime() - today.getTime()) / 86_400_000
    ),
  };
}

const SIP_SELECT = `
  SELECT s.id, s.investment_id, i.name AS investment_name,
         s.amount::text AS amount, s.frequency, s.next_date,
         s.account_id, a.name AS account_name,
         s.status, s.start_date, s.end_date, s.notes
  FROM sip_trackers s
  JOIN investments i ON i.id = s.investment_id
  LEFT JOIN accounts a ON a.id = s.account_id
  WHERE s.user_id = $1
`;

export async function listSips(
  userId: number,
  status: string | null,
  q: Queryable = DB
): Promise<Sip[]> {
  const result = await q.query<SipRowRaw>(
    `${SIP_SELECT} AND ($2::text IS NULL OR s.status = $2::text)
     ORDER BY s.status, s.next_date`,
    [userId, status]
  );
  return result.rows.map(mapSip);
}

export async function getSipById(
  userId: number,
  id: string,
  q: Queryable = DB
): Promise<Sip | null> {
  const result = await q.query<SipRowRaw>(
    `${SIP_SELECT} AND s.id = $2::uuid`,
    [userId, id]
  );
  return result.rowCount === 1 ? mapSip(result.rows[0]) : null;
}

export async function insertSip(
  q: Queryable,
  params: {
    userId: number;
    investmentId: string;
    amount: number;
    frequency: "monthly" | "quarterly";
    nextDate: string;
    accountId: string | null;
    startDate: string;
    endDate: string | null;
    notes: string | null;
  }
): Promise<string> {
  const result = await q.query<{ id: string }>(
    `INSERT INTO sip_trackers
       (user_id, investment_id, amount, frequency, next_date, account_id,
        status, start_date, end_date, notes)
     VALUES ($1, $2::uuid, $3, $4, $5::date, $6::uuid, 'active',
             $7::date, $8::date, $9)
     RETURNING id`,
    [
      params.userId, params.investmentId, params.amount, params.frequency,
      params.nextDate, params.accountId, params.startDate, params.endDate,
      params.notes,
    ]
  );
  return result.rows[0].id;
}

/** Partial update with optimistic-lock version check on the parent holding's version scope. */
export function updateSip(
  q: Queryable,
  params: {
    userId: number;
    id: string;
    amount: number | null;
    frequency: string | null;
    nextDate: string | null;
    accountId: string | null;
    endDate: string | null;
    notes: string | null;
  }
) {
  return q.query<{ id: string }>(
    `UPDATE sip_trackers SET
       amount = COALESCE($3, amount),
       frequency = COALESCE($4, frequency),
       next_date = COALESCE($5::date, next_date),
       account_id = COALESCE($6::uuid, account_id),
       end_date = COALESCE($7::date, end_date),
       notes = COALESCE($8, notes)
     WHERE user_id = $1 AND id = $2::uuid
     RETURNING id`,
    [
      params.userId, params.id, params.amount, params.frequency,
      params.nextDate, params.accountId, params.endDate, params.notes,
    ]
  );
}

export function deleteSip(q: Queryable, userId: number, id: string) {
  return q.query<{ id: string }>(
    `DELETE FROM sip_trackers WHERE user_id = $1 AND id = $2::uuid RETURNING id`,
    [userId, id]
  );
}

export type SipTransition =
  | { from: "active"; to: "paused" }
  | { from: "paused"; to: "active" }
  | { from: "active" | "paused"; to: "completed" };

const TRANSITION_SQL: Record<string, string> = {
  pause: `UPDATE sip_trackers SET status = 'paused'
          WHERE user_id = $1 AND id = $2::uuid AND status = 'active' RETURNING id`,
  resume: `UPDATE sip_trackers SET status = 'active'
           WHERE user_id = $1 AND id = $2::uuid AND status = 'paused' RETURNING id`,
  complete: `UPDATE sip_trackers SET status = 'completed', end_date = COALESCE(end_date, CURRENT_DATE)
             WHERE user_id = $1 AND id = $2::uuid AND status IN ('active','paused') RETURNING id`,
};

export function transitionSipStatus(
  q: Queryable,
  action: "pause" | "resume" | "complete",
  userId: number,
  id: string
) {
  return q.query<{ id: string }>(TRANSITION_SQL[action], [userId, id]);
}

export type DueSip = {
  id: string;
  investment_name: string;
  amount: number;
  frequency: string;
  next_date: string;
  days_until_next: number;
};

export async function listDueSips(
  userId: number,
  windowDays: number,
  q: Queryable = DB
): Promise<DueSip[]> {
  const result = await q.query<{
    id: string;
    investment_name: string;
    amount: string;
    frequency: string;
    next_date: Date;
  }>(
    `SELECT s.id, i.name AS investment_name, s.amount::text AS amount,
            s.frequency, s.next_date
     FROM sip_trackers s
     JOIN investments i ON i.id = s.investment_id
     WHERE s.user_id = $1 AND s.status = 'active'
       AND s.next_date <= CURRENT_DATE + ($2::int * INTERVAL '1 day')
     ORDER BY s.next_date`,
    [userId, windowDays]
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return result.rows.map((row) => {
    const nextIso = isoDate(row.next_date);
    return {
      id: row.id,
      investment_name: row.investment_name,
      amount: Number(row.amount),
      frequency: row.frequency,
      next_date: nextIso,
      days_until_next: Math.round(
        (new Date(`${nextIso}T00:00:00`).getTime() - today.getTime()) /
          86_400_000
      ),
    };
  });
}

export type SipForInstallment = {
  id: string;
  investment_id: string;
  amount: string;
  frequency: "monthly" | "quarterly";
  next_date: Date;
  account_id: string | null;
  status: string;
};

export async function getSipForInstallment(
  q: Queryable,
  userId: number,
  id: string
): Promise<SipForInstallment | null> {
  const result = await q.query<SipForInstallment>(
    `SELECT id, investment_id, amount::text AS amount, frequency, next_date,
            account_id, status
     FROM sip_trackers WHERE user_id = $1 AND id = $2::uuid`,
    [userId, id]
  );
  return result.rows[0] ?? null;
}

export async function advanceSipNextDate(
  q: Queryable,
  params: { userId: number; id: string; nextDate: string }
): Promise<void> {
  await q.query(
    `UPDATE sip_trackers SET next_date = $3::date
     WHERE user_id = $1 AND id = $2::uuid`,
    [params.userId, params.id, params.nextDate]
  );
}
