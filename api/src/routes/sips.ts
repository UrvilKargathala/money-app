import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { csvEscape, isoDate } from "../utils/format";
import {
  SIP_FREQUENCIES,
  advanceSipNextDate,
  deleteSip,
  getSipById,
  getSipForInstallment,
  insertSip,
  listDueSips,
  listSips,
  transitionSipStatus,
  updateSip,
} from "../queries/sips";
import {
  getInvestmentById,
  insertHoldingTransaction,
  recomputeHoldingAggregates,
} from "../queries/investments";
import {
  activeAccountExists,
  accountExists,
} from "../queries/references";
import { insertDebtExpenseTransaction } from "../queries/debts";

const sips = new Hono();

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

sips.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const status = c.req.query("status") || null;
  if (status !== null && !["active", "paused", "completed"].includes(status)) {
    return c.json({ error: "Invalid status filter." }, 400);
  }
  return c.json({ sips: await listSips(user.user_id, status) });
});

sips.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const investmentId = String(body.investment_id ?? "");
  const amount = parseAmount(body.amount);
  const frequency = String(body.frequency ?? "");
  const nextDate = String(body.next_date ?? "");
  const accountId = String(body.account_id ?? "") || null;
  const startDate = String(body.start_date ?? isoDate(new Date()));
  const endDate = String(body.end_date ?? "") || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!/^[0-9a-f-]{36}$/i.test(investmentId)) {
    fieldErrors.investment_id = "Please choose a holding.";
  }
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Enter an installment amount greater than zero.";
  }
  if (!(SIP_FREQUENCIES as readonly string[]).includes(frequency)) {
    fieldErrors.frequency = "Frequency must be monthly or quarterly.";
  }
  if (!isValidDate(nextDate)) {
    fieldErrors.next_date = "Choose a valid next installment date.";
  }
  if (!isValidDate(startDate)) {
    fieldErrors.start_date = "Choose a valid start date.";
  }
  if (endDate !== null && !isValidDate(endDate)) {
    fieldErrors.end_date = "Choose a valid end date.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  const validAmount = amount as number;

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (
        !(await getInvestmentById(user.user_id, investmentId, client))
      ) {
        throw new Error("INVALID_INVESTMENT");
      }
      if (accountId !== null &&
          !(await activeAccountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      return insertSip(client, {
        userId: user.user_id,
        investmentId,
        amount: validAmount,
        frequency: frequency as "monthly" | "quarterly",
        nextDate,
        accountId,
        startDate,
        endDate,
        notes,
      });
    });
    return c.json({ success: true, sip: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_INVESTMENT") {
      return c.json(
        { fieldErrors: { investment_id: "This holding doesn't exist." } },
        400
      );
    }
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist or is inactive." } },
        400
      );
    }
    console.error("[api] create sip failed:", err);
    return c.json({ error: "Could not create the SIP. Please try again." }, 500);
  }
});

sips.get("/due", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ items: await listDueSips(user.user_id, 7) });
});

sips.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await listSips(user.user_id, null);

  const header = [
    "Holding", "Amount", "Frequency", "Next Installment", "Account", "Status",
  ];
  const csvRows = rows.map((s) => [
    s.investment_name,
    s.amount.toFixed(2),
    s.frequency,
    s.next_date,
    s.account_name ?? "",
    s.status,
  ]);
  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="sips-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
});

sips.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const sip = await getSipById(user.user_id, c.req.param("id"));
  if (!sip) return c.json({ error: "Not found" }, 404);
  return c.json({ sip });
});

sips.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const amount = body.amount === undefined ? undefined : parseAmount(body.amount);
  const frequency = body.frequency === undefined ? undefined : String(body.frequency);
  const nextDate = body.next_date === undefined ? undefined : String(body.next_date);
  const accountId = body.account_id === undefined ? undefined : String(body.account_id ?? "") || null;
  const endDate = body.end_date === undefined ? undefined : String(body.end_date ?? "") || null;
  const notes = body.notes === undefined ? undefined : String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (amount !== undefined && (amount === null || amount <= 0)) {
    fieldErrors.amount = "Enter an installment amount greater than zero.";
  }
  if (frequency !== undefined &&
      !(SIP_FREQUENCIES as readonly string[]).includes(frequency)) {
    fieldErrors.frequency = "Frequency must be monthly or quarterly.";
  }
  if (nextDate !== undefined && !isValidDate(nextDate)) {
    fieldErrors.next_date = "Choose a valid next installment date.";
  }
  if (endDate !== undefined && endDate !== null && !isValidDate(endDate)) {
    fieldErrors.end_date = "Choose a valid end date.";
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
      return updateSip(client, {
        userId: user.user_id,
        id,
        amount: amount ?? null,
        frequency: frequency ?? null,
        nextDate: nextDate ?? null,
        accountId: accountId ?? null,
        endDate: endDate ?? null,
        notes: notes ?? null,
      });
    });
    if (!ok) {
      return c.json({ error: "Not found" }, 404);
    }
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }
    console.error("[api] update sip failed:", err);
    return c.json(
      { error: "Could not update the SIP. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

sips.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    deleteSip(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

sips.post("/:id/installment", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const date = String(body.date ?? isoDate(new Date()));
  const linkTransaction =
    body.link_transaction === undefined ? true : body.link_transaction === true;

  if (!isValidDate(date)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  try {
    const result = await withUser(user.user_id, async (client) => {
      const sip = await getSipForInstallment(client, user.user_id, id);
      if (!sip) throw new Error("NOT_FOUND");
      if (sip.status !== "active") throw new Error("NOT_ACTIVE");

      const holding = await getInvestmentById(
        user.user_id,
        sip.investment_id,
        client
      );
      if (!holding) throw new Error("HOLDING_GONE");
      if (holding.valuation_mode !== "unit") {
        throw new Error("NOT_UNIT_BASED");
      }

      const pricePerUnit = holding.current_price;
      const units = Math.round((Number(sip.amount) / pricePerUnit) * 10_000) / 10_000;

      let linkedTransactionId: string | null = null;
      if (linkTransaction && sip.account_id !== null) {
        linkedTransactionId = await insertDebtExpenseTransaction(client, {
          userId: user.user_id,
          accountId: sip.account_id,
          amount: Number(sip.amount),
          description: `SIP - ${holding.name}`,
          date,
        });
      }

      await insertHoldingTransaction(client, {
        userId: user.user_id,
        investmentId: sip.investment_id,
        type: "buy",
        units,
        pricePerUnit,
        totalAmount: Number(sip.amount),
        date,
        transactionId: linkedTransactionId,
        notes: "SIP installment",
      });
      await recomputeHoldingAggregates(client, user.user_id, sip.investment_id);

      const step = sip.frequency === "monthly" ? 1 : 3;
      await advanceSipNextDate(client, {
        userId: user.user_id,
        id,
        nextDate: isoDate(addMonths(new Date(`${date}T00:00:00`), step)),
      });

      return { units };
    });
    return c.json({ success: true, units_added: result.units });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        NOT_ACTIVE: [409, { error: "Only active SIPs can log installments." }],
        HOLDING_GONE: [409, { error: "The linked holding no longer exists." }],
        NOT_UNIT_BASED: [
          409,
          { error: "Installments are only supported for unit-based holdings." },
        ],
      };
      const entry = map[err.message];
      if (entry) return c.json(entry[1], entry[0] as 404 | 409);
    }
    console.error("[api] sip installment failed:", err);
    return c.json(
      { error: "Could not record the installment. Please try again." },
      500
    );
  }
});

for (const action of ["pause", "resume", "complete"] as const) {
  sips.post(`/:id/${action}`, requireAuth, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    const result = await withUser(user.user_id, (client) =>
      transitionSipStatus(client, action, user.user_id, id)
    );
    if (result.rowCount !== 1) {
      const existing = await getSipById(user.user_id, id);
      if (!existing) return c.json({ error: "Not found" }, 404);
      const messages: Record<string, string> = {
        pause: "Only active SIPs can be paused.",
        resume: "Only paused SIPs can be resumed.",
        complete: "Only active or paused SIPs can be completed.",
      };
      return c.json({ error: messages[action] }, 409);
    }

    return c.json({ success: true });
  });
}

export { sips };
