import { Hono } from "hono";
import { withUser } from "../db";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { requireAuth } from "../middleware";
import { csvEscape } from "../utils/format";
import {
  attachTransactionTag,
  deleteTransactionById,
  detachTransactionTag,
  getTransactions,
  getTransactionById,
  getTransactionSummary,
  getTransactionTransferGroup,
  insertManualTransaction,
  transactionExists,
  updateTransactionFields,
  type TransactionFilters,
} from "../queries/transactions";
import { activeAccountExists } from "../queries/references";
import { tagExistsForUser } from "../queries/tags";

const transactions = new Hono();

const TRANSACTION_TYPES = ["income", "expense", "transfer"] as const;

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

async function readFilters(c: { req: { query: (key: string) => string | undefined } }): Promise<TransactionFilters> {
  const fromRaw = c.req.query("from");
  const toRaw = c.req.query("to");
  const filters: TransactionFilters = {
    accountId: c.req.query("account_id") || undefined,
    categoryId: c.req.query("category_id") || undefined,
    type: c.req.query("type") || undefined,
    q: c.req.query("q") || undefined,
  };
  if (fromRaw && isValidDate(fromRaw)) filters.from = new Date(`${fromRaw}T00:00:00Z`);
  if (toRaw && isValidDate(toRaw)) filters.to = new Date(`${toRaw}T00:00:00Z`);
  return filters;
}

transactions.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  const type = c.req.query("type");
  if (type && !(TRANSACTION_TYPES as readonly string[]).includes(type)) {
    return c.json({ error: "Invalid transaction type." }, 400);
  }

  const page = Math.max(1, Number(c.req.query("page") ?? 1) || 1);
  const pageSize = Math.min(
    100,
    Math.max(1, Number(c.req.query("pageSize") ?? 50) || 50)
  );

  const filters = await readFilters(c);
  const [rows, summary] = await Promise.all([
    getTransactions(user.user_id, filters, pageSize, (page - 1) * pageSize),
    getTransactionSummary(user.user_id, filters),
  ]);

  return c.json({
    transactions: rows,
    summary,
    total: summary.count,
    page,
    pageSize,
  });
});

transactions.get("/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const type = c.req.query("type");
  if (type && !(TRANSACTION_TYPES as readonly string[]).includes(type)) {
    return c.json({ error: "Invalid transaction type." }, 400);
  }
  const filters = await readFilters(c);
  const summary = await getTransactionSummary(user.user_id, filters);
  return c.json({ summary });
});

transactions.get("/export", requireAuth, async (c) => {
  const user = c.get("user");
  const rows = await getTransactions(user.user_id, {}, 100000, 0);

  const header = ["Date", "Type", "Description", "Category", "Account", "Amount", "Notes", "Tags"];
  const csvRows = rows.map((t) => [
    t.date.toISOString().slice(0, 10),
    t.type,
    t.description ?? "",
    t.category_name ?? "",
    t.account_name,
    t.type === "income" ? t.amount.toFixed(2) : `-${t.amount.toFixed(2)}`,
    t.notes ?? "",
    t.tags.map((tag) => tag.name).join("; "),
  ]);

  const csv =
    "\uFEFF" +
    [header, ...csvRows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="moneymind-transactions-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
});

transactions.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const transaction = await getTransactionById(user.user_id, id);
  if (!transaction) return c.json({ error: "Not found" }, 404);
  return c.json({ transaction });
});

transactions.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const type = String(body.type ?? "");
  const accountId = String(body.account_id ?? "");
  const categoryId = String(body.category_id ?? "") || null;
  const amount = parseAmount(body.amount != null ? String(body.amount) : null);
  const rawDate = String(body.date ?? "");
  const description = String(body.description ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (!(TRANSACTION_TYPES as readonly string[]).includes(type) || type === "transfer") {
    fieldErrors.type = "Choose expense or income.";
  }
  if (!accountId) {
    fieldErrors.account_id = "Choose an account.";
  }
  if (amount == null || amount <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }
  if (!rawDate || Number.isNaN(Date.parse(rawDate))) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  const validAmount = amount as number;

  try {
    await withUser(user.user_id, async (client) => {
      if (!(await activeAccountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }

      await insertManualTransaction(client, {
        userId: user.user_id,
        accountId,
        type,
        amount: validAmount,
        description,
        categoryId,
        date: rawDate,
        notes,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json({ error: "The account is no longer active." }, 409);
    }
    console.error("[api] create transaction failed:", err);
    return c.json(
      { error: "Could not save the transaction. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

transactions.patch("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const type = String(body.type ?? "");
  const accountId = String(body.account_id ?? "");
  const categoryId = String(body.category_id ?? "") || null;
  const amount = parseAmount(body.amount != null ? String(body.amount) : null);
  const rawDate = String(body.date ?? "");
  const description = String(body.description ?? "").trim() || null;
  const notes = String(body.notes ?? "").trim() || null;
  const version = Number(body.version ?? 1);

  const fieldErrors: Record<string, string> = {};
  if (!(TRANSACTION_TYPES as readonly string[]).includes(type) || type === "transfer") {
    fieldErrors.type = "Choose expense or income.";
  }
  if (!accountId) {
    fieldErrors.account_id = "Choose an account.";
  }
  if (amount == null || amount <= 0) {
    fieldErrors.amount = "Enter an amount greater than zero.";
  }
  if (!rawDate || Number.isNaN(Date.parse(rawDate))) {
    fieldErrors.date = "Choose a valid date.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  const validAmount = amount as number;

  try {
    const result = await withUser(user.user_id, async (client) => {
      const transferGroupId = await getTransactionTransferGroup(user.user_id, id, client);
      if (transferGroupId === null) {
        return { notFound: true as const };
      }
      if (transferGroupId) {
        return { isTransfer: true as const };
      }

      if (!(await activeAccountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }

      const updated = await updateTransactionFields(client, {
        userId: user.user_id,
        id,
        type,
        amount: validAmount,
        description,
        categoryId,
        date: rawDate,
        notes,
        accountId,
        version,
      });
      if (updated.rowCount === 0) {
        return { conflicted: true as const };
      }
      return { ok: true as const };
    });

    if ("notFound" in result) return c.json({ error: "Not found" }, 404);
    if ("isTransfer" in result) {
      return c.json(
        { error: "Transfer transactions can't be edited here — edit the transfer instead." },
        409
      );
    }
    if ("conflicted" in result) {
      return c.json(
        { error: "This transaction was modified elsewhere. Refresh and try again." },
        409
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message === "INVALID_ACCOUNT") {
      return c.json({ error: "The account is no longer active." }, 409);
    }
    console.error("[api] update transaction failed:", err);
    return c.json(
      { error: "Could not update the transaction. Please try again." },
      500
    );
  }

  return c.json({ success: true });
});

transactions.delete("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const result = await withUser(user.user_id, async (client) => {
    const transferGroupId = await getTransactionTransferGroup(user.user_id, id, client);
    if (transferGroupId === null) {
      return { notFound: true as const };
    }
    if (transferGroupId) {
      return { isTransfer: true as const };
    }
    await deleteTransactionById(client, user.user_id, id);
    return { ok: true as const };
  });

  if ("notFound" in result) return c.json({ error: "Not found" }, 404);
  if ("isTransfer" in result) {
    return c.json(
      { error: "Transfer transactions can't be deleted here — delete the transfer instead." },
      409
    );
  }

  return c.json({ success: true });
});

transactions.post("/:id/tags", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const tagId = String(body.tag_id ?? "");

  if (!tagId) {
    return c.json({ fieldErrors: { tag_id: "Choose a tag." } }, 400);
  }

  try {
    await withUser(user.user_id, async (client) => {
      const txn = await transactionExists(user.user_id, id, client);
      if (txn.rowCount !== 1) {
        throw new Error("NOT_FOUND");
      }
      const tag = await tagExistsForUser(client, user.user_id, tagId);
      if (!tag) {
        throw new Error("INVALID_TAG");
      }
      await attachTransactionTag(client, {
        userId: user.user_id,
        transactionId: id,
        tagId,
      });
    });
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_FOUND") {
      return c.json({ error: "Not found" }, 404);
    }
    if (err instanceof Error && err.message === "INVALID_TAG") {
      return c.json({ error: "This tag doesn't exist." }, 409);
    }
    console.error("[api] attach tag failed:", err);
    return c.json({ error: "Could not add the tag. Please try again." }, 500);
  }

  return c.json({ success: true });
});

transactions.delete("/:id/tags/:tagId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const tagId = c.req.param("tagId");

  await withUser(user.user_id, (client) =>
    detachTransactionTag(client, {
      userId: user.user_id,
      transactionId: id,
      tagId,
    })
  );

  return c.json({ success: true });
});

export { transactions };
