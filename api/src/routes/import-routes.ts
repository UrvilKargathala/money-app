import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson } from "./helpers";
import { classifyRows, MAX_CSV_BYTES, readCsvBody, runConfirmImport } from "./import-service";
import {
  detectMapping,
  parseCsv,
  resolveColumnIndex,
  type ColumnMapping,
} from "../utils/csv";
import { activeAccountExists, categoryReferenceExists } from "../queries/references";
import {
  deleteTransactionById,
  getTransactionTransferGroup,
} from "../queries/transactions";
import {
  applyMergeFields,
  loadPairForMerge,
} from "../queries/import";
import { generateText, Output } from "ai";
import { z } from "zod";

const uuidRe = /^[0-9a-f-]{36}$/i;
const MAX_SCAN_BYTES = 8_000_000;
const SCAN_MEDIA_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

const receiptDraftSchema = z.object({
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  amount: z.number().positive(),
  type: z.enum(["income", "expense"]),
  date: z.string().nullable(),
  category_name: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

/** Registers the CSV-import + duplicate-merge routes on the transactions router. */
export function registerImportRoutes(transactions: import("hono").Hono): void {
  /** Extracts an editable transaction draft from a receipt photo or PDF. */
  transactions.post("/scan-receipt", requireAuth, async (c) => {
    const form = await c.req.parseBody();
    const file = form.file;
    if (!(file instanceof File)) {
      return c.json({ error: "Choose a receipt photo or PDF." }, 400);
    }
    if (!SCAN_MEDIA_TYPES.has(file.type)) {
      return c.json({ error: "Use a JPG, PNG, WebP, or PDF file." }, 400);
    }
    if (file.size === 0 || file.size > MAX_SCAN_BYTES) {
      return c.json({ error: "Receipt files must be between 1 byte and 8MB." }, 400);
    }

    try {
      const { output } = await generateText({
        model: process.env.RECEIPT_SCAN_MODEL ?? "openai/gpt-6-luna",
        output: Output.object({ schema: receiptDraftSchema }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Extract one financial transaction from this receipt or statement page.",
                  "Return the final paid/received total, not subtotal or tax.",
                  "Use YYYY-MM-DD for date; use null when unreadable.",
                  "Type is normally expense unless the document clearly records received income.",
                  "Category should be a short common personal-finance category.",
                  "Do not invent unreadable values.",
                ].join(" "),
              },
              {
                type: "file",
                mediaType: file.type,
                data: new Uint8Array(await file.arrayBuffer()),
              },
            ],
          },
        ],
      });

      return c.json({
        draft: {
          ...output,
          date: output.date ?? new Date().toISOString().slice(0, 10),
          description: output.description ?? output.merchant ?? "Scanned receipt",
        },
      });
    } catch (error) {
      console.error("[api] receipt scan failed:", error);
      const missingCredentials =
        !process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN;
      return c.json(
        {
          error: missingCredentials
            ? "Receipt scanning needs AI_GATEWAY_API_KEY locally. Statement CSV import still works without it."
            : "Could not read this receipt. Try a clearer, well-lit photo.",
        },
        503
      );
    }
  });

  /** Stateless: parses, detects the column mapping and samples rows. */
  transactions.post("/import/preview", requireAuth, async (c) => {
    const csvText = await readCsvBody(c);
    if (!csvText) return c.json({ error: "Provide CSV content." }, 400);

    const parsed = parseCsv(csvText);
    if (parsed.rows.length === 0) {
      return c.json({ error: "No data rows found." }, 400);
    }

    const mapping: ColumnMapping = detectMapping(parsed.headers);
    const classified = classifyRows(parsed, mapping);

    return c.json({
      headers: parsed.headers,
      detected_mapping: mapping,
      total_rows: parsed.rows.length,
      valid_rows: classified.drafts.length,
      sample_rows: classified.drafts.slice(0, 10).map((d) => d.draft),
      errors: classified.errors.slice(0, 10),
    });
  });

  /**
   * Stateless validation with an optional explicit mapping - same pipeline as
   * confirm but nothing is written.
   */
  transactions.post("/import/validate", requireAuth, async (c) => {
    const body = (await readJson(c)) as {
      csv?: unknown;
      mapping?: Record<string, unknown>;
    };
    const csvText = typeof body.csv === "string" ? body.csv : null;
    if (!csvText) return c.json({ error: "Provide CSV content." }, 400);

    const parsed = parseCsv(csvText);
    const effective: ColumnMapping = { ...detectMapping(parsed.headers) };
    const provided = body.mapping ?? {};
    for (const key of Object.keys(effective) as (keyof ColumnMapping)[]) {
      const value = (provided as Record<string, unknown>)[key];
      if (value === null || value === undefined) continue;
      if (typeof value === "number" || typeof value === "string") {
        const resolved = resolveColumnIndex(parsed.headers, value);
        if (resolved !== null) effective[key] = resolved;
      }
    }

    const classified = classifyRows(parsed, effective);

    return c.json({
      total_rows: parsed.rows.length,
      valid_rows: classified.drafts.length,
      error_rows: classified.errors.length,
      applied_mapping: effective,
      errors: classified.errors.slice(0, 50).map((e) => ({
        row_number: e.rowNumber,
        reason: e.reason,
      })),
    });
  });

  /**
   * Full synchronous import: creates the batch and processes everything.
   * Accepts multipart (file field) or JSON {csv}.
   */
  transactions.post("/import", requireAuth, async (c) => {
    const user = c.get("user");
    let csvText: string | null = null;
    let accountId = "";
    let filename = "upload.csv";
    let mapping: ColumnMapping | undefined;

    const contentType = c.req.header("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) {
        return c.json({ error: "Attach a CSV file in the 'file' field." }, 400);
      }
      const isCsvName = file.name.toLowerCase().endsWith(".csv");
      const isCsvType = ["text/csv", "application/csv", "application/vnd.ms-excel", "text/plain", ""].includes(file.type);
      if (!isCsvName || !isCsvType) {
        return c.json({ error: "Only CSV statement files are supported." }, 400);
      }
      if (file.size === 0 || file.size > MAX_CSV_BYTES) {
        return c.json({ error: "CSV statements must be between 1 byte and 1.5MB." }, 400);
      }
      filename = file.name || filename;
      csvText = await file.text();
      accountId = String(form.account_id ?? "");
      if (typeof form.mapping === "string") {
        try {
          mapping = JSON.parse(form.mapping) as ColumnMapping;
        } catch {
          return c.json({ error: "Column mapping is invalid." }, 400);
        }
      }
    } else {
      const body = (await readJson(c)) as {
        csv?: unknown;
        account_id?: unknown;
        filename?: unknown;
        mapping?: unknown;
      };
      csvText = typeof body.csv === "string" ? body.csv : null;
      accountId = String(body.account_id ?? "");
      if (body.mapping && typeof body.mapping === "object") {
        mapping = body.mapping as ColumnMapping;
      }
      if (typeof body.filename === "string" && body.filename.trim()) {
        filename = body.filename.trim().slice(0, 200);
      }
    }

    if (!csvText) return c.json({ error: "Provide CSV content." }, 400);
    if (!uuidRe.test(accountId)) {
      return c.json({ fieldErrors: { account_id: "Choose a target account." } }, 400);
    }
    if (!(await activeAccountExists(accountId, user.user_id))) {
      return c.json(
        { fieldErrors: { account_id: "This account doesn't exist." } },
        400
      );
    }

    const result = await runConfirmImport(user.user_id, {
      filename,
      csvText,
      accountId,
      mapping,
    });
    if (!result.ok) {
      return c.json(result.body, result.status as 400);
    }
    return c.json(result.body);
  });

  /** Merge a duplicate transaction into an existing one. */
  transactions.post("/duplicates/merge", requireAuth, async (c) => {
    const user = c.get("user");
    const body = (await readJson(c)) as {
      existing_transaction_id?: unknown;
      duplicate_transaction_id?: unknown;
    };
    const existingId = String(body.existing_transaction_id ?? "");
    const duplicateId = String(body.duplicate_transaction_id ?? "");
    if (!uuidRe.test(existingId) || !uuidRe.test(duplicateId)) {
      return c.json({ error: "Provide both transaction ids." }, 400);
    }
    if (existingId === duplicateId) {
      return c.json({ error: "A transaction can't merge into itself." }, 400);
    }

    try {
      const merged = await withUser(user.user_id, async (client) => {
        // Transfers can never be merge targets or sources.
        for (const id of [existingId, duplicateId]) {
          const groupId = await getTransactionTransferGroup(user.user_id, id, client);
          if (groupId !== null) throw new Error("IS_TRANSFER");
        }
        const pair = await loadPairForMerge(client, user.user_id, [
          existingId,
          duplicateId,
        ]);
        if (!pair) throw new Error("NOT_FOUND");

        const keeper = pair.find((r) => r.id === existingId)!;
        const dup = pair.find((r) => r.id === duplicateId)!;

        await applyMergeFields(client, {
          userId: user.user_id,
          keepId: existingId,
          merchantClean: dup.merchant_clean,
          categoryId: dup.category_id,
          notes: dup.notes,
        });
        await deleteTransactionById(client, user.user_id, duplicateId);

        void keeper;
        return { kept: existingId, removed: duplicateId };
      });
      return c.json({ success: true, ...merged });
    } catch (err) {
      if (err instanceof Error && err.message === "NOT_FOUND") {
        return c.json({ error: "Not found" }, 404);
      }
      if (err instanceof Error && err.message === "IS_TRANSFER") {
        return c.json({ error: "Transfers can't be merged." }, 409);
      }
      console.error("[api] duplicate merge failed:", err);
      return c.json(
        { error: "Could not merge the duplicates. Please try again." },
        500
      );
    }
  });
}
