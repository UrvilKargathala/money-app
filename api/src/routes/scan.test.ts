import { describe, expect, it, vi, beforeEach } from "vitest";
import { fixtureDb, postAs, requestAs } from "../test/helpers";
import { pool } from "../db";
import { parseReceiptText } from "../ocr/receipt-parser";

// Mock the OCR engine: parser + routes run against canned text, while sharp
// still processes a real (tiny) PNG buffer end to end.
vi.mock("../ocr/tesseract", () => ({
  getOcrProvider: () => ({
    name: "mock",
    extractText: async () => ({
      text: [
        "FRESH MART",
        "GSTIN 27ABCDE1234F1Z5",
        "Date: 12/09/2026",
        "Milk 2L 120.00",
        "Bread 40.00",
        "Subtotal 160.00",
        "CGST 7.20 SGST 7.20",
        "Grand Total 174.40",
        "UPI Ref 123456789012",
      ].join("\n"),
      words: [],
      meanConfidence: 95,
      engine: "mock",
    }),
  }),
  terminateOcrWorker: async () => undefined,
}));

const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

async function createAccount(user: { userId: number; email: string; token: string }, name: string): Promise<string> {
  const res = await postAs(user, "/api/accounts", {
    name,
    type: "bank_savings",
    opening_balance: 1000,
  });
  if (!res.ok) throw new Error(`createAccount failed: ${res.status}`);
  const list = (await (
    await requestAs(user, "/api/accounts")
  ).json()) as { accounts: { id: string; name: string }[] };
  const found = list.accounts.find((a) => a.name === name);
  if (!found) throw new Error("createAccount: not found after create");
  return found.id;
}

async function scanAs(
  user: { userId: number; email: string; token: string },
  accountId: string,
  path = "/api/scan"
): Promise<Response> {
  const form = new FormData();
  form.set("file", new File([PNG_1PX], "receipt.png", { type: "image/png" }));
  form.set("account_id", accountId);
  const headers = { cookie: `mm_session=${user.token}` };
  const { app } = await import("../app");
  return app.request(path, { method: "POST", headers, body: form });
}

describe("receipt parser (pure, no DB)", () => {
  it("extracts merchant/date/total/tax/utr/gstin with balanced math", () => {
    const out = parseReceiptText(
      [
        "FRESH MART",
        "GSTIN 27ABCDE1234F1Z5",
        "Date: 12/09/2026",
        "Subtotal 160.00",
        "CGST 7.20 SGST 7.20",
        "Grand Total 174.40",
        "UPI Ref 123456789012",
      ].join("\n"),
      95
    );
    expect(out.candidates).toHaveLength(1);
    const c = out.candidates[0];
    expect(c.merchant).toBe("FRESH MART");
    expect(c.date).toBe("2026-09-12");
    expect(c.amount).toBe(174.4);
    expect(c.taxAmount).toBe(14.4);
    expect(c.gstin).toBe("27ABCDE1234F1Z5");
    expect(c.utr).toBe("123456789012");
    expect(c.flags).not.toContain("unbalanced_math");
  });

  it("splits multi-total receipts into sibling candidates ($500 + $300 edge)", () => {
    const out = parseReceiptText(
      ["SHOP", "Total 500.00", "Advance Paid 200.00", "Balance Due 300.00"].join("\n"),
      90
    );
    const amounts = out.candidates.map((c) => c.amount);
    expect(amounts).toContain(500);
    expect(amounts).toContain(300);
    expect(out.candidates.every((c) => c.flags.includes("multi_total"))).toBe(true);
  });

  it("flags unbalanced math instead of silently committing", () => {
    const out = parseReceiptText(["SHOP", "Subtotal 100.00", "CGST 9.00", "Grand Total 150.00"].join("\n"), 90);
    expect(out.candidates[0].flags).toContain("unbalanced_math");
  });

  it("falls back to largest amount with low-trust flags when no total keyword", () => {
    const out = parseReceiptText(["SHOP", "Milk 120.00", "Bread 40.00"].join("\n"), 90);
    expect(out.candidates[0].amount).toBe(120);
    expect(out.candidates[0].flags).toContain("fallback_largest_amount");
  });
});

describe("scan routes", () => {
  const db = fixtureDb();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preview is stateless and returns candidates without DB writes", async () => {
    const form = new FormData();
    form.set("file", new File([PNG_1PX], "r.png", { type: "image/png" }));
    const { app } = await import("../app");
    const res = await app.request("/api/scan/preview", {
      method: "POST",
      headers: { cookie: `mm_session=${db.alice.token}` },
      body: form,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { candidates: { amount: number }[]; source: string };
    expect(body.source).toBe("image");
    expect(body.candidates).toHaveLength(1);
    expect(body.candidates[0].amount).toBe(174.4);
  });

  it("rejects non-image uploads with 400", async () => {
    const form = new FormData();
    form.set("file", new File([Buffer.from("hello")], "x.txt", { type: "text/plain" }));
    const { app } = await import("../app");
    const res = await app.request("/api/scan/preview", {
      method: "POST",
      headers: { cookie: `mm_session=${db.alice.token}` },
      body: form,
    });
    expect(res.status).toBe(400);
  });

  it("creates a review batch, edits a card, confirms into a transaction", async () => {
    const accountId = await createAccount(db.alice, "Scan Acct");
    const res = await scanAs(db.alice, accountId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      success: boolean;
      job: { id: string };
      cards: { id: string; merchant: string; amount: string; status: string }[];
    };
    expect(body.success).toBe(true);
    expect(body.cards).toHaveLength(1);
    expect(body.cards[0].merchant).toBe("FRESH MART");

    const cardId = body.cards[0].id;
    const patch = await requestAs(db.alice, `/api/scan/${body.job.id}/cards/${cardId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "200.00", status: "ready" }),
    });
    expect(patch.status).toBe(200);

    const confirm = await requestAs(db.alice, `/api/scan/${body.job.id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ card_ids: [cardId], account_id: accountId }),
    });
    expect(confirm.status).toBe(200);
    const cbody = (await confirm.json()) as { success: boolean; confirmed: number };
    expect(cbody.confirmed).toBe(1);

    const txns = await pool.query<{ amount: string; source: string }>(
      `SELECT amount::text AS amount, source FROM transactions WHERE user_id = $1 AND source = 'scan'`,
      [db.alice.userId]
    );
    expect(txns.rows).toHaveLength(1);
    expect(Number(txns.rows[0].amount)).toBe(200);
  });

  it("enforces the free 5 scans/month quota with 403 plan_limit", async () => {
    await pool.query(
      `UPDATE users SET plan_type = 'free', billing_cycle = NULL,
         premium_expires_at = NULL, legacy_member_number = NULL,
         created_at = CURRENT_TIMESTAMP - INTERVAL '40 days'
       WHERE user_id = $1`,
      [db.alice.userId]
    );
    const accountId = await createAccount(db.alice, "Quota Acct");
    for (let i = 0; i < 5; i += 1) {
      const res = await scanAs(db.alice, accountId);
      expect(res.status).toBe(200);
    }
    const sixth = await scanAs(db.alice, accountId);
    expect(sixth.status).toBe(403);
    const body = (await sixth.json()) as { error: string; feature: string; limit: number; used: number };
    expect(body.error).toBe("plan_limit");
    expect(body.feature).toBe("scan_jobs");
    expect(body.limit).toBe(5);
  });

  it("keeps scan jobs private between users", async () => {
    const accountId = await createAccount(db.alice, "Private Acct");
    const res = await scanAs(db.alice, accountId);
    const body = (await res.json()) as { job: { id: string } };
    const bob = await requestAs(db.bob, `/api/scan/${body.job.id}`);
    expect(bob.status).toBe(404);
  });
});
