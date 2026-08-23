import { describe, expect, it } from "vitest";
import {
  fixtureDb,
  postAs,
  requestAs,
  patchAs,
  createUser,
  createTaxInvestment,
} from "../test/helpers";
import type { TestUser } from "../test/helpers";
import {
  applyRebateAndCess,
  computeSlabTax,
  computeTaxComputation,
  currentFinancialYear,
  hraExemption,
} from "../queries/tax";
import { pool } from "../db";

const db = fixtureDb();

const SALARY_BODY = {
  employment_type: "salaried",
  basic_monthly: "50000",
  hra_monthly: "20000",
  special_allowances: "10000",
  lta_annual: "0",
  employer_pf: "5400",
  actual_rent_monthly: "0",
  other_exemptions: "0",
  gross_annual_income: "",
  additional_income: "0",
  tds_deducted: "0",
};

// Hand-computed FY 2026-27 expectations (slabs seeded in global-setup):
// old: 0% ≤250k, 5% 250-500k, 20% 500k-1M, 30% >1M (cess 4%)
// new: 0% ≤300k, 5% 300-600k, 10% 600-900k, 15% 900k-1.2M, 20% 1.2-1.5M, 30% >1.5M
// 87A: old 25k @ ≤500k, new 60k @ ≤700k. Std: old 50k, new 75k.

describe("tax engine unit math", () => {
  it("computes slab tax for old regime 12L", () => {
    const slabs = [
      { slab_from: 0, slab_to: 250000, rate: 0 },
      { slab_from: 250000, slab_to: 500000, rate: 0.05 },
      { slab_from: 500000, slab_to: 1000000, rate: 0.2 },
      { slab_from: 1000000, slab_to: null, rate: 0.3 },
    ] as never;
    expect(computeSlabTax(1200000, slabs)).toBe(172500);
    expect(computeSlabTax(250000, slabs)).toBe(0);
    expect(computeSlabTax(0, slabs)).toBe(0);
  });

  it("computes slab tax for new regime 12L", () => {
    const slabs = [
      { slab_from: 0, slab_to: 300000, rate: 0 },
      { slab_from: 300000, slab_to: 600000, rate: 0.05 },
      { slab_from: 600000, slab_to: 900000, rate: 0.1 },
      { slab_from: 900000, slab_to: 1200000, rate: 0.15 },
      { slab_from: 1200000, slab_to: 1500000, rate: 0.2 },
      { slab_from: 1500000, slab_to: null, rate: 0.3 },
    ] as never;
    expect(computeSlabTax(1200000, slabs)).toBe(90000);
  });

  it("applies the 87A rebate at the old-regime boundary", () => {
    const result = applyRebateAndCess(12500, 500000, "old");
    expect(result.rebate).toBe(12500);
    expect(result.income_tax).toBe(0);
    expect(result.total_tax).toBe(0);
  });

  it("applies the 87A rebate at the new-regime boundary", () => {
    const result = applyRebateAndCess(25000, 700000, "new");
    expect(result.rebate).toBe(25000);
    expect(result.total_tax).toBe(0);
  });

  it("skips the rebate above the new-regime cap and adds cess", () => {
    const result = applyRebateAndCess(35000, 800000, "new");
    expect(result.rebate).toBe(0);
    expect(result.income_tax).toBe(35000);
    expect(result.cess).toBe(1400);
    expect(result.total_tax).toBe(36400);
  });

  it("computes the HRA exemption triple cap", () => {
    expect(hraExemption(50000, 20000, 15000)).toBe(120000);
    expect(hraExemption(50000, 20000, 4000)).toBe(0);
    expect(hraExemption(100000, 60000, 50000)).toBe(480000);
  });

  it("derives the current financial year", () => {
    expect(currentFinancialYear(new Date("2026-08-01"))).toBe("2026-27");
    expect(currentFinancialYear(new Date("2026-03-01"))).toBe("2025-26");
    expect(currentFinancialYear(new Date("2027-03-31"))).toBe("2026-27");
  });
});

describe("tax lookups", () => {
  it("lists the 11 sections", async () => {
    const res = await requestAs(db.alice, "/api/tax/sections");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      sections: { section_code: string; max_limit: number; applicable_regime: string }[];
    };
    expect(body.sections).toHaveLength(11);
    const c = body.sections.find((s) => s.section_code === "80C");
    expect(c?.max_limit).toBe(150000);
  });

  it("lists regime slabs per financial year", async () => {
    const res = await requestAs(db.alice, "/api/tax/regime-slabs?financial_year=2026-27");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slabs: { regime: string; rate: number }[] };
    expect(body.slabs).toHaveLength(10);
    expect(body.slabs.filter((s) => s.regime === "old")).toHaveLength(4);
    expect(body.slabs.filter((s) => s.regime === "new")).toHaveLength(6);

    const oldOnly = await requestAs(db.alice, "/api/tax/regime-slabs?financial_year=2026-27&regime=old");
    const oldBody = (await oldOnly.json()) as { slabs: unknown[] };
    expect(oldBody.slabs).toHaveLength(4);
  });

  it("rejects malformed financial years", async () => {
    const res = await requestAs(db.alice, "/api/tax/regime-slabs?financial_year=2026");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.financial_year).toBeTruthy();
  });

  it("rejects unknown regimes", async () => {
    const res = await requestAs(db.alice, "/api/tax/regime-slabs?regime=hybrid");
    expect(res.status).toBe(400);
  });
});

describe("tax investment CRUD", () => {
  it("creates an investment", async () => {
    const res = await postAs(db.alice, "/api/tax/investments", {
      section: "80C",
      name: "PPF - SBI",
      amount: "50000",
      investment_date: "2026-05-15",
      proof_status: "collected",
      financial_year: "2026-27",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      investment: { id: string; section: string; amount: number; version: number; proof_status: string };
    };
    expect(body.investment.section).toBe("80C");
    expect(body.investment.amount).toBe(50000);
    expect(body.investment.version).toBe(1);
    expect(body.investment.proof_status).toBe("collected");
  });

  it("rejects invalid investment payloads", async () => {
    const res = await postAs(db.alice, "/api/tax/investments", {
      name: "",
      amount: "-5",
      investment_date: "not-a-date",
      proof_status: "bogus",
      financial_year: "2026",
      section: "NOPE",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.name).toBeTruthy();
    expect(body.fieldErrors.amount).toBeTruthy();
    expect(body.fieldErrors.investment_date).toBeTruthy();
    expect(body.fieldErrors.proof_status).toBeTruthy();
    expect(body.fieldErrors.financial_year).toBeTruthy();
    expect(body.fieldErrors.section).toBeTruthy();
  });

  it("lists and filters investments", async () => {
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS", amount: 40000 });
    await createTaxInvestment(db.alice, {
      section: "80D",
      name: "Health - Self",
      amount: 25000,
      proofStatus: "pending",
    });
    const all = await requestAs(db.alice, "/api/tax/investments?financial_year=2026-27");
    const allBody = (await all.json()) as { investments: { section: string }[] };
    expect(allBody.investments).toHaveLength(2);

    const filtered = await requestAs(db.alice, "/api/tax/investments?financial_year=2026-27&section=80C");
    const filteredBody = (await filtered.json()) as { investments: { section: string }[] };
    expect(filteredBody.investments).toHaveLength(1);
    expect(filteredBody.investments[0].section).toBe("80C");

    const pending = await requestAs(db.alice, "/api/tax/investments?financial_year=2026-27&proof_status=pending");
    const pendingBody = (await pending.json()) as { investments: { proof_status: string }[] };
    expect(pendingBody.investments).toHaveLength(1);
  });

  it("guards investments by user", async () => {
    const id = await createTaxInvestment(db.alice, { name: "Private" });
    const res = await requestAs(db.bob, `/api/tax/investments/${id}`);
    expect(res.status).toBe(404);
    const del = await requestAs(db.bob, `/api/tax/investments/${id}`);
    expect(del.status).toBe(404);
  });

  it("patches with optimistic versioning", async () => {
    const id = await createTaxInvestment(db.alice, { name: "ELSS", amount: 10000 });
    const stale = await patchAs(db.alice, `/api/tax/investments/${id}`, {
      version: 1,
      amount: "20000",
    });
    expect(stale.status).toBe(200);

    const conflict = await patchAs(db.alice, `/api/tax/investments/${id}`, {
      version: 1,
      amount: "30000",
    });
    expect(conflict.status).toBe(409);

    const good = await patchAs(db.alice, `/api/tax/investments/${id}`, {
      version: 2,
      amount: "30000",
      proof_status: "verified",
    });
    expect(good.status).toBe(200);
    const body = (await good.json()) as { investment: { amount: number; version: number; proof_status: string } };
    expect(body.investment.amount).toBe(30000);
    expect(body.investment.version).toBe(3);
    expect(body.investment.proof_status).toBe("verified");
  });

  it("deletes investments", async () => {
    const id = await createTaxInvestment(db.alice, { name: "Temp" });
    const res = await requestAs(db.alice, `/api/tax/investments/${id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    const again = await requestAs(db.alice, `/api/tax/investments/${id}`, { method: "DELETE" });
    expect(again.status).toBe(404);
  });
});

describe("tax salary structure", () => {
  it("creates a salaried structure", async () => {
    const res = await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { salary: { basic_monthly: number; employment_type: string } };
    expect(body.salary.basic_monthly).toBe(50000);
    expect(body.salary.employment_type).toBe("salaried");
  });

  it("upserts on re-post and merges on patch", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    const patch = await patchAs(db.alice, "/api/tax/salary?financial_year=2026-27", {
      basic_monthly: "60000",
    });
    expect(patch.status).toBe(200);
    const body = (await patch.json()) as {
      salary: { basic_monthly: number; hra_monthly: number; special_allowances: number };
    };
    expect(body.salary.basic_monthly).toBe(60000);
    expect(body.salary.hra_monthly).toBe(20000);
    expect(body.salary.special_allowances).toBe(10000);
  });

  it("reads the salary structure", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    const res = await requestAs(db.alice, "/api/tax/salary?financial_year=2026-27");
    const body = (await res.json()) as { salary: { basic_monthly: number } | null };
    expect(body.salary?.basic_monthly).toBe(50000);
    const other = await requestAs(db.alice, "/api/tax/salary?financial_year=2025-26");
    const otherBody = (await other.json()) as { salary: unknown };
    expect(otherBody.salary).toBeNull();
  });

  it("rejects a salaried structure without basic salary", async () => {
    const res = await postAs(db.alice, "/api/tax/salary", {
      employment_type: "salaried",
      basic_monthly: "",
    });
    expect(res.status).toBe(400);
  });
});

describe("tax summary and regime comparison", () => {
  it("computes the no-investment comparison (recommends new)", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    const res = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total_invested: number;
      deduction_total: number;
      computation: {
        old_regime: { gross_income: number; taxable_income: number; total_tax: number };
        new_regime: { gross_income: number; taxable_income: number; total_tax: number };
        savings: number;
        recommended: string;
      };
    };
    expect(body.total_invested).toBe(0);
    expect(body.computation.old_regime.gross_income).toBe(960000);
    expect(body.computation.old_regime.taxable_income).toBe(910000);
    expect(body.computation.old_regime.total_tax).toBe(98280);
    expect(body.computation.new_regime.taxable_income).toBe(885000);
    expect(body.computation.new_regime.total_tax).toBe(45240);
    expect(body.computation.savings).toBe(53040);
    expect(body.computation.recommended).toBe("new");
  });

  it("reduces old-regime tax with an 80C investment", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS", amount: 150000 });
    const res = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    const body = (await res.json()) as {
      deduction_total: number;
      computation: {
        old_regime: { taxable_income: number; total_tax: number };
      };
    };
    expect(body.deduction_total).toBe(150000);
    expect(body.computation.old_regime.taxable_income).toBe(760000);
    expect(body.computation.old_regime.total_tax).toBe(67080);
  });

  it("caps section deductions at the max limit", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    await createTaxInvestment(db.alice, { section: "80C", name: "Over-invested", amount: 160000 });
    const res = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    const body = (await res.json()) as { deduction_total: number };
    expect(body.deduction_total).toBe(150000);
  });

  it("applies the HRA exemption from actual rent paid", async () => {
    await postAs(db.alice, "/api/tax/salary", {
      ...SALARY_BODY,
      actual_rent_monthly: "15000",
    });
    await createTaxInvestment(db.alice, { section: "HRA", name: "Rent Receipts", amount: 180000 });
    const res = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    const body = (await res.json()) as {
      computation: { old_regime: { exemptions: number; taxable_income: number; total_tax: number } };
    };
    expect(body.computation.old_regime.exemptions).toBe(120000);
    expect(body.computation.old_regime.taxable_income).toBe(790000);
    expect(body.computation.old_regime.total_tax).toBe(73320);
  });

  it("ignores all section deductions in the new regime", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS", amount: 150000 });
    const res = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    const body = (await res.json()) as {
      computation: { new_regime: { taxable_income: number } };
    };
    expect(body.computation.new_regime.taxable_income).toBe(885000);
  });

  it("hits zero tax under 87A for a small freelancer income", async () => {
    const res = await postAs(db.alice, "/api/tax/salary", {
      employment_type: "business",
      basic_monthly: "",
      gross_annual_income: "450000",
    });
    expect(res.status).toBe(201);
    const summary = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    const body = (await summary.json()) as {
      computation: {
        old_regime: { taxable_income: number; total_tax: number };
        new_regime: { taxable_income: number; total_tax: number };
      };
    };
    expect(body.computation.old_regime.taxable_income).toBe(400000);
    expect(body.computation.old_regime.total_tax).toBe(0);
    expect(body.computation.new_regime.taxable_income).toBe(375000);
    expect(body.computation.new_regime.total_tax).toBe(0);
  });

  it("returns an empty comparison without a salary structure", async () => {
    const res = await requestAs(db.alice, "/api/tax/summary?financial_year=2026-27");
    const body = (await res.json()) as { salary: unknown; computation: unknown };
    expect(body.salary).toBeNull();
    expect(body.computation).toBeNull();
  });

  it("exposes the comparison via /compare", async () => {
    await postAs(db.alice, "/api/tax/salary", SALARY_BODY);
    const res = await requestAs(db.alice, "/api/tax/compare?financial_year=2026-27");
    const body = (await res.json()) as {
      has_salary: boolean;
      savings: number;
      recommended: string;
    };
    expect(body.has_salary).toBe(true);
    expect(body.savings).toBe(53040);
    expect(body.recommended).toBe("new");
  });
});

describe("tax utilization and suggestions", () => {
  it("reports per-section utilization", async () => {
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS", amount: 60000 });
    await createTaxInvestment(db.alice, { section: "80D", name: "Health", amount: 25000 });
    const res = await requestAs(db.alice, "/api/tax/utilization?financial_year=2026-27");
    const body = (await res.json()) as {
      utilization: { section: string; invested: number; max_limit: number; remaining: number; utilization_pct: number }[];
    };
    const c = body.utilization.find((u) => u.section === "80C");
    expect(c?.invested).toBe(60000);
    expect(c?.remaining).toBe(90000);
    expect(c?.utilization_pct).toBe(40);
    const d = body.utilization.find((u) => u.section === "80D");
    expect(d?.invested).toBe(25000);
    const e = body.utilization.find((u) => u.section === "80E");
    expect(e?.invested).toBe(0);
  });

  it("suggests the largest under-utilized sections", async () => {
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS", amount: 50000 });
    const res = await requestAs(db.alice, "/api/tax/suggestions?financial_year=2026-27");
    const body = (await res.json()) as {
      suggestions: { section: string; suggested_amount: number; reason: string }[];
    };
    const c = body.suggestions.find((s) => s.section === "80C");
    expect(c?.suggested_amount).toBe(100000);
    expect(c?.reason).toContain("80C");
    expect(body.suggestions.some((s) => s.section === "80E")).toBe(false);
  });

  it("drops sections from suggestions once fully invested", async () => {
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS", amount: 160000 });
    const res = await requestAs(db.alice, "/api/tax/suggestions?financial_year=2026-27");
    const body = (await res.json()) as { suggestions: { section: string }[] };
    expect(body.suggestions.some((s) => s.section === "80C")).toBe(false);
  });
});

describe("ITR documents", () => {
  it("creates and lists documents", async () => {
    const res = await postAs(db.alice, "/api/tax/itr", {
      financial_year: "2026-27",
      category: "income_proof",
      document_name: "Form 16 - 2026-27",
      status: "pending",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { document: { id: string; category: string } };
    expect(body.document.category).toBe("income_proof");

    const list = await requestAs(db.alice, "/api/tax/itr?financial_year=2026-27&category=income_proof");
    const listBody = (await list.json()) as { documents: { category: string }[] };
    expect(listBody.documents).toHaveLength(1);
  });

  it("rejects invalid document payloads", async () => {
    const res = await postAs(db.alice, "/api/tax/itr", {
      financial_year: "2026-27",
      category: "bogus",
      document_name: "",
      status: "done",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { fieldErrors: Record<string, string> };
    expect(body.fieldErrors.category).toBeTruthy();
    expect(body.fieldErrors.document_name).toBeTruthy();
    expect(body.fieldErrors.status).toBeTruthy();
  });

  it("patches documents", async () => {
    const res = await postAs(db.alice, "/api/tax/itr", {
      financial_year: "2026-27",
      category: "investment_proof",
      document_name: "Investment Proofs - 2026-27",
      status: "pending",
    });
    const { document } = (await res.json()) as { document: { id: string } };
    const good = await patchAs(db.alice, `/api/tax/itr/${document.id}`, {
      status: "collected",
    });
    expect(good.status).toBe(200);
    const body = (await good.json()) as { document: { status: string } };
    expect(body.document.status).toBe("collected");
  });

  it("deletes documents", async () => {
    const res = await postAs(db.alice, "/api/tax/itr", {
      financial_year: "2026-27",
      category: "other",
      document_name: "Misc",
      status: "pending",
    });
    const { document } = (await res.json()) as { document: { id: string } };
    const del = await requestAs(db.alice, `/api/tax/itr/${document.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    const missing = await requestAs(db.alice, `/api/tax/itr/${document.id}`);
    expect(missing.status).toBe(404);
  });

  it("suggests the standard document set once", async () => {
    const res = await postAs(db.alice, "/api/tax/itr/suggest", {
      financial_year: "2026-27",
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { created: { document_name: string }[] };
    expect(body.created).toHaveLength(10);

    const again = await postAs(db.alice, "/api/tax/itr/suggest", {
      financial_year: "2026-27",
    });
    const body2 = (await again.json()) as { created: unknown[] };
    expect(body2.created).toHaveLength(0);
  });

  it("reports completion progress", async () => {
    await postAs(db.alice, "/api/tax/itr/suggest", { financial_year: "2026-27" });
    const list = await requestAs(db.alice, "/api/tax/itr?financial_year=2026-27");
    const { documents } = (await list.json()) as { documents: { id: string; status: string }[] };
    await patchAs(db.alice, `/api/tax/itr/${documents[0].id}`, {
      status: "collected",
    });
    const res = await requestAs(db.alice, "/api/tax/itr/completion?financial_year=2026-27");
    const body = (await res.json()) as { total: number; collected: number; completion_pct: number };
    expect(body.total).toBe(10);
    expect(body.collected).toBe(1);
    expect(body.completion_pct).toBe(10);
  });
});

describe("tax exports and financial years", () => {
  it("exports utilization with a BOM", async () => {
    await createTaxInvestment(db.alice, { section: "80C", name: "ELSS, 2026", amount: 60000 });
    const res = await requestAs(db.alice, "/api/tax/exports/utilization?financial_year=2026-27");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(buffer);
    expect(text).toContain("Section,Name,Max Limit,Invested,Remaining");
    expect(text).toContain('80C,"Section 80C - ELSS, PPF, EPF, Life Insurance",150000,60000,90000,40');
  });

  it("exports investments with a BOM", async () => {
    await createTaxInvestment(db.alice, { section: "80D", name: "Health", amount: 25000 });
    const res = await requestAs(db.alice, "/api/tax/exports/investments?financial_year=2026-27");
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    expect(text).toContain("Section,Name,Amount,Investment Date,Proof Status");
    expect(text).toContain("Health");
  });

  it("exports ITR documents with a BOM", async () => {
    await postAs(db.alice, "/api/tax/itr", {
      financial_year: "2026-27",
      category: "income_proof",
      document_name: "Form 16 - 2026-27",
      status: "pending",
    });
    const res = await requestAs(db.alice, "/api/tax/exports/itr?financial_year=2026-27");
    expect(res.status).toBe(200);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    expect(text).toContain("Category,Document Name,Status");
    expect(text).toContain("Form 16 - 2026-27");
  });

  it("lists financial years from user data", async () => {
    await createTaxInvestment(db.alice, { name: "Old", financialYear: "2025-26" });
    await createTaxInvestment(db.alice, { name: "Current", financialYear: "2026-27" });
    const res = await requestAs(db.alice, "/api/tax/financial-years");
    const body = (await res.json()) as { financial_years: string[] };
    expect(body.financial_years).toContain("2025-26");
    expect(body.financial_years).toContain("2026-27");
  });

  it("exports are isolated per user", async () => {
    await createTaxInvestment(db.alice, { section: "80C", name: "Alice ELSS", amount: 10000 });
    const bob = await createUser("bob2@moneymind.test");
    const res = await requestAs(bob, "/api/tax/exports/utilization?financial_year=2026-27");
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(await res.arrayBuffer());
    expect(text).not.toContain("Alice ELSS");
    const row = text.split("\r\n").find((line) => line.startsWith("80C,"));
    const invested = Number(row?.match(/^80C,"[^"]*",\d+,(\d+),/)?.at(1) ?? -1);
    expect(invested).toBe(0);
  });
});