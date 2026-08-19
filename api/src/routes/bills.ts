import { Hono } from "hono";
import type { Context } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";

const bills = new Hono();

export const BILL_FREQUENCIES = [
  "monthly",
  "quarterly",
  "half_yearly",
  "annual",
  "one_time",
] as const;

type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export type Bill = {
  id: string;
  name: string;
  amount: number | null;
  estimated_amount: number | null;
  due_day: number;
  frequency: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reminder_days: number;
  is_autopay: number;
  notes: string | null;
  current_period_status: string;
  is_active: number;
  version: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
};

export type PaymentHistoryRow = {
  id: string;
  payable_type: "bill" | "subscription";
  payable_id: string;
  transaction_id: string | null;
  amount: number;
  period_label: string;
  period_month: number;
  period_year: number;
  notes: string | null;
  created_at: string;
};

export type DueItem = {
  type: "bill" | "subscription";
  id: string;
  label: string;
  amount: number;
  due_date: string;
  status: string;
};

export type BillOverview = {
  total_monthly_obligation: number;
  due_this_week: number;
  overdue_count: number;
  upcoming: DueItem[];
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthName(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

function currentPeriod(): { label: string; month: number; year: number } {
  const now = new Date();
  return {
    label: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function clampedDay(year: number, month: number, dueDay: number): number {
  return Math.min(dueDay, daysInMonth(year, month));
}

function nextDueDate(dueDay: number, from: Date): Date {
  let year = from.getFullYear();
  let month = from.getMonth() + 1;
  let candidate = new Date(year, month - 1, clampedDay(year, month, dueDay));
  if (candidate < from) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
    candidate = new Date(year, month - 1, clampedDay(year, month, dueDay));
  }
  return candidate;
}

function daysUntil(date: Date): number {
  return Math.round((date.getTime() - startOfToday().getTime()) / 86400000);
}

function isoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function monthlyObligation(
  amount: string | null,
  estimatedAmount: string | null,
  frequency: string
): number {
  const effective = Number(amount ?? estimatedAmount ?? 0);
  const multiplier: Record<string, number> = {
    monthly: 1,
    quarterly: 1 / 3,
    half_yearly: 1 / 6,
    annual: 1 / 12,
    one_time: 0,
  };
  return effective * (multiplier[frequency] ?? 1);
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toPaymentRow(row: {
  id: string;
  payable_type: string;
  payable_id: string;
  transaction_id: string | null;
  amount: string;
  period_label: string;
  period_month: number;
  period_year: number;
  notes: string | null;
  created_at: Date;
}): PaymentHistoryRow {
  return {
    ...row,
    payable_type: row.payable_type as PaymentHistoryRow["payable_type"],
    amount: Number(row.amount),
    created_at: row.created_at.toISOString(),
  };
}

function toBill(row: {
  id: string;
  name: string;
  amount: string | null;
  estimated_amount: string | null;
  due_day: number;
  frequency: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  reminder_days: number;
  is_autopay: number;
  notes: string | null;
  current_period_status: string;
  is_active: number;
  version: number;
  last_paid_date: Date | null;
  last_paid_amount: string | null;
}): Bill {
  return {
    ...row,
    amount: row.amount === null ? null : Number(row.amount),
    estimated_amount:
      row.estimated_amount === null ? null : Number(row.estimated_amount),
    last_paid_date:
      row.last_paid_date === null ? null : row.last_paid_date.toISOString().slice(0, 10),
    last_paid_amount:
      row.last_paid_amount === null ? null : Number(row.last_paid_amount),
  };
}

const BILL_SELECT = `
  SELECT b.id, b.name, b.amount, b.estimated_amount, b.due_day, b.frequency,
         b.account_id, a.name AS account_name,
         b.category_id, cat.name AS category_name,
         b.reminder_days, b.is_autopay, b.notes,
         b.current_period_status, b.is_active, b.version,
         ph.created_at AS last_paid_date, ph.amount AS last_paid_amount
  FROM bills b
  LEFT JOIN accounts a ON a.id = b.account_id
  LEFT JOIN categories cat ON cat.id = b.category_id
  LEFT JOIN LATERAL (
    SELECT created_at, amount FROM payment_history
    WHERE user_id = b.user_id AND payable_type = 'bill' AND payable_id = b.id
    ORDER BY created_at DESC LIMIT 1
  ) ph ON true
`;

bills.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(`
      ${BILL_SELECT}
      WHERE b.user_id = $1
      ORDER BY b.due_day, b.name
    `, [user.user_id])
  );
  return c.json({ bills: result.rows.map(toBill) });
});

bills.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const amount = parseAmount(body.amount);
  const estimatedAmount = parseAmount(body.estimated_amount);
  const dueDay = Number(body.due_day);
  const frequency = String(body.frequency ?? "");
  const accountId = String(body.account_id ?? "") || null;
  const categoryId = String(body.category_id ?? "") || null;
  const reminderDays = body.reminder_days === undefined
    ? 3
    : Number(body.reminder_days);
  const isAutopay = body.is_autopay === true || body.is_autopay === 1 ? 1 : 0;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!name) {
    fieldErrors.name = "Please enter a bill name.";
  }
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
    fieldErrors.due_day = "Due day must be between 1 and 31.";
  }
  if (!(BILL_FREQUENCIES as readonly string[]).includes(frequency)) {
    fieldErrors.frequency = "Please choose a valid frequency.";
  }
  if (amount !== null && amount <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (estimatedAmount !== null && estimatedAmount <= 0) {
    fieldErrors.estimated_amount = "Please enter an amount greater than zero.";
  }
  if (amount === null && estimatedAmount === null) {
    fieldErrors.amount = "Enter an amount, or an estimated amount for variable bills.";
  }
  if (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 31) {
    fieldErrors.reminder_days = "Reminder days must be between 0 and 31.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      if (accountId !== null) {
        const account = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE user_id = $1 AND id = $2 AND is_active = 1`,
          [user.user_id, accountId]
        );
        if (account.rowCount !== 1) {
          throw new Error("INVALID_ACCOUNT");
        }
      }
      if (categoryId !== null) {
        const category = await client.query<{ id: string }>(
          `SELECT id FROM categories
           WHERE id = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
          [categoryId, user.user_id]
        );
        if (category.rowCount !== 1) {
          throw new Error("INVALID_CATEGORY");
        }
      }
      await client.query(
        `INSERT INTO bills
           (user_id, name, amount, estimated_amount, due_day, frequency,
            account_id, category_id, reminder_days, is_autopay, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          user.user_id, name, amount, estimatedAmount, dueDay, frequency,
          accountId, categoryId, reminderDays, isAutopay, notes,
        ]
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist or is inactive." } },
        400
      );
    }
    if (err instanceof Error && err.message === "INVALID_CATEGORY") {
      return c.json(
        { fieldErrors: { category_id: "This category doesn't exist." } },
        400
      );
    }
    console.error("[api] create bill failed:", err);
    return c.json({ error: "Could not create the bill. Please try again." }, 500);
  }

  return c.json({ success: true });
});

bills.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `${BILL_SELECT} WHERE b.user_id = $1 ORDER BY b.due_day, b.name`,
      [user.user_id]
    )
  );
  const rows = result.rows.map(toBill);

  const header = [
    "Name", "Amount", "Due Day", "Frequency", "Account", "Status", "Last Paid Date",
  ];
  const csvRows = rows.map((b) => [
    b.name,
    String(b.amount ?? b.estimated_amount ?? ""),
    String(b.due_day),
    b.frequency,
    b.account_name ?? "",
    b.current_period_status,
    b.last_paid_date ?? "",
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bills-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

bills.get("/calendar", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT id, name, amount, estimated_amount, due_day, current_period_status
       FROM bills WHERE user_id = $1 AND is_active = 1
       ORDER BY due_day, name`,
      [user.user_id]
    )
  );

  const today = startOfToday();
  const horizon = new Date(today.getTime() + 30 * 86400000);
  const events = result.rows
    .map((row) => {
      const due = nextDueDate(row.due_day, today);
      if (due > horizon) return null;
      return {
        bill_id: row.id,
        name: row.name,
        amount: Number(row.amount ?? row.estimated_amount ?? 0),
        due_date: isoDate(due),
        days_until: daysUntil(due),
        status: row.current_period_status,
      };
    })
    .filter((event): event is NonNullable<typeof event> => event !== null)
    .sort((a, b) => a.days_until - b.days_until);

  return c.json({ events });
});

bills.get("/upcoming", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT id, name, amount, estimated_amount, due_day, current_period_status
       FROM bills WHERE user_id = $1 AND is_active = 1`,
      [user.user_id]
    )
  );

  const today = startOfToday();
  const items = result.rows
    .map((row) => {
      const due = nextDueDate(row.due_day, today);
      const days = daysUntil(due);
      if (row.current_period_status === "overdue") return { row, due, days };
      if (row.current_period_status === "due_soon") return { row, due, days };
      if (days <= 7) return { row, due, days };
      return null;
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .map(({ row, due, days }) => ({
      bill_id: row.id,
      name: row.name,
      amount: Number(row.amount ?? row.estimated_amount ?? 0),
      due_date: isoDate(due),
      days_until: days,
      status: row.current_period_status,
    }))
    .sort((a, b) => a.days_until - b.days_until);

  return c.json({ items });
});

bills.get("/overview", requireAuth, async (c) => {
  const user = c.get("user");
  const overview = await withUser(user.user_id, async (client) => {
    const billResult = await client.query(
      `SELECT id, name, amount, estimated_amount, due_day, frequency, current_period_status
       FROM bills WHERE user_id = $1 AND is_active = 1`,
      [user.user_id]
    );
    const subResult = await client.query(
      `SELECT id, service_name, amount, frequency, next_renewal_date, status
       FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
      [user.user_id]
    );

    const today = startOfToday();
    const billsTotal = billResult.rows.reduce(
      (sum, row) => sum + monthlyObligation(row.amount, row.estimated_amount, row.frequency),
      0
    );
    const subsTotal = subResult.rows.reduce(
      (sum, row) => {
        const multiplier: Record<string, number> = {
          monthly: 1,
          quarterly: 1 / 3,
          annual: 1 / 12,
        };
        return sum + Number(row.amount) * (multiplier[row.frequency] ?? 1);
      },
      0
    );

    const dueThisWeek = billResult.rows.filter((row) => {
      const due = nextDueDate(row.due_day, today);
      return daysUntil(due) <= 7;
    }).length;

    const overdueCount = billResult.rows.filter(
      (row) => row.current_period_status === "overdue"
    ).length;

    const upcoming: DueItem[] = [
      ...billResult.rows.map((row) => ({
        type: "bill" as const,
        id: row.id,
        label: row.name,
        amount: Number(row.amount ?? row.estimated_amount ?? 0),
        due_date: isoDate(nextDueDate(row.due_day, today)),
        status: row.current_period_status,
      })),
      ...subResult.rows.map((row) => ({
        type: "subscription" as const,
        id: row.id,
        label: row.service_name,
        amount: Number(row.amount),
        due_date: isoDate(row.next_renewal_date),
        status: row.status,
      })),
    ]
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, 5);

    const overview: BillOverview = {
      total_monthly_obligation: billsTotal + subsTotal,
      due_this_week: dueThisWeek,
      overdue_count: overdueCount,
      upcoming,
    };
    return overview;
  });

  return c.json({ overview });
});

bills.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(`${BILL_SELECT} WHERE b.user_id = $1 AND b.id = $2`, [
      user.user_id,
      c.req.param("id"),
    ])
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ bill: toBill(result.rows[0]) });
});

bills.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const amount = body.amount === undefined ? undefined : parseAmount(body.amount);
  const estimatedAmount =
    body.estimated_amount === undefined ? undefined : parseAmount(body.estimated_amount);
  const dueDay = body.due_day === undefined ? undefined : Number(body.due_day);
  const frequency = body.frequency === undefined ? undefined : String(body.frequency);
  const accountId = body.account_id === undefined ? undefined : String(body.account_id ?? "") || null;
  const categoryId = body.category_id === undefined ? undefined : String(body.category_id ?? "") || null;
  const reminderDays = body.reminder_days === undefined ? undefined : Number(body.reminder_days);
  const isAutopay = body.is_autopay === undefined ? undefined : body.is_autopay === true || body.is_autopay === 1 ? 1 : 0;
  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name !== undefined && !name) {
    fieldErrors.name = "Please enter a bill name.";
  }
  if (dueDay !== undefined && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
    fieldErrors.due_day = "Due day must be between 1 and 31.";
  }
  if (frequency !== undefined && !(BILL_FREQUENCIES as readonly string[]).includes(frequency)) {
    fieldErrors.frequency = "Please choose a valid frequency.";
  }
  if (amount !== undefined && (amount === null || amount <= 0)) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (estimatedAmount !== undefined && (estimatedAmount === null || estimatedAmount <= 0)) {
    fieldErrors.estimated_amount = "Please enter an amount greater than zero.";
  }
  if (reminderDays !== undefined && (!Number.isInteger(reminderDays) || reminderDays < 0 || reminderDays > 31)) {
    fieldErrors.reminder_days = "Reminder days must be between 0 and 31.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const ok = await withUser(user.user_id, async (client) => {
      if (accountId !== undefined && accountId !== null) {
        const account = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE user_id = $1 AND id = $2 AND is_active = 1`,
          [user.user_id, accountId]
        );
        if (account.rowCount !== 1) {
          throw new Error("INVALID_ACCOUNT");
        }
      }
      if (categoryId !== undefined && categoryId !== null) {
        const category = await client.query<{ id: string }>(
          `SELECT id FROM categories
           WHERE id = $1 AND ((user_id IS NULL AND is_system = 1) OR user_id = $2)`,
          [categoryId, user.user_id]
        );
        if (category.rowCount !== 1) {
          throw new Error("INVALID_CATEGORY");
        }
      }
      const result = await client.query(
        `UPDATE bills SET
           name = COALESCE($3, name),
           amount = COALESCE($4, amount),
           estimated_amount = COALESCE($5, estimated_amount),
           due_day = COALESCE($6, due_day),
           frequency = COALESCE($7, frequency),
           account_id = COALESCE($8, account_id),
           category_id = COALESCE($9, category_id),
           reminder_days = COALESCE($10, reminder_days),
           is_autopay = COALESCE($11, is_autopay),
           notes = COALESCE($12, notes),
           version = version + 1
         WHERE user_id = $1 AND id = $2 AND version = $13
         RETURNING id`,
        [
          user.user_id, id,
          name ?? null, amount ?? null, estimatedAmount ?? null,
          dueDay ?? null, frequency ?? null, accountId ?? null,
          categoryId ?? null, reminderDays ?? null, isAutopay ?? null,
          notes ?? null, version,
        ]
      );
      return result.rowCount === 1;
    });
    if (!ok) {
      const exists = await withUser(user.user_id, (client) =>
        client.query(`SELECT id FROM bills WHERE user_id = $1 AND id = $2`, [
          user.user_id,
          id,
        ])
      );
      return c.json(
        exists.rowCount === 1
          ? { error: "This bill was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        exists.rowCount === 1 ? 409 : 404
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist or is inactive." } },
        400
      );
    }
    if (err instanceof Error && err.message === "INVALID_CATEGORY") {
      return c.json(
        { fieldErrors: { category_id: "This category doesn't exist." } },
        400
      );
    }
    console.error("[api] update bill failed:", err);
    return c.json({ error: "Could not update the bill. Please try again." }, 500);
  }

  return c.json({ success: true });
});

bills.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE bills SET is_active = 0, version = version + 1
       WHERE user_id = $1 AND id = $2 AND is_active = 1
       RETURNING id`,
      [user.user_id, id]
    )
  );
  if (result.rowCount !== 1) {
    const exists = await withUser(user.user_id, (client) =>
      client.query(`SELECT id, is_active FROM bills WHERE user_id = $1 AND id = $2`, [
        user.user_id,
        id,
      ])
    );
    if (exists.rowCount !== 1) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "The bill is already deactivated." }, 409);
  }

  return c.json({ success: true });
});

bills.post("/:id/reactivate", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE bills SET is_active = 1, version = version + 1
       WHERE user_id = $1 AND id = $2 AND is_active = 0
       RETURNING id`,
      [user.user_id, id]
    )
  );
  if (result.rowCount !== 1) {
    const exists = await withUser(user.user_id, (client) =>
      client.query(`SELECT id, is_active FROM bills WHERE user_id = $1 AND id = $2`, [
        user.user_id,
        id,
      ])
    );
    if (exists.rowCount !== 1) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "The bill is already active." }, 409);
  }

  return c.json({ success: true });
});

bills.post("/:id/mark-paid", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const amountOverride = parseAmount(body.amount);
  const accountId = String(body.account_id ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (amountOverride !== null && amountOverride <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      const billResult = await client.query<{
        id: string;
        name: string;
        amount: string | null;
        category_id: string | null;
        account_id: string | null;
        frequency: string;
        current_period_status: string;
        is_active: number;
      }>(
        `SELECT id, name, amount, category_id, account_id, frequency, current_period_status, is_active
         FROM bills WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (billResult.rowCount !== 1) {
        throw new Error("NOT_FOUND");
      }
      const bill = billResult.rows[0];
      if (bill.is_active !== 1) {
        throw new Error("INACTIVE");
      }
      if (bill.current_period_status === "paid") {
        throw new Error("ALREADY_PAID");
      }

      let amount = bill.amount === null ? amountOverride : Number(bill.amount);
      if (bill.amount === null && (amount === null || amount <= 0)) {
        throw new Error("AMOUNT_REQUIRED");
      }

      const payAccountId = accountId ?? bill.account_id;
      if (!payAccountId) {
        throw new Error("ACCOUNT_REQUIRED");
      }
      const account = await client.query<{ id: string }>(
        `SELECT id FROM accounts WHERE user_id = $1 AND id = $2 AND is_active = 1`,
        [user.user_id, payAccountId]
      );
      if (account.rowCount !== 1) {
        throw new Error("INVALID_ACCOUNT");
      }

      const { label, month, year } = currentPeriod();
      const transaction = await client.query<{ id: string }>(
        `INSERT INTO transactions
           (user_id, account_id, type, amount, description, category_id, date, notes,
            source, created_by, updated_by)
         VALUES ($1, $2, 'expense', $3, $4, $5, CURRENT_DATE, $6, 'bill', $1, $1)
         RETURNING id`,
        [
          user.user_id, payAccountId, amount,
          `${bill.name} — ${monthName(year, month)}`,
          bill.category_id, notes,
        ]
      );

      await client.query(
        `INSERT INTO payment_history
           (user_id, payable_type, payable_id, transaction_id, amount,
            period_label, period_month, period_year, notes)
         VALUES ($1, 'bill', $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.user_id, id, transaction.rows[0].id, amount,
          label, month, year, notes,
        ]
      );

      await client.query(
        `UPDATE bills
         SET current_period_status = 'paid',
             is_active = CASE WHEN frequency = 'one_time' THEN 0 ELSE is_active END,
             version = version + 1
         WHERE id = $1`,
        [id]
      );
    });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        INACTIVE: [409, { error: "The bill is deactivated." }],
        ALREADY_PAID: [409, { error: "This bill is already marked as paid for the current period." }],
        AMOUNT_REQUIRED: [400, { fieldErrors: { amount: "Enter the actual amount paid for this variable bill." } }],
        ACCOUNT_REQUIRED: [400, { fieldErrors: { account_id: "Choose the account this bill was paid from." } }],
        INVALID_ACCOUNT: [400, { fieldErrors: { account_id: "This account doesn't exist or is inactive." } }],
      };
      const entry = map[err.message];
      if (entry) {
        return c.json(entry[1], entry[0] as 400 | 404 | 409);
      }
    }
    console.error("[api] mark bill paid failed:", err);
    return c.json({ error: "Could not record the payment. Please try again." }, 500);
  }

  return c.json({ success: true });
});

bills.post("/:id/skip", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  try {
    await withUser(user.user_id, async (client) => {
      const billResult = await client.query<{
        id: string;
        is_active: number;
        current_period_status: string;
      }>(
        `SELECT id, is_active, current_period_status FROM bills
         WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (billResult.rowCount !== 1) {
        throw new Error("NOT_FOUND");
      }
      const bill = billResult.rows[0];
      if (bill.is_active !== 1) {
        throw new Error("INACTIVE");
      }
      if (bill.current_period_status === "paid") {
        throw new Error("ALREADY_PAID");
      }
      if (bill.current_period_status === "skipped") {
        throw new Error("ALREADY_SKIPPED");
      }
      await client.query(
        `UPDATE bills SET current_period_status = 'skipped', version = version + 1
         WHERE id = $1`,
        [id]
      );
    });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        INACTIVE: [409, { error: "The bill is deactivated." }],
        ALREADY_PAID: [409, { error: "A paid bill can't be skipped." }],
        ALREADY_SKIPPED: [409, { error: "This period is already skipped." }],
      };
      const entry = map[err.message];
      if (entry) {
        return c.json(entry[1], entry[0] as 400 | 404 | 409);
      }
    }
    console.error("[api] skip bill failed:", err);
    return c.json({ error: "Could not skip the bill. Please try again." }, 500);
  }

  return c.json({ success: true });
});

bills.patch("/:id/autopay", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const isAutopay = body.is_autopay === true || body.is_autopay === 1 ? 1 : 0;
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE bills SET is_autopay = $3, version = version + 1
       WHERE user_id = $1 AND id = $2 AND is_active = 1
       RETURNING id`,
      [user.user_id, id, isAutopay]
    )
  );
  if (result.rowCount !== 1) {
    const exists = await withUser(user.user_id, (client) =>
      client.query(`SELECT id FROM bills WHERE user_id = $1 AND id = $2`, [
        user.user_id,
        id,
      ])
    );
    if (exists.rowCount !== 1) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "The bill is deactivated." }, 409);
  }

  return c.json({ success: true });
});

bills.get("/:id/payments", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const exists = await withUser(user.user_id, (client) =>
    client.query(`SELECT id FROM bills WHERE user_id = $1 AND id = $2`, [
      user.user_id,
      id,
    ])
  );
  if (exists.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT id, payable_type, payable_id, transaction_id, amount, period_label,
              period_month, period_year, notes, created_at
       FROM payment_history
       WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2
       ORDER BY period_year DESC, period_month DESC, created_at DESC`,
      [user.user_id, id]
    )
  );
  return c.json({ payments: result.rows.map(toPaymentRow) });
});

bills.get("/:id/payments/yoy", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const exists = await withUser(user.user_id, (client) =>
    client.query(`SELECT id FROM bills WHERE user_id = $1 AND id = $2`, [
      user.user_id,
      id,
    ])
  );
  if (exists.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const { month, year } = currentPeriod();
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT period_year, COALESCE(SUM(amount), 0)::numeric(12,2) AS total
       FROM payment_history
       WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2
         AND period_month = $3 AND period_year IN ($4, $5)
       GROUP BY period_year`,
      [user.user_id, id, month, year, year - 1]
    )
  );
  const totals: Record<number, number> = {};
  for (const row of result.rows) {
    totals[row.period_year] = Number(row.total);
  }
  return c.json({
    current: { year, total: totals[year] ?? 0 },
    previous: { year: year - 1, total: totals[year - 1] ?? 0 },
  });
});

bills.get("/:id/payments/export", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const exists = await withUser(user.user_id, (client) =>
    client.query(`SELECT id FROM bills WHERE user_id = $1 AND id = $2`, [
      user.user_id,
      id,
    ])
  );
  if (exists.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT amount, period_label, notes, created_at
       FROM payment_history
       WHERE user_id = $1 AND payable_type = 'bill' AND payable_id = $2
       ORDER BY period_year, period_month`,
      [user.user_id, id]
    )
  );

  const header = ["Period", "Date", "Amount", "Notes"];
  const csvRows = result.rows.map((row) => [
    row.period_label,
    row.created_at.toISOString().slice(0, 10),
    Number(row.amount).toFixed(2),
    row.notes ?? "",
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bill-payments-${id}.csv"`,
    },
  });
});

export { bills };