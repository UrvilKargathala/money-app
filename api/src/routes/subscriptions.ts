import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import type { PaymentHistoryRow } from "./bills";

const subscriptions = new Hono();

export const SUBSCRIPTION_FREQUENCIES = ["monthly", "quarterly", "annual"] as const;

export type Subscription = {
  id: string;
  service_name: string;
  amount: number;
  frequency: string;
  monthly_equivalent: number;
  next_renewal_date: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  notes: string | null;
  version: number;
  days_until_renewal: number;
  last_paid_date: string | null;
  last_paid_amount: number | null;
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

function startOfToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function daysUntil(date: Date): number {
  return Math.round((date.getTime() - startOfToday().getTime()) / 86400000);
}

function monthlyEquivalent(amount: number, frequency: string): number {
  const multiplier: Record<string, number> = {
    monthly: 1,
    quarterly: 1 / 3,
    annual: 1 / 12,
  };
  return amount * (multiplier[frequency] ?? 1);
}

function addMonths(date: Date, months: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth() + months;
  const target = new Date(year, month, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(date.getDate(), lastDay)
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toSubscription(row: {
  id: string;
  service_name: string;
  amount: string;
  frequency: string;
  next_renewal_date: Date;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  status: string;
  notes: string | null;
  version: number;
  last_paid_date: Date | null;
  last_paid_amount: string | null;
}): Subscription {
  const amount = Number(row.amount);
  return {
    ...row,
    amount,
    monthly_equivalent: monthlyEquivalent(amount, row.frequency),
    next_renewal_date: isoDate(row.next_renewal_date),
    days_until_renewal: daysUntil(row.next_renewal_date),
    last_paid_date:
      row.last_paid_date === null ? null : row.last_paid_date.toISOString().slice(0, 10),
    last_paid_amount:
      row.last_paid_amount === null ? null : Number(row.last_paid_amount),
  };
}

const SUB_SELECT = `
  SELECT s.id, s.service_name, s.amount, s.frequency, s.next_renewal_date,
         s.account_id, a.name AS account_name,
         s.category_id, cat.name AS category_name,
         s.status, s.notes, s.version,
         ph.created_at AS last_paid_date, ph.amount AS last_paid_amount
  FROM subscriptions s
  LEFT JOIN accounts a ON a.id = s.account_id
  LEFT JOIN categories cat ON cat.id = s.category_id
  LEFT JOIN LATERAL (
    SELECT created_at, amount FROM payment_history
    WHERE user_id = s.user_id AND payable_type = 'subscription' AND payable_id = s.id
    ORDER BY created_at DESC LIMIT 1
  ) ph ON true
`;

subscriptions.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `${SUB_SELECT} WHERE s.user_id = $1
       ORDER BY s.status, s.next_renewal_date`,
      [user.user_id]
    )
  );
  return c.json({ subscriptions: result.rows.map(toSubscription) });
});

subscriptions.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const serviceName = String(body.service_name ?? "").trim();
  const amount = parseAmount(body.amount);
  const frequency = String(body.frequency ?? "");
  const nextRenewalDate = String(body.next_renewal_date ?? "");
  const accountId = String(body.account_id ?? "") || null;
  const categoryId = String(body.category_id ?? "") || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!serviceName) {
    fieldErrors.service_name = "Please enter the service name.";
  }
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (!(SUBSCRIPTION_FREQUENCIES as readonly string[]).includes(frequency)) {
    fieldErrors.frequency = "Please choose a valid frequency.";
  }
  if (!isValidDate(nextRenewalDate)) {
    fieldErrors.next_renewal_date = "Choose a valid renewal date.";
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
        `INSERT INTO subscriptions
           (user_id, service_name, amount, frequency, next_renewal_date,
            account_id, category_id, notes)
         VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8)`,
        [
          user.user_id, serviceName, amount, frequency, nextRenewalDate,
          accountId, categoryId, notes,
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
    console.error("[api] create subscription failed:", err);
    return c.json(
      { error: "Could not create the subscription. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

subscriptions.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `${SUB_SELECT} WHERE s.user_id = $1
       ORDER BY s.status, s.next_renewal_date`,
      [user.user_id]
    )
  );
  const rows = result.rows.map(toSubscription);

  const header = [
    "Service Name", "Amount", "Frequency", "Monthly Equivalent",
    "Next Renewal", "Status",
  ];
  const csvRows = rows.map((s) => [
    s.service_name,
    s.amount.toFixed(2),
    s.frequency,
    s.monthly_equivalent.toFixed(2),
    s.next_renewal_date,
    s.status,
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscriptions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

subscriptions.get("/due-renewals", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT id, service_name, amount, next_renewal_date, status
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'
         AND next_renewal_date <= CURRENT_DATE + INTERVAL '7 days'
       ORDER BY next_renewal_date`,
      [user.user_id]
    )
  );
  return c.json({
    items: result.rows.map((row) => ({
      id: row.id,
      service_name: row.service_name,
      amount: Number(row.amount),
      next_renewal_date: isoDate(row.next_renewal_date),
      days_until_renewal: daysUntil(row.next_renewal_date),
    })),
  });
});

subscriptions.get("/monthly-burn", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT COALESCE(SUM(
         CASE frequency
           WHEN 'monthly' THEN amount
           WHEN 'quarterly' THEN amount / 3
           WHEN 'annual' THEN amount / 12
         END
       ), 0)::numeric(12,2) AS monthly_burn
       FROM subscriptions
       WHERE user_id = $1 AND status = 'active'`,
      [user.user_id]
    )
  );
  return c.json({ monthly_burn: Number(result.rows[0].monthly_burn) });
});

subscriptions.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    client.query(`${SUB_SELECT} WHERE s.user_id = $1 AND s.id = $2`, [
      user.user_id,
      c.req.param("id"),
    ])
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ subscription: toSubscription(result.rows[0]) });
});

subscriptions.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const serviceName = body.service_name === undefined ? undefined : String(body.service_name).trim();
  const amount = body.amount === undefined ? undefined : parseAmount(body.amount);
  const frequency = body.frequency === undefined ? undefined : String(body.frequency);
  const nextRenewalDate = body.next_renewal_date === undefined ? undefined : String(body.next_renewal_date);
  const accountId = body.account_id === undefined ? undefined : String(body.account_id ?? "") || null;
  const categoryId = body.category_id === undefined ? undefined : String(body.category_id ?? "") || null;
  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (serviceName !== undefined && !serviceName) {
    fieldErrors.service_name = "Please enter the service name.";
  }
  if (amount !== undefined && (amount === null || amount <= 0)) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (frequency !== undefined && !(SUBSCRIPTION_FREQUENCIES as readonly string[]).includes(frequency)) {
    fieldErrors.frequency = "Please choose a valid frequency.";
  }
  if (nextRenewalDate !== undefined && !isValidDate(nextRenewalDate)) {
    fieldErrors.next_renewal_date = "Choose a valid renewal date.";
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
        `UPDATE subscriptions SET
           service_name = COALESCE($3, service_name),
           amount = COALESCE($4, amount),
           frequency = COALESCE($5, frequency),
           next_renewal_date = COALESCE($6::date, next_renewal_date),
           account_id = COALESCE($7, account_id),
           category_id = COALESCE($8, category_id),
           notes = COALESCE($9, notes),
           version = version + 1
         WHERE user_id = $1 AND id = $2 AND version = $10
         RETURNING id`,
        [
          user.user_id, id,
          serviceName ?? null, amount ?? null, frequency ?? null,
          nextRenewalDate ?? null, accountId ?? null, categoryId ?? null,
          notes ?? null, version,
        ]
      );
      return result.rowCount === 1;
    });
    if (!ok) {
      const exists = await withUser(user.user_id, (client) =>
        client.query(`SELECT id FROM subscriptions WHERE user_id = $1 AND id = $2`, [
          user.user_id,
          id,
        ])
      );
      return c.json(
        exists.rowCount === 1
          ? { error: "This subscription was modified elsewhere. Refresh and try again." }
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
    console.error("[api] update subscription failed:", err);
    return c.json(
      { error: "Could not update the subscription. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

subscriptions.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE subscriptions SET status = 'cancelled', version = version + 1
       WHERE user_id = $1 AND id = $2 AND status <> 'cancelled'
       RETURNING id`,
      [user.user_id, id]
    )
  );
  if (result.rowCount !== 1) {
    const exists = await withUser(user.user_id, (client) =>
      client.query(`SELECT id, status FROM subscriptions WHERE user_id = $1 AND id = $2`, [
        user.user_id,
        id,
      ])
    );
    if (exists.rowCount !== 1) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "The subscription is already cancelled." }, 409);
  }

  return c.json({ success: true });
});

subscriptions.post("/:id/pause", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE subscriptions SET status = 'paused', version = version + 1
       WHERE user_id = $1 AND id = $2 AND status = 'active'
       RETURNING id`,
      [user.user_id, id]
    )
  );
  if (result.rowCount !== 1) {
    const exists = await withUser(user.user_id, (client) =>
      client.query(`SELECT id, status FROM subscriptions WHERE user_id = $1 AND id = $2`, [
        user.user_id,
        id,
      ])
    );
    if (exists.rowCount !== 1) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(
      { error: "Only active subscriptions can be paused." },
      409
    );
  }

  return c.json({ success: true });
});

subscriptions.post("/:id/resume", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `UPDATE subscriptions SET status = 'active', version = version + 1
       WHERE user_id = $1 AND id = $2 AND status = 'paused'
       RETURNING id`,
      [user.user_id, id]
    )
  );
  if (result.rowCount !== 1) {
    const exists = await withUser(user.user_id, (client) =>
      client.query(`SELECT id, status FROM subscriptions WHERE user_id = $1 AND id = $2`, [
        user.user_id,
        id,
      ])
    );
    if (exists.rowCount !== 1) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(
      { error: "Only paused subscriptions can be resumed." },
      409
    );
  }

  return c.json({ success: true });
});

subscriptions.post("/:id/renew", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const accountId = String(body.account_id ?? "").trim() || null;

  try {
    await withUser(user.user_id, async (client) => {
      const subResult = await client.query<{
        id: string;
        service_name: string;
        amount: string;
        frequency: string;
        next_renewal_date: Date;
        account_id: string | null;
        category_id: string | null;
        status: string;
      }>(
        `SELECT id, service_name, amount, frequency, next_renewal_date,
                account_id, category_id, status
         FROM subscriptions WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (subResult.rowCount !== 1) {
        throw new Error("NOT_FOUND");
      }
      const sub = subResult.rows[0];
      if (sub.status !== "active") {
        throw new Error("NOT_ACTIVE");
      }

      const payAccountId = accountId ?? sub.account_id;
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

      const amount = Number(sub.amount);
      const { label, month, year } = currentPeriod();
      const transaction = await client.query<{ id: string }>(
        `INSERT INTO transactions
           (user_id, account_id, type, amount, description, category_id, date, notes,
            source, created_by, updated_by)
         VALUES ($1, $2, 'expense', $3, $4, $5, CURRENT_DATE, NULL, 'subscription', $1, $1)
         RETURNING id`,
        [
          user.user_id, payAccountId, amount,
          `${sub.service_name} — ${monthName(year, month)}`,
          sub.category_id,
        ]
      );

      await client.query(
        `INSERT INTO payment_history
           (user_id, payable_type, payable_id, transaction_id, amount,
            period_label, period_month, period_year, notes)
         VALUES ($1, 'subscription', $2, $3, $4, $5, $6, $7, NULL)`,
        [
          user.user_id, id, transaction.rows[0].id, amount,
          label, month, year,
        ]
      );

      const step: Record<string, number> = { monthly: 1, quarterly: 3, annual: 12 };
      const nextDate = addMonths(sub.next_renewal_date, step[sub.frequency] ?? 1);
      await client.query(
        `UPDATE subscriptions
         SET next_renewal_date = $2::date, version = version + 1
         WHERE id = $1`,
        [id, isoDate(nextDate)]
      );
    });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        NOT_ACTIVE: [409, { error: "Only active subscriptions can be renewed." }],
        ACCOUNT_REQUIRED: [400, { fieldErrors: { account_id: "Choose the account charged for this renewal." } }],
        INVALID_ACCOUNT: [400, { fieldErrors: { account_id: "This account doesn't exist or is inactive." } }],
      };
      const entry = map[err.message];
      if (entry) {
        return c.json(entry[1], entry[0] as 400 | 404 | 409);
      }
    }
    console.error("[api] renew subscription failed:", err);
    return c.json(
      { error: "Could not record the renewal. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

subscriptions.get("/:id/payments", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const exists = await withUser(user.user_id, (client) =>
    client.query(`SELECT id FROM subscriptions WHERE user_id = $1 AND id = $2`, [
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
       WHERE user_id = $1 AND payable_type = 'subscription' AND payable_id = $2
       ORDER BY period_year DESC, period_month DESC, created_at DESC`,
      [user.user_id, id]
    )
  );
  return c.json({ payments: result.rows.map(toPaymentRow) });
});

subscriptions.get("/:id/payments/export", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const exists = await withUser(user.user_id, (client) =>
    client.query(`SELECT id FROM subscriptions WHERE user_id = $1 AND id = $2`, [
      user.user_id,
      id,
    ])
  );
  if (exists.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  const result = await withUser(user.user_id, (client) =>
    client.query(
      `SELECT amount, period_label, created_at
       FROM payment_history
       WHERE user_id = $1 AND payable_type = 'subscription' AND payable_id = $2
       ORDER BY period_year, period_month`,
      [user.user_id, id]
    )
  );

  const header = ["Period", "Date", "Amount"];
  const csvRows = result.rows.map((row) => [
    row.period_label,
    row.created_at.toISOString().slice(0, 10),
    Number(row.amount).toFixed(2),
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscription-payments-${id}.csv"`,
    },
  });
});

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

export { subscriptions };