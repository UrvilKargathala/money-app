import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { isoDate } from "../utils/format";
import {
  DIVIDEND_TYPES,
  deleteDividend,
  getDividendById,
  insertDividend,
  investmentRowExists,
  listDividends,
  updateDividend,
} from "../queries/investments";
import { transactionExists } from "../queries/transactions";

const dividends = new Hono();

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

dividends.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const investmentId = c.req.query("investment_id") || null;
  if (
    investmentId !== null &&
    !/^[0-9a-f-]{36}$/i.test(investmentId)
  ) {
    return c.json({ error: "Invalid holding id." }, 400);
  }
  return c.json({
    dividends: await listDividends(user.user_id, investmentId),
  });
});

dividends.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const investmentId = String(body.investment_id ?? "");
  const type = String(body.type ?? "");
  const amount = parseAmount(body.amount);
  const date = String(body.date ?? isoDate(new Date()));
  const transactionId = String(body.transaction_id ?? "") || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!/^[0-9a-f-]{36}$/i.test(investmentId)) {
    fieldErrors.investment_id = "Please choose a holding.";
  }
  if (!(DIVIDEND_TYPES as readonly string[]).includes(type)) {
    fieldErrors.type =
      "Type must be dividend, interest or maturity_proceeds.";
  }
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }
  if (!isValidDate(date)) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (transactionId && !/^[0-9a-f-]{36}$/i.test(transactionId)) {
    fieldErrors.transaction_id = "Please choose a valid transaction.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (!(await investmentRowExists(client, user.user_id, investmentId))) {
        throw new Error("INVALID_INVESTMENT");
      }
      if (transactionId !== null &&
          !(await transactionExists(user.user_id, transactionId, client)).rowCount) {
        throw new Error("INVALID_TRANSACTION");
      }
      return insertDividend(client, {
        userId: user.user_id,
        investmentId,
        type: type as "dividend" | "interest" | "maturity_proceeds",
        amount: amount as number,
        date,
        transactionId,
        notes,
      });
    });
    return c.json({ success: true, dividend: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_INVESTMENT") {
      return c.json(
        { fieldErrors: { investment_id: "This holding doesn't exist." } },
        400
      );
    }
    if (err instanceof Error && err.message === "INVALID_TRANSACTION") {
      return c.json(
        { fieldErrors: { transaction_id: "This transaction doesn't exist." } },
        400
      );
    }
    console.error("[api] record dividend failed:", err);
    return c.json(
      { error: "Could not record the payout. Please try again." },
      500
    );
  }
});

dividends.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const dividend = await getDividendById(user.user_id, c.req.param("id"));
  if (!dividend) return c.json({ error: "Not found" }, 404);
  return c.json({ dividend });
});

dividends.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const type = String(body.type ?? "");
  const amount = parseAmount(body.amount);
  const date = String(body.date ?? "");
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!(DIVIDEND_TYPES as readonly string[]).includes(type)) {
    fieldErrors.type =
      "Type must be dividend, interest or maturity_proceeds.";
  }
  if (amount === null || amount <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }
  if (!isValidDate(date)) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  try {
    const ok = await withUser(user.user_id, async (client) => {
      const result = await updateDividend(client, {
        userId: user.user_id,
        id,
        type: type as "dividend" | "interest" | "maturity_proceeds",
        amount: amount as number,
        date,
        notes,
      });
      return result.rowCount === 1;
    });
    if (!ok) return c.json({ error: "Not found" }, 404);
  } catch (err) {
    console.error("[api] update dividend failed:", err);
    return c.json(
      { error: "Could not update the payout. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

dividends.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, (client) =>
    deleteDividend(client, user.user_id, id)
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json({ success: true });
});

export { dividends };
