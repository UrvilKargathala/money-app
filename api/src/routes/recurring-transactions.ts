import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson, isUniqueViolation } from "./helpers";
import {
  deleteRecurringTemplate,
  executeDueOccurrence,
  getRecurringTemplate,
  insertRecurringTemplate,
  listRecurringTemplates,
  skipNextOccurrence,
  updateRecurringTemplate,
} from "../queries/recurring";
import { activeAccountExists } from "../queries/references";
import { categoryReferenceExists } from "../queries/references";

const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"] as const;
const END_TYPES = ["never", "count", "date"] as const;

const recurringTransactions = new Hono();

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

type TemplateBody = Record<string, unknown>;

function validateTemplate(
  body: TemplateBody,
  partial: boolean
): { fieldErrors?: Record<string, string>; values?: {
  accountId: string | null;
  type: "income" | "expense";
  amount: number | null;
  description: string | null;
  categoryId: string | null;
  frequency: (typeof FREQUENCIES)[number] | null;
  intervalValue: number | null;
  endType: (typeof END_TYPES)[number] | null;
  endCount: number | null;
  endDate: string | null;
  nextDueDate: string | null;
} } {
  const fieldErrors: Record<string, string> = {};
  const str = (key: string): string | undefined =>
    body[key] === undefined ? undefined : String(body[key]).trim();
  const num = (key: string): number | undefined => {
    if (body[key] === undefined) return undefined;
    const n = Number(body[key]);
    return Number.isFinite(n) ? n : NaN;
  };

  const type = str("type") as "income" | "expense" | undefined;
  if (!partial || type !== undefined) {
    if (type !== "income" && type !== "expense") {
      fieldErrors.type = "Type must be income or expense.";
    }
  }

  let amount: number | null = null;
  const rawAmount = parseAmount(body.amount != null ? String(body.amount) : null);
  if (!partial || body.amount !== undefined) {
    if (rawAmount === null || rawAmount <= 0) {
      fieldErrors.amount = "Enter an amount greater than zero.";
    } else amount = rawAmount;
  }

  const accountId = str("account_id") === "" ? null : str("account_id") ?? null;
  if (accountId !== null && !/^[0-9a-f-]{36}$/i.test(accountId)) {
    fieldErrors.account_id = "Please choose a valid account.";
  }

  const categoryId = str("category_id") === "" ? null : str("category_id") ?? null;
  if (categoryId !== null && !/^[0-9a-f-]{36}$/i.test(categoryId)) {
    fieldErrors.category_id = "Please choose a valid category.";
  }

  const frequency = str("frequency") as (typeof FREQUENCIES)[number] | undefined;
  if (!partial || frequency !== undefined) {
    if (!frequency || !(FREQUENCIES as readonly string[]).includes(frequency)) {
      fieldErrors.frequency = "Frequency must be daily, weekly, monthly or yearly.";
    }
  }

  let intervalValue: number | null = null;
  const rawInterval = num("interval_value");
  if (!partial || rawInterval !== undefined) {
    const v = rawInterval ?? 1;
    if (!Number.isInteger(v) || v < 1 || v > 366) {
      fieldErrors.interval_value = "Interval must be between 1 and 366.";
    } else intervalValue = v;
  }

  const endType = str("end_type") as (typeof END_TYPES)[number] | undefined;
  if (!partial || endType !== undefined) {
    if (!endType || !(END_TYPES as readonly string[]).includes(endType)) {
      fieldErrors.end_type = "End type must be never, count or date.";
    }
  }

  let endCount: number | null = null;
  const rawEndCount = num("end_count");
  if ((endType ?? (partial ? undefined : "never")) === "count") {
    if (rawEndCount === undefined || !Number.isInteger(rawEndCount) || rawEndCount < 1) {
      fieldErrors.end_count = "Provide how many occurrences to run.";
    } else endCount = rawEndCount;
  } else if (rawEndCount !== undefined && !Number.isInteger(rawEndCount)) {
    fieldErrors.end_count = "Occurrences must be a whole number.";
  }

  let endDate: string | null = null;
  const rawEndDate = str("end_date");
  if ((endType ?? (partial ? undefined : "never")) === "date") {
    if (!rawEndDate || !isValidDate(rawEndDate)) {
      fieldErrors.end_date = "Choose a valid end date.";
    } else endDate = rawEndDate;
  } else if (rawEndDate !== undefined && rawEndDate !== "" && !isValidDate(rawEndDate)) {
    fieldErrors.end_date = "Choose a valid end date.";
  }

  let nextDueDate: string | null = null;
  const rawNext = str("next_due_date");
  if (!partial || body.next_due_date !== undefined) {
    if (!rawNext || !isValidDate(rawNext)) {
      fieldErrors.next_due_date = "Choose a valid next due date.";
    } else nextDueDate = rawNext;
  }

  const description =
    body.description === undefined ? undefined : String(body.description ?? "").trim() || null;

  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };
  return {
    values: {
      accountId: accountId ?? null,
      type: (type ?? "expense") as "income" | "expense",
      amount,
      description: description ?? null,
      categoryId: categoryId ?? null,
      frequency: (frequency ?? null),
      intervalValue,
      endType: endType ?? null,
      endCount,
      endDate,
      nextDueDate,
    },
  };
}

recurringTransactions.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    templates: await listRecurringTemplates(user.user_id),
  });
});

recurringTransactions.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const check = validateTemplate(body as TemplateBody, false);
  if (check.fieldErrors || !check.values) {
    return c.json({ fieldErrors: check.fieldErrors ?? {} }, 400);
  }
  const v = check.values;

  try {
    const id = await withUser(user.user_id, async (client) => {
      if (v.accountId && !(await activeAccountExists(v.accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (v.categoryId && !(await categoryReferenceExists(v.categoryId, user.user_id, client))) {
        throw new Error("INVALID_CATEGORY");
      }
      return insertRecurringTemplate(client, {
        userId: user.user_id,
        accountId: v.accountId,
        type: v.type,
        amount: v.amount as number,
        description: v.description,
        categoryId: v.categoryId,
        frequency: v.frequency as (typeof FREQUENCIES)[number],
        intervalValue: v.intervalValue ?? 1,
        endType: (v.endType ?? "never") as "never" | "count" | "date",
        endCount: v.endCount,
        endDate: v.endDate,
        nextDueDate: v.nextDueDate as string,
      });
    });
    return c.json({ success: true, template: { id } });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json({ fieldErrors: { account_id: "This account doesn't exist." } }, 400);
    }
    if (err instanceof Error && err.message === "INVALID_CATEGORY") {
      return c.json({ fieldErrors: { category_id: "This category doesn't exist." } }, 400);
    }
    console.error("[api] create recurring template failed:", err);
    return c.json(
      { error: "Could not create the recurring transaction. Please try again." },
      500
    );
  }
});

recurringTransactions.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const template = await getRecurringTemplate(user.user_id, c.req.param("id"));
  if (!template) return c.json({ error: "Not found" }, 404);
  return c.json({ template });
});

recurringTransactions.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const version = Number(body.version ?? 1);
  const check = validateTemplate(body as TemplateBody, true);

  try {
    const ok = await withUser(user.user_id, async (client) => {
      if (check.fieldErrors) {
        throw Object.assign(new Error("FIELD_ERRORS"), { fieldErrors: check.fieldErrors });
      }
      const v = check.values!;
      if (
        v.accountId &&
        !(await activeAccountExists(v.accountId, user.user_id, client))
      ) {
        throw new Error("INVALID_ACCOUNT");
      }
      if (
        v.categoryId &&
        !(await categoryReferenceExists(v.categoryId, user.user_id, client))
      ) {
        throw new Error("INVALID_CATEGORY");
      }
      const result = await updateRecurringTemplate(client, {
        userId: user.user_id,
        id,
        accountId: v.accountId,
        type: v.type,
        amount: v.amount,
        description: v.description,
        categoryId: v.categoryId,
        frequency: v.frequency,
        intervalValue: v.intervalValue,
        endType: v.endType,
        endCount: v.endCount,
        endDate: v.endDate,
        nextDueDate: v.nextDueDate,
        isActive:
          body.is_active === undefined
            ? null
            : body.is_active === true || body.is_active === 1
              ? 1
              : 0,
        version,
      });
      return result.rowCount === 1;
    });
    if (!ok) {
      const existing = await getRecurringTemplate(user.user_id, id);
      return c.json(
        existing
          ? { error: "This template was modified elsewhere. Refresh and try again." }
          : { error: "Not found" },
        existing ? 409 : 404
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === "FIELD_ERRORS") {
      const fe = (err as unknown as { fieldErrors: Record<string, string> }).fieldErrors;
      return c.json({ fieldErrors: fe }, 400);
    }
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json({ fieldErrors: { account_id: "This account doesn't exist." } }, 400);
    }
    if (err instanceof Error && err.message === "INVALID_CATEGORY") {
      return c.json({ fieldErrors: { category_id: "This category doesn't exist." } }, 400);
    }
    console.error("[api] update recurring template failed:", err);
    return c.json(
      { error: "Could not update the recurring transaction. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

recurringTransactions.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const result = await withUser(user.user_id, (client) =>
    deleteRecurringTemplate(client, user.user_id, c.req.param("id"))
  );
  if (result.rowCount !== 1) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ success: true });
});

for (const action of ["execute", "skip"] as const) {
  recurringTransactions.post(`/:id/${action}`, requireAuth, async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");

    let payload: Record<string, unknown>;
    if (action === "execute") {
      const result = await withUser(user.user_id, (client) =>
        executeDueOccurrence(client, user.user_id, id)
      );
      if (!result.ok) payload = { reason: result.reason };
      else
        payload = {
          transactionId: result.transactionId,
          next_due_date: result.nextDueDate,
          completed: result.completed,
        };
    } else {
      const result = await withUser(user.user_id, (client) =>
        skipNextOccurrence(client, user.user_id, id)
      );
      if (!result.ok) payload = { reason: result.reason };
      else
        payload = { next_due_date: result.nextDueDate, completed: result.completed };
    }

    if ("reason" in payload && typeof payload.reason === "string") {
      const reasons: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        INACTIVE: [409, { error: "This recurring transaction is no longer active." }],
        NOT_DUE: [
          409,
          { error: "The next occurrence isn't due yet — come back on its due date." },
        ],
      };
      const entry = reasons[payload.reason];
      if (entry) return c.json(entry[1], entry[0] as 404 | 409);
    }

    return c.json({ success: true, ...payload });
  });
}

export { recurringTransactions };
