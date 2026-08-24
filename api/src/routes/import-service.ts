import { withUser } from "../db";
import {
  loadUserCategoryMap,
  createImportBatch,
  finalizeImportBatch,
  insertImportErrors,
  insertImportedTransactions,
  loadDuplicateHashes,
  type PendingTxnInsert,
} from "../queries/import";
import {
  draftHash,
  parseCsv,
  resolveEffectiveMappingInternal,
  rowToDraft,
  type ImportDraft,
  type ParsedCsv,
} from "../utils/csv";

export const MAX_IMPORT_ROWS = 2000;
export const MAX_CSV_BYTES = 1_500_000;

export type ImportDraftWithRow = { rowNumber: number; draft: ImportDraft };
export type StructuralError = {
  rowNumber: number;
  cells: string[];
  reason: string;
};

/** Reads CSV content from either a JSON {csv} body or a raw text body. */
export async function readCsvBody(c: {
  req: { header(name: string): string | undefined; text(): Promise<string> };
}): Promise<string | null> {
  const raw = await c.req.text();
  if (!raw) return null;
  const contentType = c.req.header("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const parsed = JSON.parse(raw) as { csv?: unknown };
      if (typeof parsed.csv === "string") return parsed.csv;
    } catch {
      return null;
    }
  }
  return raw;
}

/** Parses + maps every data row, classifying structural outcomes. */
export function classifyRows(
  parsed: ParsedCsv
): { drafts: ImportDraftWithRow[]; errors: StructuralError[] } {
  const mapping = resolveEffectiveMappingInternal(parsed.headers);
  const drafts: ImportDraftWithRow[] = [];
  const errors: StructuralError[] = [];

  parsed.rows.forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const outcome = rowToDraft(parsed.headers, cells, mapping);
    if (outcome.ok) drafts.push({ rowNumber: i + 2, draft: outcome.draft });
    else errors.push({ rowNumber: i + 2, cells, reason: outcome.reason });
  });

  return { drafts, errors };
}

/**
 * Runs the full confirm flow inside one transaction: duplicate classification
 * against existing history (hash window Â±370 days), batched inserts, error +
 * duplicate logging (duplicates keep their full draft for later resolution),
 * then final counters/status.
 */
export async function runConfirmImport(
  userId: number,
  params: {
    filename: string;
    csvText: string;
    accountId: string;
  }
): Promise<
  | { ok: false; status: number; body: Record<string, unknown> }
  | { ok: true; body: Record<string, unknown> }
> {
  if (!params.csvText || params.csvText.length > MAX_CSV_BYTES) {
    return {
      ok: false,
      status: 400,
      body: { error: "Provide CSV content up to 1.5MB." },
    };
  }

  const parsed = parseCsv(params.csvText);
  if (parsed.rows.length === 0) {
    return { ok: false, status: 400, body: { error: "No data rows found." } };
  }
  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    return {
      ok: false,
      status: 400,
      body: { error: `Imports are capped at ${MAX_IMPORT_ROWS} rows per file.` },
    };
  }

  const classified = classifyRows(parsed);
  const dates = classified.drafts.map((d) => d.draft.date).sort();
  const minDate = dates[0] ?? null;
  const maxDate = dates[dates.length - 1] ?? null;

  let batchId = "";
  let importedRows = 0;
  let duplicateCount = 0;

  await withUser(userId, async (client) => {
    batchId = await createImportBatch(client, {
      userId,
      filename: params.filename,
      totalRows: parsed.rows.length,
      accountId: params.accountId,
    });

    const pending: PendingTxnInsert[] = [];
    const duplicateLog: {
      rowNumber: number;
      rawData: unknown;
      reason: string;
    }[] = [];

    // Category names resolved once per confirm.
    const categoryMap = await loadUserCategoryMap(userId, client);

    if (minDate && maxDate && classified.drafts.length > 0) {
      const seen = await loadDuplicateHashes(client, {
        userId,
        minDate,
        maxDate,
      });

      for (const { rowNumber, draft } of classified.drafts) {
        const hash = draftHash(draft);
        if (seen.has(hash)) {
          duplicateCount += 1;
          duplicateLog.push({
            rowNumber,
            rawData: draft,
            reason: "duplicate of an existing transaction",
          });
          continue;
        }
        seen.add(hash); // intra-file repeats count once inserted
        pending.push({
          userId,
          accountId: params.accountId,
          type: draft.type,
          amount: draft.amount,
          description: draft.description,
          merchantClean: draft.merchant_clean,
          categoryId: draft.category_name
            ? categoryMap.get(draft.category_name.toLowerCase()) ?? null
            : null,
          date: draft.date,
          batchId,
        });
      }

      importedRows = await insertImportedTransactions(client, pending);
    }

    if (duplicateLog.length > 0) {
      await insertImportErrors(client, {
        userId,
        batchId,
        rows: duplicateLog,
      });
    }

    await insertImportErrors(client, {
      userId,
      batchId,
      rows: classified.errors.map((e) => ({
        rowNumber: e.rowNumber,
        rawData: e.cells,
        reason: e.reason,
      })),
    });

    await finalizeImportBatch(client, {
      userId,
      batchId,
      importedRows,
      duplicateRows: duplicateCount,
      errorRows: classified.errors.length,
      dateFrom: minDate,
      dateTo: maxDate,
    });
  });

  return {
    ok: true,
    body: {
      success: true,
      batch: { id: batchId },
      total_rows: parsed.rows.length,
      imported_rows: importedRows,
      duplicate_rows: duplicateCount,
      error_rows: classified.errors.length,
    },
  };
}
