import { Hono } from "hono";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { setMonthlyIncome } from "../queries/debts";
import { readJson } from "./helpers";

const settings = new Hono();

settings.patch("/monthly-income", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const raw = body.monthly_income;
  let income: number | null;
  if (raw === undefined || raw === null || raw === "") {
    income = null;
  } else {
    income = parseAmount(raw);
    if (income === null || income < 0) {
      return c.json(
        { fieldErrors: { monthly_income: "Please enter a valid monthly income." } },
        400
      );
    }
  }

  await setMonthlyIncome(user.user_id, income);
  return c.json({ success: true, monthly_income: income });
});

export { settings };