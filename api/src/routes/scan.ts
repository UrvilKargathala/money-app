import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { readJson, serverError } from "./helpers";
import { parseAmount } from "../validation";
import { activeAccountExists } from "../queries/references";
import { sniffImageKind, preprocessImage } from "../ocr/preprocess";
import { extractPdfText } from "../ocr/pdf-text";
import { getOcrProvider } from "../ocr/tesseract";
import { parseReceiptText } from "../ocr/receipt-parser";
import type { ParseOutcome } from "../ocr/types";
import {
  confirmScanCards,
  countScansThisMonth,
  createScanJob,
  deleteScanCard as deleteScanCardQuery,
  discardScanJob,
  getScanJob,
  getScanQuota,
  insertScanCards,
  linkScanCardCategories,
  listScanCards,
  resolveScanCategoryIds,
  updateScanCard,
} from "../queries/scans";

const scan = new Hono();

export const MAX_SCAN_BYTES = 5_000_000;
const uuidRe = /^[0-9a-f-]{36}$/i;

async function readUpload(c: {
  req: { parseBody: () => Promise<Record<string, unknown>> };
}): Promise<{ bytes: Uint8Array; filename: string; form: Record<string, unknown> } | { error: string }> {
  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    return { error: "Could not read the upload." };
  }
  const file = form.file as unknown;
  if (!(file instanceof File)) return { error: "Attach an image or PDF as 'file'." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return { error: "The file is empty." };
  if (bytes.byteLength > MAX_SCAN_BYTES) return { error: "Files up to 5MB are supported." };
  const filename = (file.name || "scan").trim().slice(0, 200);
  return { bytes, filename, form };
}

async function runPipeline(bytes: Uint8Array): Promise<ParseOutcome & { source: "image" | "pdf" }> {
  const kind = sniffImageKind(bytes);
  if (kind === "pdf") {
    const { text } = await extractPdfText(bytes);
    if (!text.trim()) {
      return { candidates: [], ocrMeanConfidence: 0, source: "pdf" };
    }
    const parsed = parseReceiptText(text, 90);
    return {
      candidates: parsed.candidates.map((c) => ({ ...c, flags: [...c.flags, "pdf_text"] })),
      ocrMeanConfidence: parsed.ocrMeanConfidence,
      source: "pdf",
    };
  }
  if (kind !== "jpeg" && kind !== "png" && kind !== "webp") {
    throw new Error("UNSUPPORTED_TYPE");
  }
  const preprocessed = await preprocessImage(bytes);
  const provider = getOcrProvider();
  const ocr = await provider.extractText(preprocessed);
  // bytes are freed with the request scope; nothing is persisted.
  return { ...parseReceiptText(ocr.text, ocr.meanConfidence), source: "image" };
}

/** Stateless: OCR + parse, no DB write, no quota consumed. */
scan.post("/preview", requireAuth, async (c) => {
  const user = c.get("user");
  void user;
  const upload = await readUpload(c);
  if ("error" in upload) return c.json({ error: upload.error }, 400);
  try {
    const outcome = await runPipeline(upload.bytes);
    return c.json({
      candidates: outcome.candidates,
      ocr_mean_confidence: outcome.ocrMeanConfidence,
      source: outcome.source,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "UNSUPPORTED_TYPE") {
      return c.json({ error: "Upload a jpeg, png, webp image or a PDF." }, 400);
    }
    if (err instanceof Error && err.message === "OCR_TIMEOUT") {
      return c.json({ error: "Scan timed out. Try a smaller or clearer image." }, 504);
    }
    console.error("[api] scan preview failed:", err);
    return serverError(c, "scan_read_file_failed", "Could not read the file. Please try again.");
  }
});

/** Creates a review batch: pipeline + scan_jobs/scan_cards rows. Consumes quota. */
scan.post("/", requireAuth, async (c) => {
  const user = c.get("user");
  const quota = await getScanQuota(user.user_id);
  if (!quota.allowed) {
    return c.json({ error: "plan_limit", feature: "scan_jobs", plan: quota.plan }, 403);
  }
  if (quota.limit !== null) {
    const used = await countScansThisMonth(user.user_id);
    if (used >= quota.limit) {
      return c.json(
        { error: "plan_limit", feature: "scan_jobs", plan: quota.plan, limit: quota.limit, used },
        403
      );
    }
  }

  const upload = await readUpload(c);
  if ("error" in upload) return c.json({ error: upload.error }, 400);
  const accountId = String(upload.form.account_id ?? "");
  if (!uuidRe.test(accountId)) {
    return c.json({ fieldErrors: { account_id: "Please choose an account." } }, 400);
  }
  if (!(await activeAccountExists(accountId, user.user_id))) {
    return c.json({ fieldErrors: { account_id: "This account doesn't exist or is inactive." } }, 400);
  }

  let outcome: ParseOutcome & { source: "image" | "pdf" };
  try {
    outcome = await runPipeline(upload.bytes);
  } catch (err) {
    if (err instanceof Error && err.message === "UNSUPPORTED_TYPE") {
      return c.json({ error: "Upload a jpeg, png, webp image or a PDF." }, 400);
    }
    if (err instanceof Error && err.message === "OCR_TIMEOUT") {
      return c.json({ error: "Scan timed out. Try a smaller or clearer image." }, 504);
    }
    console.error("[api] scan failed:", err);
    return serverError(c, "scan_read_file_failed", "Could not read the file. Please try again.");
  }
  if (outcome.candidates.length === 0) {
    return c.json({ error: "No readable data found. Try a clearer image." }, 422);
  }

  try {
    const result = await withUser(user.user_id, async (client) => {
      const jobId = await createScanJob(client, {
        userId: user.user_id,
        filename: upload.filename,
        totalCards: outcome.candidates.length,
        accountId,
      });
      const cardIds = await insertScanCards(client, jobId, user.user_id, outcome.candidates);
      const categoryIds = await resolveScanCategoryIds(
        client,
        user.user_id,
        outcome.candidates.map((cc) => cc.categoryGuess)
      );
      await linkScanCardCategories(
        client,
        user.user_id,
        jobId,
        cardIds.map((id, i) => ({ cardId: id, categoryId: categoryIds[i] }))
      );
      return { jobId, cardIds };
    });
    const cards = await listScanCards(user.user_id, result.jobId);
    return c.json({ success: true, job: { id: result.jobId }, cards });
  } catch (err) {
    console.error("[api] create scan job failed:", err);
    return serverError(c, "scan_save_scan_failed", "Could not save the scan. Please try again.");
  }
});

scan.get("/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const job = await getScanJob(user.user_id, id);
  if (!job) return c.json({ error: "Not found" }, 404);
  return c.json({ job, cards: await listScanCards(user.user_id, id) });
});

scan.patch("/:id/cards/:cardId", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const cardId = c.req.param("cardId");
  if (!uuidRe.test(id) || !uuidRe.test(cardId)) return c.json({ error: "Not found" }, 404);
  const job = await getScanJob(user.user_id, id);
  if (!job || (job.status !== "review" && job.status !== "partial")) {
    return c.json({ error: "Not found" }, 404);
  }
  const body = await readJson(c);
  const fieldErrors: Record<string, string> = {};
  const patch: {
    merchant?: string | null;
    date?: string | null;
    amount?: number | null;
    categoryId?: string | null;
    status?: "review" | "ready";
  } = {};
  if (body.merchant !== undefined) {
    patch.merchant = String(body.merchant).trim().slice(0, 80) || null;
  }
  if (body.date !== undefined) {
    const d = String(body.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) {
      fieldErrors.date = "Choose a valid date.";
    } else {
      patch.date = d;
    }
  }
  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount);
    if (amount === null || amount <= 0) {
      fieldErrors.amount = "Please enter an amount greater than zero.";
    } else {
      patch.amount = amount;
    }
  }
  if (body.category_id !== undefined) {
    const categoryId = String(body.category_id ?? "") || null;
    if (categoryId !== null && !uuidRe.test(categoryId)) {
      fieldErrors.category_id = "Please choose a valid category.";
    } else {
      patch.categoryId = categoryId;
    }
  }
  if (body.status !== undefined) {
    if (body.status !== "review" && body.status !== "ready") {
      fieldErrors.status = "Status must be review or ready.";
    } else {
      patch.status = body.status;
    }
  }
  if (Object.keys(fieldErrors).length > 0) return c.json({ fieldErrors }, 400);
  const ok = await withUser(user.user_id, (client) =>
    updateScanCard(client, { userId: user.user_id, cardId, ...patch })
  );
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

scan.post("/:id/confirm", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const job = await getScanJob(user.user_id, id);
  if (!job || (job.status !== "review" && job.status !== "partial")) {
    return c.json({ error: "Not found" }, 404);
  }
  const body = await readJson(c);
  const cardIds = Array.isArray(body.card_ids)
    ? (body.card_ids as unknown[]).map(String).filter((v) => uuidRe.test(v))
    : null;
  const accountId = String(body.account_id ?? job.account_id ?? "");
  if (!uuidRe.test(accountId)) {
    return c.json({ fieldErrors: { account_id: "Please choose an account." } }, 400);
  }
  if (!(await activeAccountExists(accountId, user.user_id))) {
    return c.json({ fieldErrors: { account_id: "This account doesn't exist or is inactive." } }, 400);
  }
  const cards = await listScanCards(user.user_id, id);
  const confirmable = cards.filter((cc) => cc.status === "review" || cc.status === "ready");
  const targets = cardIds === null ? confirmable.map((cc) => cc.id) : cardIds;
  if (targets.length === 0) return c.json({ error: "Nothing to confirm." }, 400);
  try {
    const result = await withUser(user.user_id, (client) =>
      confirmScanCards(client, { userId: user.user_id, jobId: id, cardIds: targets, accountId })
    );
    return c.json({ success: true, ...result });
  } catch (err) {
    console.error("[api] confirm scan failed:", err);
    return serverError(c, "scan_confirm_scan_failed", "Could not confirm the scan. Please try again.");
  }
});

scan.post("/:id/discard", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!uuidRe.test(id)) return c.json({ error: "Not found" }, 404);
  const ok = await withUser(user.user_id, (client) => discardScanJob(client, user.user_id, id));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

scan.delete("/:id/cards/:cardId", requireAuth, async (c) => {
  const user = c.get("user");
  const cardId = c.req.param("cardId");
  if (!uuidRe.test(cardId)) return c.json({ error: "Not found" }, 404);
  const ok = await withUser(user.user_id, (client) =>
    deleteScanCardQuery(client, user.user_id, cardId)
  );
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ success: true });
});

export { scan };
