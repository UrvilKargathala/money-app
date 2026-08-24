import { Hono } from "hono";
import { withUser } from "../db";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { requireAuth } from "../middleware";
import { csvEscape, isoDate } from "../utils/format";
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
import {
  bulkAttachTags,
  bulkCategorize,
  bulkDeleteTransactions,
  getDateGroups,
  getLastExpenseContext,
  getRecentMerchants,
  insertQuickAddTransaction,
} from "../queries/transaction-extras";
import {
  addSplit,
  deleteSplit,
  listSplits,
  updateSplit,
} from "../queries/splits";
import { registerImportRoutes } from "./import-routes";
import { getCallerContext } from "../queries/shared-groups";

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

transactions.post("/quick-add", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const amount = parseAmount(body.amount != null ? String(body.amount) : null);
  if (amount === null || amount <= 0) {
    return c.json(
      { fieldErrors: { amount: "Enter an amount greater than zero." } },
      400
    );
  }
  const rawDate = String(body.date ?? isoDate(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
    return c.json({ fieldErrors: { date: "Choose a valid date." } }, 400);
  }

  try {
    const result = await withUser(user.user_id, async (client) => {
      // Heuristic: fall back to the last expense's account/category/merchant.
      const heuristic = await getLastExpenseContext(user.user_id, client);
      const accountId =
        String(body.account_id ?? "") || heuristic?.account_id || null;
      if (!accountId) throw new Error("ACCOUNT_REQUIRED");

      const type = String(body.type ?? "expense");
      if (!(TRANSACTION_TYPES as readonly string[]).includes(type) || type === "transfer") {
        throw new Error("INVALID_TYPE");
      }

      const categoryId =
        body.category_id !== undefined && String(body.category_id)
          ? String(body.category_id)
          : heuristic?.category_id ?? null;
      const merchantClean =
        body.merchant_clean !== undefined
          ? String(body.merchant_clean ?? "").trim() || null
          : heuristic?.merchant_clean ?? null;
      const description =
        String(body.description ?? "").trim() ||
        (merchantClean ? `${merchantClean} purchase` : "Quick add");

      const id = await insertQuickAddTransaction(client, {
        userId: user.user_id,
        accountId,
        type,
        amount,
        description,
        categoryId,
        date: rawDate,
        merchantClean,
      });
      return {
        id,
        applied: {
          account_id: accountId,
          category_id: categoryId,
          merchant_clean: merchantClean,
        },
      };
    });
    return c.json({ success: true, transaction: { id: result.id }, applied: result.applied });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "ACCOUNT_REQUIRED") {
        return c.json(
          {
            fieldErrors: {
              account_id:
                "No account to default to â€” add an account or pass account_id.",
            },
          },
          400
        );
      }
      if (err.message === "INVALID_TYPE") {
        return c.json({ fieldErrors: { type: "Choose expense or income." } }, 400);
      }
    }
    console.error("[api] quick-add failed:", err);
    return c.json(
      { error: "Could not save the transaction. Please try again." },
      500
    );
  }
});

transactions.get("/merchants/recent", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({
    merchants: await getRecentMerchants(user.user_id, 5),
  });
});

transactions.post("/bulk", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const rawIds = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const action = String(body.action ?? "");
  if (rawIds.length === 0 || rawIds.length > 500) {
    return c.json({ error: "Provide between 1 and 500 transaction ids." }, 400);
  }

  const uuidRe = /^[0-9a-f-]{36}$/i;
  const ids = rawIds.filter((id: string) => uuidRe.test(id));
  if (ids.length !== rawIds.length) {
    return c.json({ error: "One or more ids are invalid." }, 400);
  }

  try {
    let affected: number;
    switch (action) {
      case "categorize": {
        const categoryId = String(body.category_id ?? "");
        if (!uuidRe.test(categoryId)) {
          return c.json(
            { fieldErrors: { category_id: "Please choose a category." } },
            400
          );
        }
        const res = await withUser(user.user_id, (client) =>
          bulkCategorize(client, { userId: user.user_id, ids, categoryId })
        );
        affected = res.rowCount ?? 0;
        break;
      }
      case "tag": {
        const tagIds = Array.isArray(body.tag_ids)
          ? body.tag_ids.map(String).filter((t: string) => uuidRe.test(t))
          : [];
        if (tagIds.length === 0) {
          return c.json(
            { fieldErrors: { tag_ids: "Provide at least one tag id." } },
            400
          );
        }
        const res = await withUser(user.user_id, (client) =>
          bulkAttachTags(client, { userId: user.user_id, ids, tagIds })
        );
        affected = ids.length;
        void res;
        break;
      }
      case "delete": {
        const res = await withUser(user.user_id, (client) =>
          bulkDeleteTransactions(client, user.user_id, ids)
        );
        affected = res.rowCount ?? 0;
        break;
      }
      default:
        return c.json(
          { error: "action must be categorize, tag or delete." },
          400
        );
    }
    return c.json({ success: true, affected });
  } catch (err) {
    console.error("[api] bulk edit failed:", err);
    return c.json(
      { error: "Could not apply the bulk edit. Please try again." },
      500
    );
  }
});

transactions.get("/date-groups", requireAuth, async (c) => {
  const user = c.get("user");
  const from = c.req.query("from") || null;
  const to = c.req.query("to") || null;
  for (const [label, value] of [["from", from], ["to", to]] as const) {
    if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return c.json({ error: `Invalid ${label} date.` }, 400);
    }
  }
  return c.json({
    groups: await getDateGroups(user.user_id, from, to),
  });
});

// ---- splits (nested under :id; registered alongside the other :id routes) --

transactions.get("/:id/splits", requireAuth, async (c) => {
  const user = c.get("user");
  const summary = await listSplits(user.user_id, c.req.param("id"));
  if (!summary) return c.json({ error: "Not found" }, 404);
  return c.json(summary);
});

transactions.post("/:id/splits", requireAuth, async (c) => {
  const user = c.get("user");
  const txnId = c.req.param("id");
  const body = await readJson(c);

  const categoryId = String(body.category_id ?? "");
  const amount = parseAmount(body.amount != null ? String(body.amount) : null);
  const notes = String(body.notes ?? "").trim() || null;

  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return c.json({ fieldErrors: { category_id: "Please choose a category." } }, 400);
  }
  if (amount === null || amount <= 0) {
    return c.json(
      { fieldErrors: { amount: "Split amounts must be greater than zero." } },
      400
    );
  }

  try {
    const splitId = await withUser(user.user_id, (client) =>
      addSplit(client, {
        userId: user.user_id,
        transactionId: txnId,
        categoryId,
        amount,
        notes,
      })
    );
    return c.json({ success: true, split: { id: splitId } });
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        IS_TRANSFER: [
          409,
          { error: "Transfer transactions can't be split â€” edit the transfer instead." },
        ],
        SUM_EXCEEDS_PARENT: [
          400,
          { error: "Splits can't exceed the transaction total." },
        ],
        DUPLICATE_CATEGORY: [
          409,
          { error: "This transaction already has a split for that category â€” edit it instead." },
        ],
      };
      const entry = map[err.message];
      if (entry) return c.json(entry[1], entry[0] as 400 | 404 | 409);
    }
    console.error("[api] add split failed:", err);
    return c.json({ error: "Could not add the split. Please try again." }, 500);
  }
});

transactions.patch("/:id/splits/:splitId", requireAuth, async (c) => {
  const user = c.get("user");
  const txnId = c.req.param("id");
  const splitId = c.req.param("splitId");
  const body = await readJson(c);

  const categoryId = String(body.category_id ?? "");
  const amount = parseAmount(body.amount != null ? String(body.amount) : null);
  const notes = String(body.notes ?? "").trim() || null;

  if (!/^[0-9a-f-]{36}$/i.test(categoryId)) {
    return c.json({ fieldErrors: { category_id: "Please choose a category." } }, 400);
  }
  if (amount === null || amount <= 0) {
    return c.json(
      { fieldErrors: { amount: "Split amounts must be greater than zero." } },
      400
    );
  }

  try {
    const ok = await withUser(user.user_id, (client) =>
      updateSplit(client, {
        userId: user.user_id,
        transactionId: txnId,
        splitId,
        categoryId,
        amount,
        notes,
      })
    );
    if (!ok) return c.json({ error: "Not found" }, 404);
  } catch (err) {
    if (err instanceof Error) {
      const map: Record<string, [number, Record<string, unknown>]> = {
        NOT_FOUND: [404, { error: "Not found" }],
        IS_TRANSFER: [409, { error: "Transfer transactions can't be split." }],
        SUM_EXCEEDS_PARENT: [400, { error: "Splits can't exceed the transaction total." }],
        DUPLICATE_CATEGORY: [409, { error: "Another split already uses that category." }],
      };
      const entry = map[err.message];
      if (entry) return c.json(entry[1], entry[0] as 400 | 404 | 409);
    }
    console.error("[api] update split failed:", err);
    return c.json({ error: "Could not update the split. Please try again." }, 500);
  }

  return c.json({ success: true });
});

transactions.delete("/:id/splits/:splitId", requireAuth, async (c) => {
  const user = c.get("user");
  const ok = await withUser(user.user_id, (client) =>
    deleteSplit(client, user.user_id, c.req.param("id"), c.req.param("splitId"))
  );
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
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
    const newId = await withUser(user.user_id, async (client) => {
      if (!(await activeAccountExists(accountId, user.user_id, client))) {
        throw new Error("INVALID_ACCOUNT");
      }

      return insertManualTransaction(client, {
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
    return c.json({ success: true, transaction: { id: newId } });
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
  // Shared-group assignment: explicit key = set/clear; validate membership.
  const groupId =
    body.group_id === undefined ? undefined : String(body.group_id ?? "") || null;

  const fieldErrors: Record<string, string> = {};
  if (groupId !== undefined && groupId !== null && !/^[0-9a-f-]{36}$/i.test(groupId)) {
    fieldErrors.group_id = "Invalid group id.";
  }
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
      const lookup = await getTransactionTransferGroup(user.user_id, id, client);
      if (!lookup.found) {
        return { notFound: true as const };
      }
      if (lookup.transferGroupId) {
        return { isTransfer: true as const };
      }

      if (groupId !== undefined && groupId !== null) {
        const ctx = await getCallerContext(user.user_id, groupId, client);
        if (!ctx) throw new Error("INVALID_GROUP");
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
        groupId,
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
    if (err instanceof Error && err.message === "INVALID_GROUP") {
      return c.json(
        { fieldErrors: { group_id: "You're not a member of that group." } },
        403
      );
    }
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
    const lookup = await getTransactionTransferGroup(user.user_id, id, client);
    if (!lookup.found) {
      return { notFound: true as const };
    }
    if (lookup.transferGroupId) {
      return { isTransfer: true as const };
    }
    await deleteTransactionById(client, user.user_id, id);
    return { ok: true as const };
  });

  if ("notFound" in result) return c.json({ error: "Not found" }, 404);
  if ("isTransfer" in result) {
    return c.json(
      { error: "Transfer transactions can't be deleted here â€” delete the transfer instead." },
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

registerImportRoutes(transactions);

export { transactions };
