import { describe, expect, it } from "vitest";
import {
  detectMapping,
  draftHash,
  parseCsv,
  resolveColumnIndex,
  rowToDraft,
} from "./csv";

describe("parseCsv (RFC-4180)", () => {
  it("handles quoted fields with commas, escaped quotes and CRLF", () => {
    const parsed = parseCsv(
      'Date,Description,Amount\r\n2026-01-05,"Coffee, large",120\r\n2026-01-06,"He said ""hi""",50\n'
    );
    expect(parsed.headers).toEqual(["Date", "Description", "Amount"]);
    expect(parsed.rows).toEqual([
      ["2026-01-05", "Coffee, large", "120"],
      ["2026-01-06", 'He said "hi"', "50"],
    ]);
  });

  it("keeps empty fields and skips blank trailing lines", () => {
    const parsed = parseCsv("a,b,c\n1,,3\n");
    expect(parsed.rows).toEqual([["1", "", "3"]]);
  });
});

describe("detectMapping aliases", () => {
  it("maps Indian bank statement headers", () => {
    const mapping = detectMapping([
      "Txn Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Balance",
    ]);
    expect(mapping.date).toBe(0);
    expect(mapping.description).toBe(1);
    expect(mapping.debit).toBe(2);
    expect(mapping.credit).toBe(3);
  });

  it("falls back to amount-prefix matching", () => {
    const mapping = detectMapping(["date", "amount in inr"]);
    expect(mapping.amount).toBe(1);
  });
});

describe("resolveColumnIndex", () => {
  it("resolves by name (case/space-insensitive) or index", () => {
    const headers = ["Txn Date", "Narration"];
    expect(resolveColumnIndex(headers, "txn date")).toBe(0);
    expect(resolveColumnIndex(headers, "Narration")).toBe(1);
    expect(resolveColumnIndex(headers, 1)).toBe(1);
    expect(resolveColumnIndex(headers, "missing")).toBeNull();
  });
});

describe("rowToDraft", () => {
  const headers = ["Date", "Description", "Debit", "Credit", "Category"];
  const mapping = detectMapping(headers);

  it("debit → expense, credit → income; both present is an error", () => {
    const debit = rowToDraft(headers, ["05/01/2026", "Groceries", "1,200.50", "", "Food"], mapping);
    expect(debit).toEqual({
      ok: true,
      draft: {
        date: "2026-01-05",
        amount: 1200.5,
        type: "expense",
        description: "Groceries",
        merchant_clean: null,
        category_name: "Food",
      },
    });

    const credit = rowToDraft(headers, ["06/01/2026", "Salary", "", "50000", "Income"], mapping);
    expect(credit.ok && credit.draft.type).toBe("income");

    const both = rowToDraft(headers, ["07/01/2026", "Weird", "10", "20", ""], mapping);
    expect(both.ok).toBe(false);
    if (!both.ok) expect(both.reason).toContain("both");
  });

  it("signed amounts infer direction; zero rejected", () => {
    const h = ["date", "description", "amount"];
    const m = detectMapping(h);
    const neg = rowToDraft(h, ["2026-02-01", "Fuel", "-300"], m);
    expect(neg.ok && neg.draft.type).toBe("expense");
    expect(neg.ok && neg.draft.amount).toBe(300);

    const zero = rowToDraft(h, ["2026-02-01", "Nothing", "0"], m);
    expect(zero.ok).toBe(false);
  });

  it("rejects bad calendar dates like 31/02/2026", () => {
    const outcome = rowToDraft(headers, ["31/02/2026", "Ghost", "", "", ""], mapping);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toContain("date");
  });
});

describe("draftHash stability", () => {
  it("normalizes case/whitespace and formats amounts consistently", () => {
    const base = { date: "2026-01-01", amount: 100, type: "expense" as const };
    const a = draftHash({ ...base, description: "  Big Bazaar ", merchant_clean: null, category_name: null });
    const b = draftHash({ ...base, description: "big bazaar", merchant_clean: null, category_name: null });
    expect(a).toBe(b);
  });
});
