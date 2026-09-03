import { Hono } from "hono";
import { withUser } from "../db";
import { requireAuth } from "../middleware";
import { parseAmount } from "../validation";
import { readJson } from "./helpers";
import { getEntitlement } from "../queries/entitlements";
import {
  createItrDocument,
  createTaxInvestment,
  currentFinancialYear,
  deleteItrDocument,
  deleteTaxInvestment,
  exportInvestmentsCsv,
  exportItrCsv,
  exportUtilizationCsv,
  getItrCompletion,
  getItrDocument,
  getSalaryStructure,
  getSuggestions,
  getSummary,
  getTaxInvestment,
  getTaxSections,
  getTaxSlabs,
  getUtilization,
  isValidFinancialYear,
  listFinancialYears,
  listItrDocuments,
  listTaxInvestments,
  suggestItrDocuments,
  updateItrDocument,
  updateTaxInvestment,
  upsertSalaryStructure,
} from "../queries/tax";
import type { SalaryStructure } from "../queries/tax";

export const tax = new Hono();

const PROOF_STATUSES = ["pending", "collected", "submitted", "verified"];
const ITR_CATEGORIES = ["income_proof", "investment_proof", "deduction_proof", "other"];
const ITR_STATUSES = ["pending", "collected", "submitted"];
const EMPLOYMENT_TYPES = ["salaried", "business", "freelancer", "other"];

function fyParam(raw: string | undefined): { fy: string; error?: string } {
  const fy = (raw?.trim() || currentFinancialYear()).trim();
  if (!isValidFinancialYear(fy)) {
    return { fy, error: "Please choose a valid financial year (e.g. 2026-27)." };
  }
  return { fy };
}

function isoDateStr(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return raw;
}

// â”€â”€ Lookups â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
tax.get("/sections", requireAuth, async (c) => {
  const sections = await getTaxSections();
  return c.json({ sections });
});

tax.get("/regime-slabs", requireAuth, async (c) => {
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const regime = c.req.query("regime");
  if (regime && regime !== "old" && regime !== "new") {
    return c.json({ fieldErrors: { regime: "Please choose old or new regime." } }, 400);
  }
  const slabs = await getTaxSlabs(fy, regime);
  return c.json({ financial_year: fy, slabs });
});

// â”€â”€ Investments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
tax.post("/investments", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);

  const section = String(body.section ?? "").trim();
  const name = String(body.name ?? "").trim();
  const amount = parseAmount(body.amount);
  const investmentDate = String(body.investment_date ?? "").trim();
  const proofStatus = String(body.proof_status ?? "").trim();
  const { fy, error: fyError } = fyParam(String(body.financial_year ?? ""));
  const transactionProvided = body.transaction_id !== undefined;
  const transactionId =
    transactionProvided && (body.transaction_id === "" || body.transaction_id === null)
      ? null
      : transactionProvided
        ? String(body.transaction_id)
        : null;
  const notes = body.notes === undefined ? null : String(body.notes).trim() || null;

  const fieldErrors: Record<string, string> = {};
  const sections = await getTaxSections();
  const sectionCodes = new Set(sections.map((s) => s.section_code));
  if (!section) fieldErrors.section = "Please choose a section.";
  else if (!sectionCodes.has(section)) fieldErrors.section = "Please choose a valid section.";
  if (!name) fieldErrors.name = "Please enter a name for this investment.";
  if (amount === null || amount === undefined || amount <= 0) {
    fieldErrors.amount = "Please enter an amount greater than zero.";
  }
  if (!investmentDate || isoDateStr(investmentDate) === null) {
    fieldErrors.investment_date = "Please choose a valid investment date.";
  }
  if (!PROOF_STATUSES.includes(proofStatus)) {
    fieldErrors.proof_status = "Please choose a proof status.";
  }
  if (fyError) fieldErrors.financial_year = fyError;

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const taxInvEnt = await getEntitlement(user.user_id, "tax");
  if (!taxInvEnt.allowed) return c.json({ error: "plan_limit", feature: "tax", plan: taxInvEnt.plan }, 403);

  const investment = await withUser(user.user_id, (tx) =>
    createTaxInvestment(
      user.user_id,
      {
        section,
        name,
        amount: amount as number,
        investment_date: investmentDate,
        proof_status: proofStatus,
        financial_year: fy,
        transaction_id: transactionId,
        notes,
      },
      tx
    )
  );
  return c.json({ investment }, 201);
});

tax.get("/investments", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const section = c.req.query("section");
  const proofStatus = c.req.query("proof_status");
  if (section && !(await getTaxSections()).some((s) => s.section_code === section)) {
    return c.json({ fieldErrors: { section: "Please choose a valid section." } }, 400);
  }
  if (proofStatus && !PROOF_STATUSES.includes(proofStatus)) {
    return c.json({ fieldErrors: { proof_status: "Please choose a proof status." } }, 400);
  }
  const investments = await listTaxInvestments(
    user.user_id,
    fy,
    { section, proofStatus }
  );
  return c.json({ financial_year: fy, investments });
});

tax.get("/investments/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const investment = await getTaxInvestment(user.user_id, id);
  if (!investment) return c.json({ error: "Investment not found." }, 404);
  return c.json({ investment });
});

tax.patch("/investments/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);
  const version = Number(body.version ?? 1);

  const changes: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  if (body.section !== undefined) {
    const section = String(body.section).trim();
    const sections = await getTaxSections();
    if (!sections.some((s) => s.section_code === section)) {
      fieldErrors.section = "Please choose a valid section.";
    } else {
      changes.section = section;
    }
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) fieldErrors.name = "Please enter a name for this investment.";
    else changes.name = name;
  }
  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount);
    if (amount === null || amount <= 0) {
      fieldErrors.amount = "Please enter an amount greater than zero.";
    } else {
      changes.amount = amount;
    }
  }
  if (body.investment_date !== undefined) {
    const date = isoDateStr(String(body.investment_date));
    if (date === null) fieldErrors.investment_date = "Please choose a valid investment date.";
    else changes.investment_date = date;
  }
  if (body.proof_status !== undefined) {
    const status = String(body.proof_status);
    if (!PROOF_STATUSES.includes(status)) {
      fieldErrors.proof_status = "Please choose a proof status.";
    } else {
      changes.proof_status = status;
    }
  }
  if (body.financial_year !== undefined) {
    const { fy, error } = fyParam(String(body.financial_year));
    if (error) fieldErrors.financial_year = error;
    else changes.financial_year = fy;
  }
  if (body.transaction_id !== undefined) {
    changes.transaction_id =
      body.transaction_id === "" || body.transaction_id === null
        ? null
        : String(body.transaction_id);
  }
  if (body.notes !== undefined) {
    changes.notes = String(body.notes).trim() || null;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  if (Object.keys(changes).length === 0) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const result = await withUser(user.user_id, (tx) =>
    updateTaxInvestment(user.user_id, id, version, changes, tx)
  );
  if (!result.ok && result.reason === "not_found") {
    return c.json({ error: "Investment not found." }, 404);
  }
  if (!result.ok) {
    return c.json(
      { error: "This record was updated by another device. Refresh and try again.", code: "version_conflict" },
      409
    );
  }
  return c.json({ investment: result.investment });
});

tax.delete("/investments/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const deleted = await withUser(user.user_id, (tx) => deleteTaxInvestment(user.user_id, id, tx));
  if (!deleted) return c.json({ error: "Investment not found." }, 404);
  return c.json({ ok: true });
});

// â”€â”€ Utilization / summary / suggestions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
tax.get("/utilization", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const utilization = await getUtilization(user.user_id, fy);
  return c.json({ financial_year: fy, utilization });
});

tax.get("/summary", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const summary = await getSummary(user.user_id, fy);
  return c.json(summary);
});

tax.get("/compare", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const summary = await getSummary(user.user_id, fy);
  return c.json({
    financial_year: fy,
    has_salary: summary.salary !== null,
    old_regime: summary.computation?.old_regime ?? null,
    new_regime: summary.computation?.new_regime ?? null,
    savings: summary.computation?.savings ?? null,
    recommended: summary.computation?.recommended ?? null,
    recommended_label: summary.computation?.recommended_label ?? null,
  });
});

tax.get("/suggestions", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const suggestions = await getSuggestions(user.user_id, fy);
  return c.json({ financial_year: fy, suggestions });
});

// â”€â”€ Salary structure â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
tax.post("/salary", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const { fy, error: fyError } = fyParam(String(body.financial_year ?? ""));

  const employmentType = String(body.employment_type ?? "salaried");
  const basicMonthly = parseAmount(body.basic_monthly);
  const hraMonthly = parseAmount(body.hra_monthly);
  const ltaAnnual = parseAmount(body.lta_annual);
  const specialAllowances = parseAmount(body.special_allowances);
  const employerPf = parseAmount(body.employer_pf);
  const actualRentMonthly = parseAmount(body.actual_rent_monthly);
  const otherExemptions = parseAmount(body.other_exemptions);
  const grossAnnualIncome = parseAmount(body.gross_annual_income);
  const additionalIncome = parseAmount(body.additional_income);
  const tdsDeducted = parseAmount(body.tds_deducted);

  const fieldErrors: Record<string, string> = {};
  if (fyError) fieldErrors.financial_year = fyError;
  if (!EMPLOYMENT_TYPES.includes(employmentType)) {
    fieldErrors.employment_type = "Please choose a valid employment type.";
  }
  const isSalaried = employmentType === "salaried";
  if (isSalaried && (basicMonthly === null || basicMonthly < 0)) {
    fieldErrors.basic_monthly = "Please enter a valid basic monthly salary.";
  } else if (!isSalaried && basicMonthly !== null && basicMonthly < 0) {
    fieldErrors.basic_monthly = "Please enter a valid basic monthly salary.";
  }
  if (hraMonthly !== null && hraMonthly < 0) {
    fieldErrors.hra_monthly = "Please enter a valid HRA amount.";
  }
  if (specialAllowances !== null && specialAllowances < 0) {
    fieldErrors.special_allowances = "Please enter a valid special allowance.";
  }
  if (grossAnnualIncome !== null && grossAnnualIncome < 0) {
    fieldErrors.gross_annual_income = "Please enter a valid gross annual income.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const salary = await withUser(user.user_id, (tx) =>
    upsertSalaryStructure(
      user.user_id,
      fy,
      {
        employment_type: employmentType,
        basic_monthly: basicMonthly as number,
        hra_monthly: hraMonthly,
        lta_annual: ltaAnnual,
        special_allowances: specialAllowances,
        employer_pf: employerPf,
        actual_rent_monthly: actualRentMonthly,
        other_exemptions: otherExemptions,
        gross_annual_income: grossAnnualIncome,
        additional_income: additionalIncome,
        tds_deducted: tdsDeducted,
      },
      tx
    )
  );
  return c.json({ salary }, 201);
});

tax.get("/salary", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const salary = await getSalaryStructure(user.user_id, fy);
  if (!salary) return c.json({ financial_year: fy, salary: null });
  return c.json({ financial_year: fy, salary });
});

tax.patch("/salary", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const { fy, error: fyError } = fyParam(
    String(body.financial_year ?? c.req.query("financial_year") ?? "")
  );
  if (fyError) return c.json({ fieldErrors: { financial_year: fyError } }, 400);

  const fieldErrors: Record<string, string> = {};
  const input: Record<string, unknown> = {};
  const numberFields: [string, string][] = [
    ["employment_type", "employment_type"],
    ["basic_monthly", "basic_monthly"],
    ["hra_monthly", "hra_monthly"],
    ["lta_annual", "lta_annual"],
    ["special_allowances", "special_allowances"],
    ["employer_pf", "employer_pf"],
    ["actual_rent_monthly", "actual_rent_monthly"],
    ["other_exemptions", "other_exemptions"],
    ["gross_annual_income", "gross_annual_income"],
    ["additional_income", "additional_income"],
    ["tds_deducted", "tds_deducted"],
  ];
  for (const [key, field] of numberFields) {
    if (body[key] === undefined) continue;
    if (field === "employment_type") {
      if (!EMPLOYMENT_TYPES.includes(String(body[key]))) {
        fieldErrors.employment_type = "Please choose a valid employment type.";
      } else input.employment_type = String(body[key]);
      continue;
    }
    const value = body[key] === "" || body[key] === null ? null : parseAmount(body[key]);
    if (value !== null && value < 0) {
      fieldErrors[field] = "This value cannot be negative.";
      continue;
    }
    input[field] = value;
  }
  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  if (Object.keys(input).length === 0) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const salary = await withUser(user.user_id, (tx) =>
    upsertSalaryStructure(
      user.user_id,
      fy,
      input as Partial<Omit<SalaryStructure, "id" | "user_id" | "financial_year">>,
      tx
    )
  );
  return c.json({ salary });
});

// â”€â”€ ITR documents â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
tax.post("/itr/suggest", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const { fy, error } = fyParam(String(body.financial_year ?? ""));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const created = await withUser(user.user_id, (tx) => suggestItrDocuments(user.user_id, fy, tx));
  const completion = await getItrCompletion(user.user_id, fy);
  return c.json({ financial_year: fy, created, completion }, 201);
});

tax.get("/itr", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const category = c.req.query("category");
  const status = c.req.query("status");
  if (category && !ITR_CATEGORIES.includes(category)) {
    return c.json({ fieldErrors: { category: "Please choose a valid category." } }, 400);
  }
  if (status && !ITR_STATUSES.includes(status)) {
    return c.json({ fieldErrors: { status: "Please choose a valid status." } }, 400);
  }
  const documents = await listItrDocuments(user.user_id, fy, { category, status });
  return c.json({ financial_year: fy, documents });
});

tax.get("/itr/completion", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const completion = await getItrCompletion(user.user_id, fy);
  return c.json({ financial_year: fy, ...completion });
});

tax.get("/itr/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const document = await getItrDocument(user.user_id, id);
  if (!document) return c.json({ error: "Document not found." }, 404);
  return c.json({ document });
});

tax.post("/itr", requireAuth, async (c) => {
  const user = c.get("user");
  const body = await readJson(c);
  const { fy, error: fyError } = fyParam(String(body.financial_year ?? ""));
  const category = String(body.category ?? "").trim();
  const documentName = String(body.document_name ?? "").trim();
  const status = String(body.status ?? "").trim();
  const notes = body.notes === undefined ? null : String(body.notes).trim() || null;

  const fieldErrors: Record<string, string> = {};
  if (fyError) fieldErrors.financial_year = fyError;
  if (!ITR_CATEGORIES.includes(category)) {
    fieldErrors.category = "Please choose a valid category.";
  }
  if (!documentName) fieldErrors.document_name = "Please enter a document name.";
  if (!ITR_STATUSES.includes(status)) {
    fieldErrors.status = "Please choose a valid status.";
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }

  const document = await withUser(user.user_id, (tx) =>
    createItrDocument(
      user.user_id,
      {
        financial_year: fy,
        category,
        document_name: documentName,
        status,
        notes,
      },
      tx
    )
  );
  return c.json({ document }, 201);
});

tax.patch("/itr/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = await readJson(c);

  const changes: Record<string, unknown> = {};
  const fieldErrors: Record<string, string> = {};
  if (body.financial_year !== undefined) {
    const { fy, error } = fyParam(String(body.financial_year));
    if (error) fieldErrors.financial_year = error;
    else changes.financial_year = fy;
  }
  if (body.category !== undefined) {
    const category = String(body.category).trim();
    if (!ITR_CATEGORIES.includes(category)) {
      fieldErrors.category = "Please choose a valid category.";
    } else changes.category = category;
  }
  if (body.document_name !== undefined) {
    const documentName = String(body.document_name).trim();
    if (!documentName) fieldErrors.document_name = "Please enter a document name.";
    else changes.document_name = documentName;
  }
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!ITR_STATUSES.includes(status)) {
      fieldErrors.status = "Please choose a valid status.";
    } else changes.status = status;
  }
  if (body.notes !== undefined) {
    changes.notes = String(body.notes).trim() || null;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return c.json({ fieldErrors }, 400);
  }
  if (Object.keys(changes).length === 0) {
    return c.json({ error: "Nothing to update." }, 400);
  }

  const result = await withUser(user.user_id, (tx) =>
    updateItrDocument(user.user_id, id, changes, tx)
  );
  if (!result.ok && result.reason === "not_found") {
    return c.json({ error: "Document not found." }, 404);
  }
  if (!result.ok) {
    return c.json(
      { error: "This record was updated by another device. Refresh and try again.", code: "version_conflict" },
      409
    );
  }
  return c.json({ document: result.document });
});

tax.delete("/itr/:id", requireAuth, async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const deleted = await withUser(user.user_id, (tx) => deleteItrDocument(user.user_id, id, tx));
  if (!deleted) return c.json({ error: "Document not found." }, 404);
  return c.json({ ok: true });
});

// â”€â”€ Financial years / exports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
tax.get("/financial-years", requireAuth, async (c) => {
  const user = c.get("user");
  const financialYears = await listFinancialYears(user.user_id);
  return c.json({ financial_years: financialYears });
});

tax.get("/exports/utilization", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const csv = await exportUtilizationCsv(user.user_id, fy);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="tax-utilization-${fy}.csv"`
  );
  return c.body(`\uFEFF${csv}`);
});

tax.get("/exports/investments", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const csv = await exportInvestmentsCsv(user.user_id, fy);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="tax-investments-${fy}.csv"`
  );
  return c.body(`\uFEFF${csv}`);
});

tax.get("/exports/itr", requireAuth, async (c) => {
  const user = c.get("user");
  const { fy, error } = fyParam(c.req.query("financial_year"));
  if (error) return c.json({ fieldErrors: { financial_year: error } }, 400);
  const csv = await exportItrCsv(user.user_id, fy);
  c.header("Content-Type", "text/csv; charset=utf-8");
  c.header(
    "Content-Disposition",
    `attachment; filename="itr-documents-${fy}.csv"`
  );
  return c.body(`\uFEFF${csv}`);
});