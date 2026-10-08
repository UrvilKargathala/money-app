import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import {
  deleteImportErrors,
  getBatchAccount,
  getImportBatch,  getImportErrorsByIds,
  listImportBatches,
  listImportErrors,
  rollbackImportBatch,
  shiftDuplicateToImported,
  skipDuplicatesAdjust,
  loadUserCategoryMap,
  insertImportedTransactions,
  applyMergeFields,
} from "../queries/import";
import type { PendingTxnInsert } from "../queries/import";
import { csvResponse, toCsv, type ImportDraft } from "../utils/csv";

const importBatches = new Hono();

const uuidRe = /^[0-9a-f-]{36}$/i;

importBatches.get("/", requireAuth, async (c) => {
  const user = c.get("user");
  return c.json({ batches: await listImportBatches(user.user_id) });
});

/** Rows processed vs total - derived from the (synchronously finalized) row. */
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
  const csv = toCsv(header, rows);
  return csvResponse(csv, `import-errors-${batchId.slice(0, 8)}.csv`);
});

importBatches.post("/:id/rollback", requireAuth, async (c) => {
  const user = c.get("user");
  const batchId = c.req.param("id");
  if (!(await getImportBatch(user.user_id, batchId))) return c.json({ error: "Not found" }, 404);
  const deleted = await withUser(user.user_id, (client) =>
    rollbackImportBatch(client, user.user_id, batchId)
  );
  return c.json({ success: true, deleted });
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
    // Batched: one read for all error rows, one category map, then a single
    // transaction for every merge + cleanup (was 3-4 round-trips per row).
    const pairs = (Array.isArray(body.resolutions)
      ? (body.resolutions as {
          row_id?: unknown;
          existing_transaction_id?: unknown;
        }[])
      : []
    )
      .slice(0, 500)
      .map((r) => ({
        rowId: String(r.row_id ?? ""),
        targetTxn: String(r.existing_transaction_id ?? ""),
      }))
      .filter((p) => uuidRe.test(p.rowId) && uuidRe.test(p.targetTxn));
    const errById = new Map(
      (await getImportErrorsByIds(user.user_id, pairs.map((p) => p.rowId))).map((r) => [r.id, r])
    );
    const categoryMap = await loadUserCategoryMap(user.user_id);
    const jobs: { rowId: string; targetTxn: string; merchantClean: string | null; categoryId: string | null }[] = [];
    for (const p of pairs) {
      const errRow = errById.get(p.rowId);
      if (!errRow || errRow.error_reason !== "duplicate") continue;
      const draft = safeParseDraft(errRow.raw_data);
      if (!draft) continue;
      jobs.push({
        rowId: p.rowId,
        targetTxn: p.targetTxn,
        merchantClean: draft.merchant_clean,
        categoryId: draft.category_name ? (categoryMap.get(draft.category_name.toLowerCase()) ?? null) : null,
      });
    }
    let mergedCount = 0;
    if (jobs.length > 0) {
      await withUser(user.user_id, async (client) => {
        for (const job of jobs) {
          await applyMergeFields(client, {
            userId: user.user_id,
            keepId: job.targetTxn,
            merchantClean: job.merchantClean,
            categoryId: job.categoryId,
            notes: null,
          });
        }
        await deleteImportErrors(client, user.user_id, jobs.map((j) => j.rowId));
        await skipDuplicatesAdjust(client, {
          userId: user.user_id,
          batchId,
          count: jobs.length,
        });
      });
      mergedCount = jobs.length;
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
