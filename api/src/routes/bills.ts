import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import {
  BILL_FREQUENCIES,
  billExists,
  deactivateBill,
  getBill,
  getBillActivation,
  getBillForPayment,
  getBillForSkip,
  getBillPaymentsYoY,
  insertBill,
  insertBillPaymentTransaction,
  listActiveBillObligations,
  listActiveBillsForScheduling,
  listActiveSubscriptionRenewals,
  listBillPayments,
  listBillPaymentsForExport,
  listBills,
  markBillPeriodPaid,
  reactivateBill,
  setBillAutopay,
  skipBillPeriod,
  updateBill,
} from "../queries/bills";
import type {
  BillOverview,
  DueItem,
} from "../queries/bills";
import {
  activeAccountExists,
  categoryReferenceExists,
} from "../queries/references";
import { insertPaymentHistory } from "../queries/subscriptions";

const bills = new Hono();

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

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
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

function toCsv(header: string[], rows: (string | number)[][]): string {
  return (
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n")
  );
}

bills.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ bills: await listBills(user.user_id) });
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
      if (accountId !== null && !(await activeAccountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (categoryId !== null && !(await categoryReferenceExists(categoryId, user.user_id, client))) {
        throw new Error("INVALID_CATEGORY");
      }
      await insertBill(client, {
        userId: user.user_id,
        name,
        amount,
        estimatedAmount,
        dueDay,
        frequency,
        accountId,
        categoryId,
        reminderDays,
        isAutopay,
        notes,
      });
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
  const rows = await listBills(user.user_id);

  const csv = toCsv(
    ["Name", "Amount", "Due Day", "Frequency", "Account", "Status", "Last Paid Date"],
    rows.map((b) => [
      b.name,
      String(b.amount ?? b.estimated_amount ?? ""),
      String(b.due_day),
      b.frequency,
      b.account_name ?? "",
      b.current_period_status,
      b.last_paid_date ?? "",
    ])
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bills-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

bills.get("/calendar", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await listActiveBillsForScheduling(user.user_id);

  const today = startOfToday();
  const horizon = new Date(today.getTime() + 30 * 86400000);
  const events = rows
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
  const rows = await listActiveBillsForScheduling(user.user_id, undefined, false);

  const today = startOfToday();
  const items = rows
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

  const [billRows, subRows] = [
    await listActiveBillObligations(user.user_id),
    await listActiveSubscriptionRenewals(user.user_id),
  ];

  const today = startOfToday();
  const billsTotal = billRows.reduce(
    (sum, row) => sum + monthlyObligation(row.amount, row.estimated_amount, row.frequency),
    0
  );
  const subsTotal = subRows.reduce(
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

  const dueThisWeek = billRows.filter((row) => {
    const due = nextDueDate(row.due_day, today);
    return daysUntil(due) <= 7;
  }).length;

  const overdueCount = billRows.filter(
    (row) => row.current_period_status === "overdue"
  ).length;

  const upcoming: DueItem[] = [
    ...billRows.map((row) => ({
      type: "bill" as const,
      id: row.id,
      label: row.name,
      amount: Number(row.amount ?? row.estimated_amount ?? 0),
      due_date: isoDate(nextDueDate(row.due_day, today)),
      status: row.current_period_status,
    })),
    ...subRows.map((row) => ({
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

  return c.json({ overview });
});

bills.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const bill = await getBill(user.user_id, c.req.param("id"));
  if (!bill) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ bill });
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
      if (accountId !== undefined && accountId !== null &&
          !(await activeAccountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (categoryId !== undefined && categoryId !== null &&
          !(await categoryReferenceExists(categoryId, user.user_id, client))) {
        throw new Error("INVALID_CATEGORY");
      }
      return updateBill(client, {
        userId: user.user_id,
        id,
        name: name ?? null,
        amount: amount ?? null,
        estimatedAmount: estimatedAmount ?? null,
        dueDay: dueDay ?? null,
        frequency: frequency ?? null,
        accountId: accountId ?? null,
        categoryId: categoryId ?? null,
        reminderDays: reminderDays ?? null,
        isAutopay: isAutopay ?? null,
        notes: notes ?? null,
        version,
      });
    });
    if (!ok) {
      const existing = await getBillActivation(user.user_id, id);
      return c.json(
        existing
          ? { error: "This bill was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        existing ? 409 : 404
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
    deactivateBill(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    const existing = await getBillActivation(user.user_id, id);
    if (!existing) {
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
    reactivateBill(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    const existing = await getBillActivation(user.user_id, id);
    if (!existing) {
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
      const bill = await getBillForPayment(client, user.user_id, id);
      if (!bill) {
        throw new Error("NOT_FOUND");
      }
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
      const paidAmount = amount as number;

      const payAccountId = accountId ?? bill.account_id;
      if (!payAccountId) {
        throw new Error("ACCOUNT_REQUIRED");
      }
      if (!(await activeAccountExists(payAccountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }

      const { label, month, year } = currentPeriod();
      const transactionId = await insertBillPaymentTransaction(client, {
        userId: user.user_id,
        accountId: payAccountId,
        amount: paidAmount,
        description: `${bill.name} — ${monthName(year, month)}`,
        categoryId: bill.category_id,
        notes,
      });

      await insertPaymentHistory(client, {
        userId: user.user_id,
        payableType: "bill",
        payableId: id,
        transactionId,
        amount: paidAmount,
        periodLabel: label,
        periodMonth: month,
        periodYear: year,
        notes,
      });

      await markBillPeriodPaid(client, user.user_id, id);
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
      const bill = await getBillForSkip(client, user.user_id, id);
      if (!bill) {
        throw new Error("NOT_FOUND");
      }
      if (bill.is_active !== 1) {
        throw new Error("INACTIVE");
      }
      if (bill.current_period_status === "paid") {
        throw new Error("ALREADY_PAID");
      }
      if (bill.current_period_status === "skipped") {
        throw new Error("ALREADY_SKIPPED");
      }
      await skipBillPeriod(client, user.user_id, id);
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
    setBillAutopay(client, user.user_id, id, isAutopay)
  );
  if (result.rowCount !== 1) {
    const existing = await getBillActivation(user.user_id, id);
    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "The bill is deactivated." }, 409);
  }

  return c.json({ success: true });
});

bills.get("/:id/payments", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!(await billExists(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ payments: await listBillPayments(user.user_id, id) });
});

bills.get("/:id/payments/yoy", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!(await billExists(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }

  const { month, year } = currentPeriod();
  const totals = await getBillPaymentsYoY(user.user_id, id, month, year);
  return c.json({
    current: { year, total: totals[year] ?? 0 },
    previous: { year: year - 1, total: totals[year - 1] ?? 0 },
  });
});

bills.get("/:id/payments/export", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!(await billExists(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }

  const rows = await listBillPaymentsForExport(user.user_id, id);

  const csv = toCsv(
    ["Period", "Date", "Amount", "Notes"],
    rows.map((row) => [
      row.period_label,
      row.date,
      row.amount.toFixed(2),
      row.notes ?? "",
    ])
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bill-payments-${id}.csv"`,
    },
  });
});

export { bills };
