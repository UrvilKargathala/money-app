import { describe, expect, it } from "vitest";
import {
  createInvestment,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function createDividendFor(
  user: ReturnType<typeof fixtureDb>["alice"],
  overrides: Record<string, unknown> = {}
): Promise<{ dividendId: string; investmentId: string }> {
  const holdingId = await createInvestment(user, {
    name: "Dividend Stock",
    type: "stock",
    category: "equity",
  });
  const res = await postAs(user, "/api/dividends", {
    investment_id: holdingId,
    type: "dividend",
    amount: "1250.50",
    date: "2026-07-15",
    notes: "Q1 payout",
    ...overrides,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { dividend: { id: string } };
  return { dividendId: body.dividend.id, investmentId: holdingId };
}

describe("dividend CRUD and validation", () => {
  it("records a payout and reads it back", async () => {
    const { dividendId } = await createDividendFor(db.alice);

    const detail = await requestAs(db.alice, `/api/dividends/${dividendId}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      dividend: {
        type: string;
        amount: number;
        date: string;
        investment_name: string;
        notes: string | null;
      };
    };
    expect(body.dividend.type).toBe("dividend");
    expect(body.dividend.amount).toBe(1250.5);
    expect(body.dividend.date).toBe("2026-07-15");
    expect(body.dividend.investment_name).toBe("Dividend Stock");
    expect(body.dividend.notes).toBe("Q1 payout");
  });

  it("accepts interest and maturity_proceeds types", async () => {
    const { investmentId } = await createDividendFor(db.alice);
    const interest = await postAs(db.alice, "/api/dividends", {
      investment_id: investmentId,
      type: "interest",
      amount: "300",
      date: "2026-08-01",
    });
    expect(interest.status).toBe(200);
    const maturity = await postAs(db.alice, "/api/dividends", {
      investment_id: investmentId,
      type: "maturity_proceeds",
      amount: "100000",
      date: "2027-01-01",
    });
    expect(maturity.status).toBe(200);
  });

  it("validates type, amount, dates and uuid shapes", async () => {
    const res = await postAs(db.alice, "/api/dividends", {
      investment_id: "junk",
      type: "bonus",
      amount: "-1",
      date: "yesterday-ish",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.investment_id).toBeTruthy();
    expect(body.fieldErrors.type).toBeTruthy();
    expect(body.fieldErrors.amount).toBeTruthy();
    expect(body.fieldErrors.date).toBeTruthy();
  });

  it("rejects payouts against another user's holding with a field error", async () => {
    const bobHolding = await createInvestment(db.bob, { name: "Bob Stock" });
    const res = await postAs(db.alice, "/api/dividends", {
      investment_id: bobHolding,
      type: "dividend",
      amount: "500",
      date: "2026-07-15",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      fieldErrors: { investment_id?: string };
    };
    expect(body.fieldErrors.investment_id).toBeTruthy();
  });

  it("filters the list by holding", async () => {
    const { investmentId } = await createDividendFor(db.alice);
    const other = await createInvestment(db.alice, { name: "Other Holding" });
    await postAs(db.alice, "/api/dividends", {
      investment_id: other,
      type: "dividend",
      amount: "10",
      date: "2026-06-01",
    });

    const filtered = (await (
      await requestAs(
        db.alice,
        `/api/dividends?investment_id=${investmentId}`
      )
    ).json()) as { dividends: { investment_name: string }[] };
    expect(filtered.dividends).toHaveLength(1);
    expect(filtered.dividends[0].investment_name).toBe("Dividend Stock");
  });

  it("patches and deletes; unknown ids 404", async () => {
    const { dividendId } = await createDividendFor(db.alice);

    const patch = await requestAs(db.alice, `/api/dividends/${dividendId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "interest",
        amount: "999.99",
        date: "2026-09-30",
        notes: null,
      }),
    });
    expect(patch.status).toBe(200);
    const after = (await (
      await requestAs(db.alice, `/api/dividends/${dividendId}`)
    ).json()) as { dividend: { type: string; amount: number } };
    expect(after.dividend.type).toBe("interest");
    expect(after.dividend.amount).toBe(999.99);

    const del = await requestAs(db.alice, `/api/dividends/${dividendId}`, {
      method: "DELETE",
    });
    expect(del.status).toBe(200);
    expect((await requestAs(db.alice, `/api/dividends/${dividendId}`)).status).toBe(404);
    expect((await requestAs(db.alice, `/api/dividends/${dividendId}`, { method: "DELETE" })).status).toBe(404);
  });

  it("rejects a malformed PATCH payload", async () => {
    const { dividendId } = await createDividendFor(db.alice);
    const bad = await requestAs(db.alice, `/api/dividends/${dividendId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "nope", amount: "0", date: "x" }),
    });
    expect(bad.status).toBe(400);
  });
});

describe("cross-user isolation for dividends", () => {
  it("bob cannot read alice's payout", async () => {
    const { dividendId } = await createDividendFor(db.alice);

    expect((await requestAs(db.bob, `/api/dividends/${dividendId}`)).status).toBe(404);
    expect(
      (
        await requestAs(db.bob, `/api/dividends/${dividendId}`, {
          method: "DELETE",
        })
      ).status
    ).toBe(404);

    const bobList = (await (
      await requestAs(db.bob, "/api/dividends")
    ).json()) as { dividends: unknown[] };
    expect(bobList.dividends).toEqual([]);
  });
});
