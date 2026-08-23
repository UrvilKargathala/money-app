import { describe, expect, it } from "vitest";
import { pool } from "../db";
import {
  createAccount,
  createInvestment,
  fixtureDb,
  postAs,
  requestAs,
} from "../test/helpers";

const db = fixtureDb();

async function createSipFor(
  user: ReturnType<typeof fixtureDb>["alice"],
  overrides: Record<string, unknown> = {}
): Promise<string> {
  const holdingId = await createInvestment(user, {
    name: "SIP Fund",
    units: 100,
    buyPrice: 100,
    currentPrice: 100,
  });
  const res = await postAs(user, "/api/sips", {
    investment_id: holdingId,
    amount: "5000",
    frequency: "monthly",
    next_date: new Date(Date.now() + 86_400_000).toISOString().slice(0, 10),
    start_date: "2026-01-01",
    ...overrides,
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { sip: { id: string } };
  return body.sip.id;
}

describe("sip CRUD and validation", () => {
  it("creates a SIP linked to a unit-based holding", async () => {
    const id = await createSipFor(db.alice);
    const res = await requestAs(db.alice, `/api/sips/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sip: {
        investment_name: string;
        amount: number;
        status: string;
        days_until_next: number;
      };
    };
    expect(body.sip.investment_name).toBe("SIP Fund");
    expect(body.sip.amount).toBe(5000);
    expect(body.sip.status).toBe("active");
    // Tomorrow's installment; allow UTC/local day-boundary drift.
    expect(body.sip.days_until_next).toBeGreaterThanOrEqual(0);
    expect(body.sip.days_until_next).toBeLessThanOrEqual(2);
  });

  it("validates holding, frequency, dates and amounts", async () => {
    const res = await postAs(db.alice, "/api/sips", {
      investment_id: "not-a-uuid",
      amount: "-5",
      frequency: "weekly",
      next_date: "bad",
      start_date: "also-bad",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.investment_id).toBeTruthy();
    expect(body.fieldErrors.amount).toBeTruthy();
    expect(body.fieldErrors.frequency).toBeTruthy();
    expect(body.fieldErrors.next_date).toBeTruthy();
  });

  it("rejects an unknown holding with a field error", async () => {
    const res = await postAs(db.alice, "/api/sips", {
      investment_id: "00000000-0000-4000-8000-000000000000",
      amount: "1000",
      frequency: "monthly",
      next_date: "2026-09-01",
      start_date: "2026-08-01",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      fieldErrors: { investment_id?: string };
    };
    expect(body.fieldErrors.investment_id).toBeTruthy();
  });

  it("patches fields; unknown ids 404", async () => {
    const id = await createSipFor(db.alice);
    const ok = await requestAs(db.alice, `/api/sips/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: "7500", notes: "bumped" }),
    });
    expect(ok.status).toBe(200);

    const detail = (await (
      await requestAs(db.alice, `/api/sips/${id}`)
    ).json()) as { sip: { amount: number; notes: string | null } };
    expect(detail.sip.amount).toBe(7500);
    expect(detail.sip.notes).toBe("bumped");

    expect(
      (
        await requestAs(db.alice, "/api/sips/00000000-0000-4000-8000-000000000000")
      ).status
    ).toBe(404);
  });

  it("deletes a SIP", async () => {
    const id = await createSipFor(db.alice);
    const del = await requestAs(db.alice, `/api/sips/${id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await requestAs(db.alice, `/api/sips/${id}`)).status).toBe(404);
  });
});

describe("sip status transitions", () => {
  it("pause → resume → complete with invalid transitions rejected", async () => {
    const id = await createSipFor(db.alice);

    expect((await postAs(db.alice, `/api/sips/${id}/resume`, {})).status).toBe(409);
    expect((await postAs(db.alice, `/api/sips/${id}/pause`, {})).status).toBe(200);
    expect((await postAs(db.alice, `/api/sips/${id}/pause`, {})).status).toBe(409);
    expect((await postAs(db.alice, `/api/sips/${id}/resume`, {})).status).toBe(200);
    expect((await postAs(db.alice, `/api/sips/${id}/complete`, {})).status).toBe(200);
    // Completed is terminal for every action.
    expect((await postAs(db.alice, `/api/sips/${id}/pause`, {})).status).toBe(409);
    expect((await postAs(db.alice, `/api/sips/${id}/installment`, {})).status).toBe(409);
  });
});

describe("sip installments", () => {
  it("logs a buy at current price, recomputes units and advances next date by a month", async () => {
    const accountId = await createAccount(db.alice, "Debit Account");
    const holdingId = await createInvestment(db.alice, {
      name: "Installment Fund",
      units: 100,
      buyPrice: 100,
      currentPrice: 100,
    });
    const sipId = await createSipFor(db.alice, {
      investment_id: holdingId,
      account_id: accountId,
      next_date: new Date().toISOString().slice(0, 10),
    });

    const res = await postAs(db.alice, `/api/sips/${sipId}/installment`, {});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { units_added: number };
    // 5000 / 100 price → exactly 50 units.
    expect(body.units_added).toBeCloseTo(50, 4);

    // Holding units recomputed: 100 initial + 50 installment.
    const detail = (await (
      await requestAs(db.alice, `/api/investments/${holdingId}`)
    ).json()) as {
      investment: { units: number };
      transactions: { notes: string | null; transaction_id: string | null }[];
    };
    expect(detail.investment.units).toBeCloseTo(150, 3);
    const installmentTxn = detail.transactions.find(
      (t) => t.notes === "SIP installment"
    )!;
    expect(installmentTxn).toBeTruthy();
    // Linked cash-outflow transaction created on the debit account.
    expect(installmentTxn.transaction_id).not.toBeNull();

    const linked = await pool.query<{ source: string; amount: string }>(
      `SELECT source, amount::text AS amount FROM transactions WHERE id = $1`,
      [installmentTxn.transaction_id]
    );
    expect(linked.rows[0].source).toBe("manual");
    expect(Number(linked.rows[0].amount)).toBe(5000);

    // Next installment moved ~1 month ahead.
    const sipDetail = (await (
      await requestAs(db.alice, `/api/sips/${sipId}`)
    ).json()) as { sip: { next_date: string; days_until_next: number } };
    expect(sipDetail.sip.days_until_next).toBeGreaterThan(20);
    expect(sipDetail.sip.days_until_next).toBeLessThan(35);
  });

  it("quarterly installments advance three months", async () => {
    const sipId = await createSipFor(db.alice, {
      frequency: "quarterly",
      next_date: new Date().toISOString().slice(0, 10),
    });
    const res = await postAs(db.alice, `/api/sips/${sipId}/installment`, {});
    expect(res.status).toBe(200);
    const detail = (await (
      await requestAs(db.alice, `/api/sips/${sipId}`)
    ).json()) as { sip: { days_until_next: number } };
    expect(detail.sip.days_until_next).toBeGreaterThan(80);
    expect(detail.sip.days_until_next).toBeLessThan(100);
  });

  it("rejects manual-mode holdings", async () => {
    const manualHolding = await createInvestment(db.alice, {
      name: "Manual FD",
      type: "fd",
      category: "debt",
    });
    // Strip pricing so valuation_mode stays manual — create without prices.
    void manualHolding;
    const res2 = await postAs(db.alice, "/api/investments", {
      name: "Manual PPF",
      type: "ppf",
      category: "government",
      purchase_date: "2026-01-15",
    });
    expect(res2.status).toBe(200);
    const { investment: manual } = (await res2.json()) as {
      investment: { id: string };
    };

    const sipRes = await postAs(db.alice, "/api/sips", {
      investment_id: manual.id,
      amount: "1000",
      frequency: "monthly",
      next_date: new Date().toISOString().slice(0, 10),
      start_date: "2026-01-01",
    });
    expect(sipRes.status).toBe(200);
    const { sip } = (await sipRes.json()) as { sip: { id: string } };

    const inst = await postAs(db.alice, `/api/sips/${sip.id}/installment`, {});
    expect(inst.status).toBe(409);
  });
});

describe("sip due list and export", () => {
  it("lists only active SIPs due within 7 days", async () => {
    await createSipFor(db.alice); // tomorrow
    const farFuture = new Date();
    farFuture.setDate(farFuture.getDate() + 30);
    await createSipFor(db.alice, {
      name: "Later Fund",
      next_date: farFuture.toISOString().slice(0, 10),
    });

    const res = await requestAs(db.alice, "/api/sips/due");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: { amount: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].amount).toBe(5000);
  });

  it("exports SIPs CSV", async () => {
    await createSipFor(db.alice);
    const res = await requestAs(db.alice, "/api/sips/export");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("Holding,Amount,Frequency,Next Installment");
    expect(text).toContain("SIP Fund");
  });
});

describe("cross-user isolation for sips", () => {
  it("bob cannot read or transition alice's SIP", async () => {
    const id = await createSipFor(db.alice);

    expect((await requestAs(db.bob, `/api/sips/${id}`)).status).toBe(404);
    expect((await postAs(db.bob, `/api/sips/${id}/pause`, {})).status).toBe(404);
    expect((await postAs(db.bob, `/api/sips/${id}/installment`, {})).status).toBe(404);

    const bobList = (await (
      await requestAs(db.bob, "/api/sips")
    ).json()) as { sips: unknown[] };
    expect(bobList.sips).toEqual([]);
  });
});
