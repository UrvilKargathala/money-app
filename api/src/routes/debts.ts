import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import {
  addMonths,
  countDebtPayments,
  createDebt,
  deleteDebt,
  deletePayment,
  deriveMonths,
  getDashboard,
  getDebtById,
  getDebts,
  getDebtTypes,
  getDti,
  getHealthAlerts,
  getPaymentStatus,
  getPayments,
  getScheduleRows,
  insertPayment,
  isoDate,
  money,
  regenerateSchedule,
  replayPayments,
  setDebtActive,
  simulatePrepayment,
  simulateStrategies,
  splitPayment,
  updateDebt,
  updateDebtDerived,
  updatePayment,
} from "../queries/debts";
import type { Queryable } from "../queries/debts";

const debts = new Hono();

const DEBT_TYPES = [
  "home_loan",
  "car_loan",
  "personal_loan",
  "education_loan",
  "credit_card",
  "other",
];
const STRATEGIES = ["reduce_emi", "reduce_tenure"];

function isoDateStr(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return value;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Anchor for schedule regeneration: the most recent payment month (or the start date). */
async function scheduleAnchor(
  q: Queryable,
  userId: number,
  debtId: string,
  startDate: string
): Promise<string> {
  const result = await q.query<{ last: string | null }>(
    `SELECT MAX(date)::text AS last FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2`,
    [userId, debtId]
  );
  const last = result.rows[0]?.last;
  return last ?? startDate;
}

debts.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const rawTypes = String(c.req.query("type") ?? "");
  const rawStatus = String(c.req.query("status") ?? "");
  const types = rawTypes
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  if (types.some((t) => !DEBT_TYPES.includes(t))) {
    return c.json({ error: "Invalid type filter." }, 400);
  }
  if (rawStatus && !["active", "closed"].includes(rawStatus)) {
    return c.json({ error: "Invalid status filter." }, 400);
  }
  const list = await getDebts(
    user.user_id,
    types.length > 0 ? types : undefined,
    rawStatus ? (rawStatus as "active" | "closed") : undefined
  );
  return c.json({ debts: list });
});

debts.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const name = String(body.name ?? "").trim();
  const type = String(body.type ?? "");
  const lender = String(body.lender ?? "").trim() || null;
  const principalOriginal = parseAmount(body.principal_original);
  const principalOutstanding = parseAmount(body.principal_outstanding);
  const interestRate = parseAmount(body.interest_rate);
  const emiAmount = parseAmount(body.emi_amount);
  const minimumDue = parseAmount(body.minimum_due);
  const tenureMonths =
    body.tenure_months === undefined ||
    body.tenure_months === null ||
    body.tenure_months === ""
      ? null
      : Number(body.tenure_months);
  const rawStartDate = String(body.start_date ?? "");
  const startDate = rawStartDate === "" ? null : isoDateStr(rawStartDate);
  const accountId = String(body.account_id ?? "") || null;
  const notes = String(body.notes ?? "").trim() || null;
  const isCreditCard = type === "credit_card";

  const fieldErrors: Record<string, string> = {};
  if (!name) {
    fieldErrors.name = "Please enter a name for this debt.";
  }
  if (!DEBT_TYPES.includes(type)) {
    fieldErrors.type = "Please choose a debt type.";
  }
  if (interestRate === null || interestRate < 0) {
    fieldErrors.interest_rate = "Please enter a valid interest rate.";
  }
  if (principalOutstanding === null || principalOutstanding <= 0) {
    fieldErrors.principal_outstanding =
      "Please enter an outstanding amount greater than zero.";
  }
  if (!isCreditCard) {
    if (principalOriginal === null || principalOriginal <= 0) {
      fieldErrors.principal_original = "Please enter the original loan amount.";
    }
    if (
      principalOriginal !== null &&
      principalOutstanding !== null &&
      principalOutstanding > principalOriginal
    ) {
      fieldErrors.principal_outstanding =
        "The outstanding amount cannot exceed the original amount.";
    }
    if (emiAmount === null || emiAmount <= 0) {
      fieldErrors.emi_amount = "Please enter a monthly EMI amount.";
    }
    if (tenureMonths === null || !Number.isInteger(tenureMonths) || tenureMonths <= 0) {
      fieldErrors.tenure_months = "Please enter a tenure in months.";
    }
  } else if (emiAmount !== null && emiAmount <= 0) {
    fieldErrors.emi_amount = "The EMI amount must be greater than zero.";
  }
  if (minimumDue !== null && minimumDue !== undefined && minimumDue < 0) {
    fieldErrors.minimum_due = "The minimum due cannot be negative.";
  }
  if (startDate === null) {
    if (!isCreditCard) {
      fieldErrors.start_date = "Please choose a valid start date.";
    }
  } else if (rawStartDate !== "" && startDate === null) {
    fieldErrors.start_date = "Please choose a valid start date.";
  }
  if (accountId !== null && !validUuid(accountId)) {
    fieldErrors.account_id = "Please choose a valid account.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (accountId !== null) {
        const account = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE user_id = $1 AND id = $2`,
          [user.user_id, accountId]
        );
        if (account.rowCount !== 1) {
          throw new Error("INVALID_ACCOUNT");
        }
      }
      const outstanding = principalOutstanding as number;
      const rate = interestRate as number;
      const months =
        !isCreditCard && emiAmount !== null
          ? deriveMonths(outstanding, rate, emiAmount as number)
          : null;
      const effectiveStart = startDate ?? isoDate(new Date());
      const endDate =
        months !== null ? addMonths(effectiveStart, months) : null;
      const debtId = await createDebt(
        {
          userId: user.user_id,
          name,
          type,
          lender,
          principalOriginal: isCreditCard ? (principalOriginal ?? outstanding) : (principalOriginal as number),
          principalOutstanding: outstanding,
          interestRate: rate,
          emiAmount: emiAmount ?? null,
          minimumDue: minimumDue ?? null,
          tenureMonths: isCreditCard ? null : (tenureMonths as number),
          monthsRemaining: months,
          startDate: effectiveStart,
          endDate,
          accountId,
          notes,
        },
        client
      );
      await regenerateSchedule(
        client,
        user.user_id,
        debtId,
        outstanding,
        rate,
        emiAmount ?? null,
        effectiveStart
      );
      return debtId;
    });
    return c.json({ success: true, debt: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] create debt failed:", err);
    return c.json({ error: "Could not create the debt. Please try again." }, 500);
  }
});

debts.get("/dashboard", requireAuth, async (c) => {
  const user = c.get("user");
  const dashboard = await getDashboard(user.user_id);
  return c.json({ dashboard });
});

debts.get("/dti", requireAuth, async (c) => {
  const user = c.get("user");
  const dti = await getDti(user.user_id);
  return c.json({
    monthly_income: dti.monthly_income,
    total_monthly_emi: dti.total_monthly_emi,
    dti: dti.dti,
    level: dti.level,
    color: dti.color,
    income_missing: dti.monthly_income === null,
  });
});

debts.post("/strategies/compare", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const extraMonthly = parseAmount(body.extra_monthly);
  if (extraMonthly === null || extraMonthly <= 0) {
    return c.json(
      { fieldErrors: { extra_monthly: "Please enter an extra amount greater than zero." } },
      400
    );
  }
  const list = await getDebts(user.user_id, undefined, "active");
  const simDebts = list
    .filter((d) => d.emi_amount !== null || d.minimum_due !== null)
    .map((d) => ({
      id: d.id,
      outstanding: d.principal_outstanding,
      annualRate: d.interest_rate,
      requiredMonthly: d.emi_amount ?? d.minimum_due ?? 0,
    }));
  if (simDebts.length === 0) {
    return c.json({ error: "No active debts to compare." }, 400);
  }
  const simulation = simulateStrategies(simDebts, extraMonthly as number);
  return c.json({ extra_monthly: extraMonthly, ...simulation });
});

debts.get("/combined-timeline", requireAuth, async (c) => {
  const user = c.get("user");
  const list = await getDebts(user.user_id, undefined, "active");
  const sorted = [...list].sort(
    (a, b) =>
      (a.months_remaining ?? 0) - (b.months_remaining ?? 0) ||
      a.interest_rate - b.interest_rate
  );
  return c.json({
    combined: {
      total_outstanding: money(
        sorted.reduce((sum, d) => sum + d.principal_outstanding, 0)
      ),
      total_monthly_emi: money(sorted.reduce((sum, d) => sum + (d.emi_amount ?? 0), 0)),
      total_interest_remaining: money(
        sorted.reduce((sum, d) => sum + (d.remaining_interest ?? 0), 0)
      ),
      debt_free_date: sorted.reduce(
        (max: string | null, d) => (d.end_date && d.end_date > (max ?? "")) ? d.end_date : max,
        null
      ),
      active_count: sorted.length,
    },
    timeline: sorted.map((d) => ({
      debt_id: d.id,
      name: d.name,
      type: d.type,
      outstanding: d.principal_outstanding,
      emi_amount: d.emi_amount,
      interest_rate: d.interest_rate,
      months_remaining: d.months_remaining,
      payoff_date: d.end_date,
    })),
  });
});

debts.post("/combined/strategies", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const extraMonthly = parseAmount(body.extra_monthly);
  if (extraMonthly === null || extraMonthly <= 0) {
    return c.json(
      { fieldErrors: { extra_monthly: "Please enter an extra amount greater than zero." } },
      400
    );
  }
  const list = await getDebts(user.user_id, undefined, "active");
  const simDebts = list
    .filter((d) => d.emi_amount !== null || d.minimum_due !== null)
    .map((d) => ({
      id: d.id,
      outstanding: d.principal_outstanding,
      annualRate: d.interest_rate,
      requiredMonthly: d.emi_amount ?? d.minimum_due ?? 0,
    }));
  if (simDebts.length === 0) {
    return c.json({ error: "No active debts to compare." }, 400);
  }
  const simulation = simulateStrategies(simDebts, extraMonthly as number);
  return c.json({ extra_monthly: extraMonthly, ...simulation });
});

debts.get("/health-alerts", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await getHealthAlerts(user.user_id);
  return c.json(result);
});

debts.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const list = await getDebts(user.user_id);
  const header =
    "\uFEFFName,Type,Outstanding,Interest Rate,EMI,Tenure Months,Months Remaining,Total Interest Paid";
  const rows = list.map((d) =>
    [
      csvEscape(d.name),
      d.type,
      d.principal_outstanding,
      `${d.interest_rate}%`,
      d.emi_amount ?? "",
      d.tenure_months ?? "",
      d.months_remaining ?? "",
      d.total_interest_paid,
    ].join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="debts.csv"`,
    },
  });
});

debts.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const debt = await getDebtById(user.user_id, c.req.param("id"));
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ debt });
});

debts.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const name = body.name === undefined ? undefined : String(body.name).trim();
  const type = body.type === undefined ? undefined : String(body.type);
  const lender =
    body.lender === undefined ? undefined : String(body.lender).trim() || null;
  const principalOriginal =
    body.principal_original === undefined
      ? undefined
      : parseAmount(body.principal_original);
  const principalOutstanding =
    body.principal_outstanding === undefined
      ? undefined
      : parseAmount(body.principal_outstanding);
  const interestRate =
    body.interest_rate === undefined ? undefined : parseAmount(body.interest_rate);
  const emiAmount =
    body.emi_amount === undefined ? undefined : parseAmount(body.emi_amount);
  const minimumDue =
    body.minimum_due === undefined ? undefined : parseAmount(body.minimum_due);
  const tenureMonths =
    body.tenure_months === undefined
      ? undefined
      : body.tenure_months === null || body.tenure_months === ""
        ? null
        : Number(body.tenure_months);
  const startDate =
    body.start_date === undefined ? undefined : isoDateStr(String(body.start_date));
  const accountProvided = body.account_id !== undefined;
  const accountId =
    accountProvided && (body.account_id === "" || body.account_id === null)
      ? null
      : accountProvided
        ? String(body.account_id)
        : undefined;
  const notes =
    body.notes === undefined ? undefined : String(body.notes).trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (name !== undefined && !name) {
    fieldErrors.name = "Please enter a name for this debt.";
  }
  if (type !== undefined && !DEBT_TYPES.includes(type)) {
    fieldErrors.type = "Please choose a debt type.";
  }
  if (interestRate !== undefined && (interestRate === null || interestRate < 0)) {
    fieldErrors.interest_rate = "Please enter a valid interest rate.";
  }
  if (
    principalOutstanding !== undefined &&
    (principalOutstanding === null || principalOutstanding <= 0)
  ) {
    fieldErrors.principal_outstanding =
      "Please enter an outstanding amount greater than zero.";
  }
  if (
    principalOriginal !== undefined &&
    principalOriginal !== null &&
    principalOriginal <= 0
  ) {
    fieldErrors.principal_original = "Please enter the original loan amount.";
  }
  if (
    principalOriginal !== undefined &&
    principalOutstanding !== undefined &&
    principalOriginal !== null &&
    principalOutstanding !== null &&
    principalOutstanding > principalOriginal
  ) {
    fieldErrors.principal_outstanding =
      "The outstanding amount cannot exceed the original amount.";
  }
  if (emiAmount !== undefined && emiAmount !== null && emiAmount <= 0) {
    fieldErrors.emi_amount = "The EMI amount must be greater than zero.";
  }
  if (minimumDue !== undefined && minimumDue !== null && minimumDue < 0) {
    fieldErrors.minimum_due = "The minimum due cannot be negative.";
  }
  if (
    tenureMonths !== undefined &&
    tenureMonths !== null &&
    (!Number.isInteger(tenureMonths) || tenureMonths <= 0)
  ) {
    fieldErrors.tenure_months = "Please enter a tenure in months.";
  }
  if (startDate !== undefined && startDate === null) {
    fieldErrors.start_date = "Please choose a valid start date.";
  }
  if (accountProvided && accountId && !validUuid(accountId)) {
    fieldErrors.account_id = "Please choose a valid account.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM debts WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (existing.rowCount !== 1) {
        throw new Error("DEBT_NOT_FOUND");
      }
      if (accountId) {
        const account = await client.query<{ id: string }>(
          `SELECT id FROM accounts WHERE user_id = $1 AND id = $2`,
          [user.user_id, accountId]
        );
        if (account.rowCount !== 1) {
          throw new Error("INVALID_ACCOUNT");
        }
      }
      const updated = await updateDebt(
        {
          userId: user.user_id,
          id,
          name,
          type,
          lender,
          principalOriginal: principalOriginal ?? undefined,
          principalOutstanding: principalOutstanding ?? undefined,
          interestRate: interestRate ?? undefined,
          emiAmount: emiAmount === undefined ? undefined : emiAmount ?? null,
          minimumDue: minimumDue === undefined ? undefined : minimumDue ?? null,
          tenureMonths,
          startDate: startDate ?? undefined,
          accountProvided,
          accountId,
          notes,
          version,
        },
        client
      );
      if (!updated) {
        throw new Error("VERSION_CONFLICT");
      }
      const needsRecompute =
        type !== undefined ||
        principalOutstanding !== undefined ||
        interestRate !== undefined ||
        emiAmount !== undefined ||
        startDate !== undefined;
      if (needsRecompute) {
        const current = await client.query<{
          principal_outstanding: string;
          interest_rate: string;
          emi_amount: string | null;
          start_date: string;
        }>(
          `SELECT principal_outstanding::text, interest_rate::text,
                  emi_amount::text, start_date::text
           FROM debts WHERE user_id = $1 AND id = $2`,
          [user.user_id, id]
        );
        const row = current.rows[0];
        const outstanding = Number(row.principal_outstanding);
        const rate = Number(row.interest_rate);
        const emi = row.emi_amount === null ? null : Number(row.emi_amount);
        const start = row.start_date;
        if (emi !== null && outstanding > 0) {
          const months = deriveMonths(outstanding, rate, emi);
          await updateDebtDerived(
            client,
            user.user_id,
            id,
            months,
            addMonths(start, months)
          );
          await regenerateSchedule(
            client,
            user.user_id,
            id,
            outstanding,
            rate,
            emi,
            start
          );
        } else {
          await updateDebtDerived(client, user.user_id, id, null, null);
          await regenerateSchedule(
            client,
            user.user_id,
            id,
            outstanding,
            rate,
            emi,
            start
          );
        }
      }
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DEBT_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "VERSION_CONFLICT") {
      return c.json(
        { error: "This debt was modified elsewhere. Refresh and try again." },
        409
      );
    }
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] update debt failed:", err);
    return c.json({ error: "Could not update the debt. Please try again." }, 500);
  }

  return c.json({ success: true });
});

debts.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  try {
    const deleted = await withUser(user.user_id, async (client) => {
      const debt = await client.query<{ id: string }>(
        `SELECT id FROM debts WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (debt.rowCount !== 1) {
        throw new Error("DEBT_NOT_FOUND");
      }
      const paymentCount = await countDebtPayments(client, user.user_id, id);
      if (paymentCount > 0) {
        throw new Error("HAS_PAYMENTS");
      }
      return deleteDebt(user.user_id, id, client);
    });
    if (!deleted) {
      return c.json({ error: "Not found" }, 404);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "DEBT_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "HAS_PAYMENTS") {
      return c.json(
        { error: "This debt has recorded payments. Close it instead of deleting it." },
        409
      );
    }
    console.error("[api] delete debt failed:", err);
    return c.json({ error: "Could not delete the debt. Please try again." }, 500);
  }
  return c.json({ success: true });
});

debts.post("/:id/close", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  try {
    const closed = await withUser(user.user_id, async (client) => {
      const debt = await client.query<{ principal_outstanding: string }>(
        `SELECT principal_outstanding::text FROM debts
         WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (debt.rowCount !== 1) {
        throw new Error("DEBT_NOT_FOUND");
      }
      if (Number(debt.rows[0].principal_outstanding) > 0) {
        throw new Error("HAS_BALANCE");
      }
      return setDebtActive(client, user.user_id, id, 0, isoDate(new Date()));
    });
    if (!closed) {
      return c.json({ error: "Not found" }, 404);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "DEBT_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "HAS_BALANCE") {
      return c.json(
        { error: "This debt still has an outstanding balance." },
        409
      );
    }
    console.error("[api] close debt failed:", err);
    return c.json({ error: "Could not close the debt. Please try again." }, 500);
  }
  return c.json({ success: true });
});

debts.post("/:id/reopen", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const reopened = await withUser(user.user_id, (client) =>
    setDebtActive(client, user.user_id, id, 1, null)
  );
  if (!reopened) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

debts.get("/:id/amortization", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const year = String(c.req.query("year") ?? "").trim();
  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  let schedule = await getScheduleRows(user.user_id, id);
  if (schedule.length === 0 && debt.emi_amount !== null) {
    await withUser(user.user_id, async (client) => {
      const anchor = await scheduleAnchor(client, user.user_id, id, debt.start_date);
      await regenerateSchedule(
        client,
        user.user_id,
        id,
        debt.principal_outstanding,
        debt.interest_rate,
        debt.emi_amount,
        anchor
      );
    });
    schedule = await getScheduleRows(user.user_id, id);
  }
  const yearSummary =
    year && /^\d{4}$/.test(year)
      ? schedule
          .filter((row) => row.scheduled_date?.slice(0, 4) === year)
          .reduce(
            (acc, row) => {
              acc.total_emi += row.emi_amount;
              acc.total_principal += row.principal_part;
              acc.total_interest += row.interest_part;
              return acc;
            },
            { year: Number(year), total_emi: 0, total_principal: 0, total_interest: 0 }
          )
      : null;
  return c.json({
    debt_id: id,
    schedule_length: schedule.length,
    year_summary: yearSummary,
    schedule,
  });
});

debts.post("/:id/amortization/regenerate", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  const periods = await withUser(user.user_id, async (client) => {
    const anchor = await scheduleAnchor(client, user.user_id, id, debt.start_date);
    return regenerateSchedule(
      client,
      user.user_id,
      id,
      debt.principal_outstanding,
      debt.interest_rate,
      debt.emi_amount,
      anchor
    );
  });
  return c.json({ success: true, periods });
});

debts.get("/:id/amortization/export", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  const schedule = await getScheduleRows(user.user_id, id);
  const header = "\uFEFFPeriod,EMI,Principal,Interest,Balance,Cumulative Interest";
  const rows = schedule.map((row) =>
    [
      row.period,
      row.emi_amount,
      row.principal_part,
      row.interest_part,
      row.outstanding_after,
      row.cumulative_interest,
    ].join(",")
  );
  const csv = [header, ...rows].join("\r\n");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="debts-${id.slice(0, 8)}-amortization.csv"`,
    },
  });
});

debts.get("/:id/cost-breakdown", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  const original = debt.principal_original;
  const outstanding = debt.principal_outstanding;
  const remainingInterest = debt.remaining_interest ?? 0;
  const totalCost = outstanding + remainingInterest;
  return c.json({
    debt_id: id,
    name: debt.name,
    original_principal: original,
    outstanding_principal: outstanding,
    principal_paid: Math.max(0, original - outstanding),
    interest_paid: debt.total_interest_paid,
    remaining_interest: remainingInterest,
    total_cost: totalCost,
    principal_pct: totalCost > 0 ? Math.round((outstanding / totalCost) * 1000) / 10 : 0,
    interest_pct: totalCost > 0 ? Math.round((remainingInterest / totalCost) * 1000) / 10 : 0,
  });
});

debts.post("/:id/simulate-prepayment", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const amount = parseAmount(body.amount);
  const strategy = String(body.strategy ?? "");

  const fieldErrors: Record<string, string> = {};
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Please enter a prepayment amount greater than zero.";
  }
  if (!STRATEGIES.includes(strategy)) {
    fieldErrors.strategy = "Strategy must be reduce_emi or reduce_tenure.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  if (debt.emi_amount === null) {
    return c.json(
      { error: "Credit-card debts don't have a fixed EMI to simulate." },
      400
    );
  }
  const anchor = await withUser(user.user_id, (client) =>
    scheduleAnchor(client, user.user_id, id, debt.start_date)
  );
  const simulation = simulatePrepayment({
    outstanding: debt.principal_outstanding,
    annualRate: debt.interest_rate,
    emiAmount: debt.emi_amount,
    monthsRemaining: debt.months_remaining ?? 0,
    currentEndDate: debt.end_date,
    anchorDate: anchor,
    amount: amount as number,
    strategy: strategy as "reduce_emi" | "reduce_tenure",
  });
  return c.json({ simulation });
});

debts.post("/:id/prepayments", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const amount = parseAmount(body.amount);
  const date = isoDateStr(String(body.date ?? isoDate(new Date())));
  const notes = String(body.notes ?? "").trim() || null;
  const transactionId = String(body.transaction_id ?? "") || null;

  const fieldErrors: Record<string, string> = {};
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Please enter a prepayment amount greater than zero.";
  }
  if (date === null) {
    fieldErrors.date = "Please choose a valid date.";
  }
  if (transactionId !== null && !validUuid(transactionId)) {
    fieldErrors.transaction_id = "Please choose a valid transaction.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const result = await withUser(user.user_id, async (client) => {
      const debt = await client.query<{
        principal_outstanding: string;
        interest_rate: string;
        emi_amount: string | null;
        start_date: string;
      }>(
        `SELECT principal_outstanding::text, interest_rate::text,
                emi_amount::text, start_date::text
         FROM debts WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (debt.rowCount !== 1) {
        throw new Error("DEBT_NOT_FOUND");
      }
      const row = debt.rows[0];
      if (transactionId !== null) {
        const transaction = await client.query<{ id: string }>(
          `SELECT id FROM transactions WHERE user_id = $1 AND id = $2`,
          [user.user_id, transactionId]
        );
        if (transaction.rowCount !== 1) {
          throw new Error("INVALID_TRANSACTION");
        }
      }
      const outstanding = Number(row.principal_outstanding);
      const rate = Number(row.interest_rate);
      const emi = row.emi_amount === null ? null : Number(row.emi_amount);
      const split = splitPayment(outstanding, rate, amount as number);
      const paymentId = await insertPayment(
        {
          userId: user.user_id,
          debtId: id,
          type: "prepayment",
          amount: amount as number,
          principalPart: split.principal_part,
          interestPart: split.interest_part,
          outstandingAfter: split.outstanding_after,
          date: date as string,
          transactionId,
          notes,
        },
        client
      );
      const after = split.outstanding_after;
      if (after <= 0) {
        await client.query(
          `UPDATE debts
           SET principal_outstanding = 0, total_interest_paid = total_interest_paid + $3,
               months_remaining = 0, end_date = $4::date, is_active = 0,
               closed_date = $4::date
           WHERE user_id = $1 AND id = $2`,
          [user.user_id, id, split.interest_part, date]
        );
        await regenerateSchedule(client, user.user_id, id, 0, rate, emi, date as string);
      } else {
        const months = emi !== null ? deriveMonths(after, rate, emi) : null;
        const anchor = date as string;
        await client.query(
          `UPDATE debts
           SET principal_outstanding = $3, total_interest_paid = total_interest_paid + $4,
               months_remaining = $5, end_date = $6::date
           WHERE user_id = $1 AND id = $2`,
          [
            user.user_id,
            id,
            after,
            split.interest_part,
            months,
            months !== null ? addMonths(anchor, months) : null,
          ]
        );
        await regenerateSchedule(client, user.user_id, id, after, rate, emi, anchor);
      }
      return { paymentId, after };
    });
    return c.json({
      success: true,
      payment: { id: result.paymentId },
      outstanding_after: result.after,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DEBT_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "INVALID_TRANSACTION") {
      return c.json(
        { fieldErrors: { transaction_id: "This transaction doesn't exist." } },
        400
      );
    }
    console.error("[api] apply prepayment failed:", err);
    return c.json(
      { error: "Could not apply the prepayment. Please try again." },
      500
    );
  }
});

debts.get("/:id/payments", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  const payments = await getPayments(user.user_id, id);
  return c.json({ payments });
});

debts.post("/:id/payments", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const amount = parseAmount(body.amount);
  const date = isoDateStr(String(body.date ?? isoDate(new Date())));
  const notes = String(body.notes ?? "").trim() || null;
  const transactionId = String(body.transaction_id ?? "") || null;
  const linkTransaction = body.link_transaction === true || body.link_transaction === 1;

  const fieldErrors: Record<string, string> = {};
  if (amount !== null && amount <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (date === null) {
    fieldErrors.date = "Please choose a valid date.";
  }
  if (transactionId !== null && !validUuid(transactionId)) {
    fieldErrors.transaction_id = "Please choose a valid transaction.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const result = await withUser(user.user_id, async (client) => {
      const debt = await client.query<{
        id: string;
        name: string;
        principal_outstanding: string;
        interest_rate: string;
        emi_amount: string | null;
        account_id: string | null;
        start_date: string;
      }>(
        `SELECT id, name, principal_outstanding::text, interest_rate::text,
                emi_amount::text, account_id, start_date::text
         FROM debts WHERE user_id = $1 AND id = $2`,
        [user.user_id, id]
      );
      if (debt.rowCount !== 1) {
        throw new Error("DEBT_NOT_FOUND");
      }
      const row = debt.rows[0];
      const effectiveAmount = amount ?? Number(row.emi_amount ?? 0);
      if (effectiveAmount <= 0) {
        throw new Error("AMOUNT_REQUIRED");
      }
      let linkedTransactionId = transactionId;
      if (linkedTransactionId !== null) {
        const transaction = await client.query<{ id: string }>(
          `SELECT id FROM transactions WHERE user_id = $1 AND id = $2`,
          [user.user_id, linkedTransactionId]
        );
        if (transaction.rowCount !== 1) {
          throw new Error("INVALID_TRANSACTION");
        }
      } else if (linkTransaction && row.account_id !== null) {
        const tx = await client.query<{ id: string }>(
          `INSERT INTO transactions
             (user_id, account_id, type, amount, description, date, source,
              created_by, updated_by)
           VALUES ($1, $2, 'expense', $3, $4, $5::date, 'manual', $1, $1)
           RETURNING id`,
          [user.user_id, row.account_id, effectiveAmount, `EMI - ${row.name}`, date]
        );
        linkedTransactionId = tx.rows[0].id;
      }
      const outstanding = Number(row.principal_outstanding);
      const rate = Number(row.interest_rate);
      const emi = row.emi_amount === null ? null : Number(row.emi_amount);
      const split = splitPayment(outstanding, rate, effectiveAmount);
      const paymentId = await insertPayment(
        {
          userId: user.user_id,
          debtId: id,
          type: "emi",
          amount: effectiveAmount,
          principalPart: split.principal_part,
          interestPart: split.interest_part,
          outstandingAfter: split.outstanding_after,
          date: date as string,
          transactionId: linkedTransactionId,
          notes,
        },
        client
      );
      const after = split.outstanding_after;
      if (after <= 0) {
        await client.query(
          `UPDATE debts
           SET principal_outstanding = 0, total_interest_paid = total_interest_paid + $3,
               months_remaining = 0, end_date = $4::date, is_active = 0,
               closed_date = $4::date
           WHERE user_id = $1 AND id = $2`,
          [user.user_id, id, split.interest_part, date]
        );
        await regenerateSchedule(client, user.user_id, id, 0, rate, emi, date as string);
      } else {
        const months = emi !== null ? deriveMonths(after, rate, emi) : null;
        const anchor = date as string;
        await client.query(
          `UPDATE debts
           SET principal_outstanding = $3, total_interest_paid = total_interest_paid + $4,
               months_remaining = $5, end_date = $6::date
           WHERE user_id = $1 AND id = $2`,
          [
            user.user_id,
            id,
            after,
            split.interest_part,
            months,
            months !== null ? addMonths(anchor, months) : null,
          ]
        );
        await regenerateSchedule(client, user.user_id, id, after, rate, emi, anchor);
      }
      return { paymentId, after, isActive: after <= 0 ? 0 : 1 };
    });
    return c.json({
      success: true,
      payment: { id: result.paymentId },
      outstanding_after: result.after,
      is_active: result.isActive,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "DEBT_NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "AMOUNT_REQUIRED") {
      return c.json(
        { fieldErrors: { amount: "Please enter a payment amount." } },
        400
      );
    }
    if (err instanceof Error && err.message === "INVALID_TRANSACTION") {
      return c.json(
        { fieldErrors: { transaction_id: "This transaction doesn't exist." } },
        400
      );
    }
    console.error("[api] log payment failed:", err);
    return c.json(
      { error: "Could not record the payment. Please try again." },
      500
    );
  }
});

debts.patch("/:id/payments/:paymentId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const paymentId = c.req.param("paymentId");
  const body = await readJson(c);

  const amount = body.amount === undefined ? undefined : parseAmount(body.amount);
  const date = body.date === undefined ? undefined : isoDateStr(String(body.date));
  const notes =
    body.notes === undefined ? undefined : String(body.notes).trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (amount !== undefined && (amount === null || amount <= 0)) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (date !== undefined && date === null) {
    fieldErrors.date = "Please choose a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const ok = await withUser(user.user_id, async (client) => {
      const updated = await updatePayment(
        {
          userId: user.user_id,
          debtId: id,
          id: paymentId,
          amount: amount ?? undefined,
          date: date ?? undefined,
          notes,
        },
        client
      );
      if (!updated) return false;
      await syncDebtAfterPaymentChange(client, user.user_id, id);
      return true;
    });
    if (!ok) {
      return c.json({ error: "Not found" }, 404);
    }
  } catch (err) {
    console.error("[api] update payment failed:", err);
    return c.json(
      { error: "Could not update the payment. Please try again." },
      500
    );
  }
  return c.json({ success: true });
});

debts.delete("/:id/payments/:paymentId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const paymentId = c.req.param("paymentId");
  const ok = await withUser(user.user_id, async (client) => {
    const deleted = await deletePayment(user.user_id, id, paymentId, client);
    if (!deleted.ok) return false;
    if (deleted.principalPart !== null && deleted.principalPart !== 0) {
      await client.query(
        `UPDATE debts
         SET principal_outstanding = principal_outstanding + $3
         WHERE user_id = $1 AND id = $2`,
        [user.user_id, id, deleted.principalPart]
      );
    }
    await syncDebtAfterPaymentChange(client, user.user_id, id);
    return true;
  });
  if (!ok) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

/** Re-derives the debt state after a payment edit/delete (chain replay). */
async function syncDebtAfterPaymentChange(
  client: Queryable,
  userId: number,
  debtId: string
): Promise<void> {
  const debt = await client.query<{
    interest_rate: string;
    emi_amount: string | null;
    start_date: string;
    is_active: number;
  }>(
    `SELECT interest_rate::text, emi_amount::text, start_date::text, is_active
     FROM debts WHERE user_id = $1 AND id = $2`,
    [userId, debtId]
  );
  const row = debt.rows[0];
  if (!row) return;
  const replay = await replayPayments(client, userId, debtId, Number(row.interest_rate));
  const outstanding = replay.outstanding;
  const emi = row.emi_amount === null ? null : Number(row.emi_amount);
  const payments = await client.query<{ last: string | null }>(
    `SELECT MAX(date)::text AS last FROM debt_payments
     WHERE user_id = $1 AND debt_id = $2`,
    [userId, debtId]
  );
  const lastDate = payments.rows[0]?.last ?? null;
  const anchor = lastDate ?? row.start_date;
  if (outstanding <= 0) {
    await client.query(
      `UPDATE debts
       SET principal_outstanding = 0, total_interest_paid = $3,
           months_remaining = 0, end_date = $4::date
       WHERE user_id = $1 AND id = $2`,
      [userId, debtId, replay.totalInterestPaid, lastDate ?? row.start_date]
    );
    await regenerateSchedule(client, userId, debtId, 0, Number(row.interest_rate), emi, anchor);
  } else {
    const months = emi !== null ? deriveMonths(outstanding, Number(row.interest_rate), emi) : null;
    await client.query(
      `UPDATE debts
       SET principal_outstanding = $3, total_interest_paid = $4,
           months_remaining = $5, end_date = $6::date
       WHERE user_id = $1 AND id = $2`,
      [
        userId,
        debtId,
        outstanding,
        replay.totalInterestPaid,
        months,
        months !== null ? addMonths(anchor, months) : null,
      ]
    );
    await regenerateSchedule(client, userId, debtId, outstanding, Number(row.interest_rate), emi, anchor);
  }
}

debts.get("/:id/payment-status", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const debt = await getDebtById(user.user_id, id);
  if (!debt) {
    return c.json({ error: "Not found" }, 404);
  }
  const months = await getPaymentStatus(user.user_id, id);
  return c.json({
    debt_id: id,
    missed_count: months.filter((m) => m.status === "missed").length,
    months,
  });
});

const debtTypes = new Hono();

debtTypes.get("/", requireAuth, async (c) => {
  const types = await getDebtTypes();
  return c.json({ debt_types: types });
});

export { debts, debtTypes };
export type { Debt, DebtPayment, ScheduleRow, DebtType } from "../queries/debts";