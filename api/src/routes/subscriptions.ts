import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import { getEntitlement, checkCountLimit, isRowLocked } from "../queries/entitlements";
import {
  SUBSCRIPTION_FREQUENCIES,
  advanceSubscriptionRenewal,
  cancelSubscription,
  getMonthlyBurn,
  getSubscription,
  getSubscriptionForRenewal,
  getSubscriptionStatus,
  insertPaymentHistory,
  insertSubscription,
  insertSubscriptionRenewalTransaction,
  listDueRenewals,
  listSubscriptionPayments,
  listSubscriptionPaymentsForExport,
  listSubscriptions,
  pauseSubscription,
  resumeSubscription,
  subscriptionExists,
  updateSubscription,
} from "../queries/subscriptions";
import {
  activeAccountExists,
  categoryReferenceExists,
} from "../queries/references";

const subscriptions = new Hono();

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

function toCsv(header: string[], rows: (string | number)[][]): string {
  return (
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n")
  );
}

subscriptions.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ subscriptions: await listSubscriptions(user.user_id) });
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
  const subLimit = await checkCountLimit(user.user_id, "tracker_subscriptions");
  if (subLimit) {
    return c.json({ error: "plan_limit", feature: "tracker_subscriptions", plan: subLimit.plan, limit: subLimit.limit, used: subLimit.used }, 403);
  }
  const validAmount = amount as number;

  try {
    await withUser(user.user_id, async (client) => {
      if (accountId !== null && !(await activeAccountExists(accountId, user.user_id))) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (categoryId !== null && !(await categoryReferenceExists(categoryId, user.user_id))) {
        throw new Error("INVALID_CATEGORY");
      }
      await insertSubscription(client, {
        userId: user.user_id,
        serviceName,
        amount: validAmount,
        frequency,
        nextRenewalDate,
        accountId,
        categoryId,
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
  const rows = await listSubscriptions(user.user_id);

  const csv = toCsv(
    ["Service Name", "Amount", "Frequency", "Monthly Equivalent", "Next Renewal", "Status"],
    rows.map((s) => [
      s.service_name,
      s.amount.toFixed(2),
      s.frequency,
      s.monthly_equivalent.toFixed(2),
      s.next_renewal_date,
      s.status,
    ])
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscriptions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

subscriptions.get("/due-renewals", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ items: await listDueRenewals(user.user_id) });
});

subscriptions.get("/monthly-burn", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ monthly_burn: await getMonthlyBurn(user.user_id) });
});

subscriptions.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const subscription = await getSubscription(user.user_id, c.req.param("id"));
  if (!subscription) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ subscription });
});

subscriptions.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const subLock = await isRowLocked(user.user_id, "tracker_subscriptions", id);
  if (subLock.locked) return c.json({ error: "plan_locked", feature: "tracker_subscriptions", plan: subLock.plan }, 403);
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
      if (accountId !== undefined && accountId !== null &&
          !(await activeAccountExists(accountId, user.user_id))) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (categoryId !== undefined && categoryId !== null &&
          !(await categoryReferenceExists(categoryId, user.user_id))) {
        throw new Error("INVALID_CATEGORY");
      }
      return updateSubscription(client, {
        userId: user.user_id,
        id,
        serviceName: serviceName ?? null,
        amount: amount ?? null,
        frequency: frequency ?? null,
        nextRenewalDate: nextRenewalDate ?? null,
        accountId: accountId ?? null,
        categoryId: categoryId ?? null,
        notes: notes ?? null,
        version,
      });
    });
    if (!ok) {
      const exists = await subscriptionExists(user.user_id, id);
      return c.json(
        exists
          ? { error: "This subscription was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        exists ? 409 : 404
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
    cancelSubscription(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    const existing = await getSubscriptionStatus(user.user_id, id);
    if (!existing) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json({ error: "The subscription is already cancelled." }, 409);
  }

  return c.json({ success: true });
});

subscriptions.post("/:id/pause", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const lockPause = await isRowLocked(user.user_id, "tracker_subscriptions", id);
  if (lockPause.locked) return c.json({ error: "plan_locked", feature: "tracker_subscriptions", plan: lockPause.plan }, 403);

  const result = await withUser(user.user_id, (client) =>
    pauseSubscription(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    const existing = await getSubscriptionStatus(user.user_id, id);
    if (!existing) {
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
  const lockResume = await isRowLocked(user.user_id, "tracker_subscriptions", id);
  if (lockResume.locked) return c.json({ error: "plan_locked", feature: "tracker_subscriptions", plan: lockResume.plan }, 403);

  const result = await withUser(user.user_id, (client) =>
    resumeSubscription(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    const existing = await getSubscriptionStatus(user.user_id, id);
    if (!existing) {
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
  const lockRenew = await isRowLocked(user.user_id, "tracker_subscriptions", id);
  if (lockRenew.locked) return c.json({ error: "plan_locked", feature: "tracker_subscriptions", plan: lockRenew.plan }, 403);
  const body = await readJson(c);

  const accountId = String(body.account_id ?? "").trim() || null;

  try {
    await withUser(user.user_id, async (client) => {
      const sub = await getSubscriptionForRenewal(client, user.user_id, id);
      if (!sub) {
        throw new Error("NOT_FOUND");
      }
      if (sub.status !== "active") {
        throw new Error("NOT_ACTIVE");
      }

      const payAccountId = accountId ?? sub.account_id;
      if (!payAccountId) {
        throw new Error("ACCOUNT_REQUIRED");
      }
      if (!(await activeAccountExists(payAccountId, user.user_id))) {
        throw new Error("INVALID_ACCOUNT");
      }

      const amount = Number(sub.amount);
      const { label, month, year } = currentPeriod();
      const transactionId = await insertSubscriptionRenewalTransaction(client, {
        userId: user.user_id,
        accountId: payAccountId,
        amount,
        description: `${sub.service_name} â€” ${monthName(year, month)}`,
        categoryId: sub.category_id,
      });

      await insertPaymentHistory(client, {
        userId: user.user_id,
        payableType: "subscription",
        payableId: id,
        transactionId,
        amount,
        periodLabel: label,
        periodMonth: month,
        periodYear: year,
        notes: null,
      });

      const step: Record<string, number> = { monthly: 1, quarterly: 3, annual: 12 };
      await advanceSubscriptionRenewal(
        client,
        user.user_id,
        id,
        isoDate(addMonths(sub.next_renewal_date, step[sub.frequency] ?? 1))
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

  if (!(await subscriptionExists(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ payments: await listSubscriptionPayments(user.user_id, id) });
});

subscriptions.get("/:id/payments/export", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  if (!(await subscriptionExists(user.user_id, id))) {
    return c.json({ error: "Not found" }, 404);
  }

  const rows = await listSubscriptionPaymentsForExport(user.user_id, id);

  const csv = toCsv(
    ["Period", "Date", "Amount"],
    rows.map((row) => [row.period_label, row.date, row.amount.toFixed(2)])
  );

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="subscription-payments-${id}.csv"`,
    },
  });
});

subscriptions.post("/:id/snooze", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const lockSnooze = await isRowLocked(user.user_id, "tracker_subscriptions", id);
  if (lockSnooze.locked) return c.json({ error: "plan_locked", feature: "tracker_subscriptions", plan: lockSnooze.plan }, 403);
  const body = await readJson(c);
  const days = Number(body.days ?? 7);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return c.json({ fieldErrors: { days: "Snooze must be between 1 and 90 days." } }, 400);
  }
  const result = await withUser(user.user_id, (client) => {
    return import("../queries/bill-extras").then((m) =>
      m.snoozeSubscription(client, { userId: user.user_id, subscriptionId: id, days })
    );
  });
  if (result === null) return c.json({ error: "Not found or not active." }, 404);
  return c.json({ success: true, next_renewal_date: result });
});

export { subscriptions };
