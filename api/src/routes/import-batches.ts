import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { csvEscape } from "../utils/format";
import {
  deleteImportErrors,
  getBatchAccount,
  getImportBatch,  getImportErrorsByIds,
  listImportBatches,
  listImportErrors,
  shiftDuplicateToImported,
  skipDuplicatesAdjust,
  findCategoryIdByName,
  insertImportedTransactions,
  applyMergeFields,
} from "../queries/import";
import type { PendingTxnInsert } from "../queries/import";
import type { ImportDraft } from "../utils/csv";

const importBatches = new Hono();

const uuidRe = /^[0-9a-f-]{36}$/i;

importBatches.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ batches: await listImportBatches(user.user_id) });
});

/** Rows processed vs total â€” derived from the (synchronously finalized) row. */
importBatches.get("/:id/progress", requireAuth, async (c) => {
  const user = c.get("user");
  const batch = await getImportBatch(user.user_id, c.req.param("id"));
  if (!batch) return c.json({ error: "Not found" }, 404);

  const processed =
    batch.imported_rows + batch.duplicate_rows + batch.error_rows;
  return c.json({
    status: batch.status,
    total_rows: batch.total_rows,
    processed_rows: processed,
    imported_rows: batch.imported_rows,
    duplicate_rows: batch.duplicate_rows,
    error_rows: batch.error_rows,
  });
});

importBatches.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const batch = await getImportBatch(user.user_id, c.req.param("id"));
  if (!batch) return c.json({ error: "Not found" }, 404);
  return c.json({ batch });
});

importBatches.get("/:id/errors", requireAuth, async (c) => {
  const user = c.get("user");
  const batchId = c.req.param("id");
  if (!(await getImportBatch(user.user_id, batchId))) {
    return c.json({ error: "Not found" }, 404);
  }
  return c.json({ errors: await listImportErrors(user.user_id, batchId) });
});

importBatches.get("/:id/errors/export", requireAuth, async (c) => {
  const user = c.get("user");
  const batchId = c.req.param("id");
  if (!(await getImportBatch(user.user_id, batchId))) {
    return c.json({ error: "Not found" }, 404);
  }
  const errors = await listImportErrors(user.user_id, batchId);
  const header = ["Row", "Reason", "Data"];
  const rows = errors.map((e) => [
    e.row_number,
    e.error_reason,
    typeof e.raw_data === "string" ? e.raw_data : JSON.stringify(e.raw_data ?? ""),
  ]);
  const csv =
    "\uFEFF" +
    [header, ...rows].map((r) => r.map(csvEscape).join(",")).join("\r\n");

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="import-errors-${batchId.slice(0, 8)}.csv"`,
    },
  });
});

function safeParseDraft(raw: string | null): ImportDraft | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImportDraft>;
    if (
      typeof parsed.date === "string" &&
      typeof parsed.amount === "number" &&
      (parsed.type === "income" || parsed.type === "expense")
    ) {
      return parsed as ImportDraft;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves stored duplicates: 'skip' drops them; 'import' re-inserts the
 * saved drafts and shifts counts; 'merge' folds each draft's merchant/category
 * into a caller-chosen existing transaction.
 */
importBatches.post("/:id/duplicates/resolve", requireAuth, async (c) => {
  const user = c.get("user");
  const batchId = c.req.param("id");
  const body = (await readJson(c)) as {
    action?: unknown;
    ids?: unknown;
    resolutions?: unknown;
  };

  if (!(await getImportBatch(user.user_id, batchId))) {
    return c.json({ error: "Not found" }, 404);
  }

  const action = String(body.action ?? "");
  if (!["skip", "import", "merge"].includes(action)) {
    return c.json({ error: "action must be skip, import or merge." }, 400);
  }

  const requestedIds = Array.isArray(body.ids)
    ? (body.ids as unknown[]).map(String).filter((v) => uuidRe.test(v))
    : [];

  try {
    const allDuplicates = (await listImportErrors(user.user_id, batchId)).filter(
      (e) => e.error_reason.startsWith("duplicate")
    );
    const targetRows = requestedIds.length
      ? allDuplicates.filter((e) => requestedIds.includes(e.id))
      : allDuplicates;

    if (action === "skip") {
      await withUser(user.user_id, (client) =>
        deleteImportErrors(
          client,
          user.user_id,
          targetRows.map((r) => r.id)
        )
      );
      await withUser(user.user_id, (client) =>
        skipDuplicatesAdjust(client, {
          userId: user.user_id,
          batchId,
          count: targetRows.length,
        })
      );
      return c.json({ success: true, action, skipped: targetRows.length });
    }

    if (action === "import") {
      // Reuse the account this batch was imported against.
      const originalAccount = await getBatchAccount(user.user_id, batchId);
      if (!originalAccount) {
        return c.json(
          { error: "This batch has no target account recorded." },
          409
        );
      }
      const pending: PendingTxnInsert[] = [];
      for (const row of targetRows) {
        const draft = safeParseDraft(row.raw_data);
        if (!draft) continue;
        pending.push({
          userId: user.user_id,
          accountId: originalAccount,
          type: draft.type,
          amount: draft.amount,
          description: draft.description,
          merchantClean: draft.merchant_clean,
          categoryId: null,
          date: draft.date,
          batchId,
        });
      }

      let imported = 0;
      if (pending.length > 0) {
        imported = await withUser(user.user_id, (client) =>
          insertImportedTransactions(client, pending)
        );
        await withUser(user.user_id, (client) =>
          deleteImportErrors(
            client,
            user.user_id,
            targetRows.map((r) => r.id)
          )
        );
        await withUser(user.user_id, (client) =>
          shiftDuplicateToImported(client, {
            userId: user.user_id,
            batchId,
            count: imported,
          })
        );
      }
      return c.json({ success: true, action, imported });
    }

    // action === "merge": per-row explicit targets; folds merchant/category
    // from each stored draft into the chosen existing transaction.
    let mergedCount = 0;
    for (const r of (Array.isArray(body.resolutions)
      ? (body.resolutions as {
          row_id?: unknown;
          existing_transaction_id?: unknown;
        }[])
      : []
    ).slice(0, 500)) {
      const rowId = String(r.row_id ?? "");
      const targetTxn = String(r.existing_transaction_id ?? "");
      if (!uuidRe.test(rowId) || !uuidRe.test(targetTxn)) continue;
      const errRows = await getImportErrorsByIds(user.user_id, [rowId]);
      if (errRows.length === 0 || errRows[0].error_reason !== "duplicate") continue;
      const draft = safeParseDraft(errRows[0].raw_data);
      if (!draft) continue;

      const categoryId = draft.category_name
        ? await findCategoryIdByName(user.user_id, draft.category_name)
        : null;
      await withUser(user.user_id, (client) =>
        applyMergeFields(client, {
          userId: user.user_id,
          keepId: targetTxn,
          merchantClean: draft.merchant_clean,
          categoryId,
          notes: null,
        })
      );
      await withUser(user.user_id, (client) =>
        deleteImportErrors(client, user.user_id, [rowId])
      );
      mergedCount += 1;
    }
    if (mergedCount > 0) {
      await withUser(user.user_id, (client) =>
        skipDuplicatesAdjust(client, {
          userId: user.user_id,
          batchId,
          count: mergedCount,
        })
      );
    }

    return c.json({ success: true, action, merged: mergedCount });
  } catch (err) {
    console.error("[api] resolve duplicates failed:", err);
    return c.json(
      { error: "Could not resolve the duplicates. Please try again." },
      500
    );
  }
});

export { importBatches };
