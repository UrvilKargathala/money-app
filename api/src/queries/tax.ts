import { query } from "../db";

export type Queryable = { query: typeof query };

const DB: Queryable = { query };

// ─────────────────────────────────────────────────────────────────────────────
// Engine constants (adjust when the government announces a new budget)
// ─────────────────────────────────────────────────────────────────────────────
export const STD_DEDUCTION_OLD = 50000; // old regime flat standard deduction (₹/yr)
export const STD_DEDUCTION_NEW = 75000; // new regime flat standard deduction (₹/yr)
export const REBATE_87A_OLD = 25000; // Section 87A rebate, old regime (₹)
export const REBATE_87A_OLD_TAXABLE_CAP = 500000; // rebate applies when taxable income ≤ this (₹)
export const REBATE_87A_NEW = 60000; // Section 87A rebate, new regime (₹)
export const REBATE_87A_NEW_TAXABLE_CAP = 700000; // rebate applies when taxable income ≤ this (₹)
export const CESS_RATE = 0.04; // health & education cess
export const HRA_RENT_THRESHOLD = 0.1; // rent paid beyond 10% of basic qualifies for HRA exemption
export const HRA_MAX_RATE = 0.5; // HRA exemption capped at 50% of basic salary
export const MONTHS_PER_YEAR = 12;

export function money(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Types ────────────────────────────────────────────────────────────────────
export type TaxSectionRow = {
  section_code: string;
  name: string;
  description: string | null;
  max_limit: number;
  applicable_regime: string;
  sort_order: number;
};
export type TaxSection = TaxSectionRow;

export type TaxSlabRow = {
  id: string;
  financial_year: string;
  regime: string;
  slab_from: number;
  slab_to: number | null;
  rate: number;
  cess_rate: number;
};
export type TaxSlab = TaxSlabRow;

export type TaxInvestmentRow = {
  id: string;
  user_id: number;
  section_id: string;
  name: string;
  amount: string;
  investment_date: string;
  proof_status: string;
  transaction_id: string | null;
  notes: string | null;
  financial_year: string;
  version: number;
};

export type TaxInvestment = Omit<TaxInvestmentRow, "section_id" | "amount"> & {
  section: string;
  amount: number;
};

export type TaxInvestmentInput = {
  section: string;
  name: string;
  amount: number;
  investment_date: string;
  proof_status: string;
  financial_year: string;
  transaction_id: string | null;
  notes: string | null;
};

export type SalaryStructureRow = {
  id: string;
  user_id: number;
  financial_year: string;
  employment_type: string;
  basic_monthly: string;
  hra_monthly: string | null;
  lta_annual: string | null;
  special_allowances: string | null;
  employer_pf: string | null;
  actual_rent_monthly: string | null;
  other_exemptions: string | null;
  gross_annual_income: string | null;
  additional_income: string | null;
  tds_deducted: string | null;
};

export type SalaryStructure = Omit<
  SalaryStructureRow,
  | "basic_monthly"
  | "hra_monthly"
  | "lta_annual"
  | "special_allowances"
  | "employer_pf"
  | "actual_rent_monthly"
  | "other_exemptions"
  | "gross_annual_income"
  | "additional_income"
  | "tds_deducted"
> & {
  basic_monthly: number;
  hra_monthly: number | null;
  lta_annual: number | null;
  special_allowances: number | null;
  employer_pf: number | null;
  actual_rent_monthly: number | null;
  other_exemptions: number | null;
  gross_annual_income: number | null;
  additional_income: number | null;
  tds_deducted: number | null;
};

export type ItrRow = {
  id: string;
  user_id: number;
  financial_year: string;
  category: string;
  document_name: string;
  status: string;
  is_suggested: number;
  notes: string | null;
  version: number;
};
export type ItrDocument = ItrRow;

export type UtilizationItem = {
  section: string;
  name: string;
  max_limit: number;
  applicable_regime: string;
  invested: number;
  remaining: number;
  utilization_pct: number;
};

export type Suggestion = {
  section: string;
  name: string;
  max_limit: number;
  invested: number;
  remaining: number;
  suggested_amount: number;
  reason: string;
};

export type TaxComputation = {
  gross_income: number;
  exemptions: number;
  taxable_income: number;
  tax_before_rebate: number;
  rebate: number;
  income_tax: number;
  cess: number;
  total_tax: number;
  effective_rate: number;
};

export type RegimeComparison = {
  old_regime: TaxComputation;
  new_regime: TaxComputation;
  savings: number;
  recommended: "old" | "new";
  recommended_label: string;
};

export type ItrCompletion = {
  total: number;
  pending: number;
  collected: number;
  submitted: number;
  completion_pct: number;
};

// ── Pure helpers ─────────────────────────────────────────────────────────────
export function currentFinancialYear(d: Date = new Date()): string {
  const year = d.getFullYear();
  const start = d.getMonth() >= 3 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function isValidFinancialYear(fy: string): boolean {
  return /^\d{4}-\d{2}$/.test(fy);
}

/**
 * HRA exemption (salaried, old regime):
 * min(HRA paid × 12, rent × 12 − 10% of basic × 12, 50% of basic × 12)
 * Rent comes from the salary structure's actual_rent_monthly.
 */
export function hraExemption(
  basicMonthly: number,
  hraMonthly: number,
  rentMonthly: number
): number {
  const basicY = basicMonthly * MONTHS_PER_YEAR;
  const hraY = hraMonthly * MONTHS_PER_YEAR;
  const rentExcess = Math.max(0, rentMonthly * MONTHS_PER_YEAR - HRA_RENT_THRESHOLD * basicY);
  return money(Math.max(0, Math.min(hraY, rentExcess, HRA_MAX_RATE * basicY)));
}

/**
 * Slab tax over a contiguous slab table (slab_from is the boundary the next
 * slab starts at; the top slab has slab_to = null).
 */
export function computeSlabTax(taxable: number, slabs: TaxSlab[]): number {
  let tax = 0;
  for (const slab of slabs) {
    if (taxable <= slab.slab_from) continue;
    const upper = slab.slab_to === null ? taxable : Math.min(taxable, slab.slab_to);
    tax += (upper - slab.slab_from) * slab.rate;
  }
  return money(tax);
}

export function applyRebateAndCess(
  taxBeforeRebate: number,
  taxable: number,
  regime: "old" | "new"
): { rebate: number; income_tax: number; cess: number; total_tax: number } {
  const cap = regime === "old" ? REBATE_87A_OLD_TAXABLE_CAP : REBATE_87A_NEW_TAXABLE_CAP;
  const maxRebate = regime === "old" ? REBATE_87A_OLD : REBATE_87A_NEW;
  const rebate = taxable <= cap ? Math.min(maxRebate, taxBeforeRebate) : 0;
  const incomeTax = money(taxBeforeRebate - rebate);
  const cess = money(incomeTax * CESS_RATE);
  return { rebate, income_tax: incomeTax, cess, total_tax: money(incomeTax + cess) };
}

export function computeTaxComputation(
  taxable: number,
  regime: "old" | "new",
  slabs: TaxSlab[],
  grossIncome: number,
  exemptions: number
): TaxComputation {
  const taxBeforeRebate = computeSlabTax(taxable, slabs);
  const { rebate, income_tax, cess, total_tax } = applyRebateAndCess(
    taxBeforeRebate,
    taxable,
    regime
  );
  return {
    gross_income: money(grossIncome),
    exemptions: money(exemptions),
    taxable_income: money(taxable),
    tax_before_rebate: taxBeforeRebate,
    rebate,
    income_tax,
    cess,
    total_tax,
    effective_rate: taxable > 0 ? money(total_tax / taxable) : 0,
  };
}

const EXEMPT_SECTIONS = new Set(["STD", "HRA", "LTA"]);

function sumBySection(investments: TaxInvestment[]): Map<string, number> {
  const bySection = new Map<string, number>();
  for (const inv of investments) {
    bySection.set(inv.section, (bySection.get(inv.section) ?? 0) + inv.amount);
  }
  return bySection;
}

/**
 * Full regime comparison for a salary structure + investment list.
 * Old regime: gross − exemptions − std deduction − section deductions
 * (sections with applicable_regime 'old'/'both', capped at max_limit).
 * New regime: gross − exemptions − std deduction, no section deductions.
 */
export function computeSalaryBreakdown(
  salary: SalaryStructure,
  investments: TaxInvestment[],
  sections: TaxSection[],
  slabsOld: TaxSlab[],
  slabsNew: TaxSlab[]
): RegimeComparison {
  const isSalaried = salary.employment_type === "salaried";
  const basicY = (salary.basic_monthly ?? 0) * MONTHS_PER_YEAR;
  const hraY = (salary.hra_monthly ?? 0) * MONTHS_PER_YEAR;
  const specialY = (salary.special_allowances ?? 0) * MONTHS_PER_YEAR;
  const ltaSalary = salary.lta_annual ?? 0;

  const bySection = sumBySection(investments);
  const rentMonthly =
    salary.actual_rent_monthly ??
    (bySection.get("HRA") ?? 0) / MONTHS_PER_YEAR;
  const hraExempt = isSalaried
    ? hraExemption(salary.basic_monthly ?? 0, salary.hra_monthly ?? 0, rentMonthly)
    : 0;

  const gross = isSalaried
    ? basicY + hraY + specialY + ltaSalary + (salary.additional_income ?? 0)
    : (salary.gross_annual_income ?? 0) + (salary.additional_income ?? 0);

  const exemptions = hraExempt + (salary.other_exemptions ?? 0) + (bySection.get("LTA") ?? 0);
  const base = Math.max(0, gross - exemptions);

  let deductions = 0;
  for (const section of sections) {
    if (EXEMPT_SECTIONS.has(section.section_code)) continue;
    if (section.applicable_regime !== "old" && section.applicable_regime !== "both") continue;
    const invested = bySection.get(section.section_code) ?? 0;
    if (invested <= 0) continue;
    deductions += Math.min(invested, section.max_limit);
  }

  const oldTaxable = Math.max(0, base - STD_DEDUCTION_OLD - deductions);
  const newTaxable = Math.max(0, base - STD_DEDUCTION_NEW);

  const oldRegime = computeTaxComputation(oldTaxable, "old", slabsOld, gross, exemptions);
  const newRegime = computeTaxComputation(newTaxable, "new", slabsNew, gross, exemptions);
  const savings = money(oldRegime.total_tax - newRegime.total_tax);
  const recommended: "old" | "new" = savings > 0 ? "new" : "old";
  return {
    old_regime: oldRegime,
    new_regime: newRegime,
    savings,
    recommended,
    recommended_label: recommended === "new" ? "New Regime" : "Old Regime",
  };
}
// -- Lookups ------------------------------------------------------------------
export async function getTaxSections(db: Queryable = DB): Promise<TaxSection[]> {
  const result = await db.query(
    `SELECT section_code, name, description, max_limit, applicable_regime, sort_order
     FROM tax_sections ORDER BY sort_order`
  );
  return result.rows.map((r) => ({
    ...r,
    max_limit: Number(r.max_limit),
  }) as TaxSection);
}

export async function getTaxSlabs(
  financialYear: string,
  regime?: string,
  db: Queryable = DB
): Promise<TaxSlab[]> {
  const params: unknown[] = [financialYear];
  let sql = `SELECT id, financial_year, regime, slab_from, slab_to, rate, cess_rate
             FROM tax_regime_slabs WHERE financial_year = $1`;
  if (regime) {
    params.push(regime);
    sql += ` AND regime = $2`;
  }
  sql += ` ORDER BY regime, slab_from`;
  const result = await db.query(sql, params);
  return result.rows.map((r) => ({
    ...r,
    slab_from: Number(r.slab_from),
    slab_to: r.slab_to === null ? null : Number(r.slab_to),
    rate: Number(r.rate),
    cess_rate: Number(r.cess_rate),
  }) as TaxSlab);
}

export async function getSlabsFor(
  financialYear: string,
  regime: string,
  db: Queryable = DB
): Promise<TaxSlab[]> {
  return getTaxSlabs(financialYear, regime, db);
}

// -- Investments --------------------------------------------------------------
const INVESTMENT_COLUMNS = `id, user_id, section_id, name, amount, investment_date,
  proof_status, transaction_id, notes, financial_year, version`;

function mapInvestment(r: Record<string, unknown>): TaxInvestment {
  return {
    ...r,
    section: r.section_id,
    amount: Number(r.amount),
  } as unknown as TaxInvestment;
}

export async function listTaxInvestments(
  userId: number,
  financialYear: string,
  filters: { section?: string; proofStatus?: string } = {},
  db: Queryable = DB
): Promise<TaxInvestment[]> {
  const params: unknown[] = [userId, financialYear];
  let sql = `SELECT ${INVESTMENT_COLUMNS} FROM tax_investments
             WHERE user_id = $1 AND financial_year = $2`;
  if (filters.section) {
    params.push(filters.section);
    sql += ` AND section_id = $${params.length}`;
  }
  if (filters.proofStatus) {
    params.push(filters.proofStatus);
    sql += ` AND proof_status = $${params.length}`;
  }
  sql += ` ORDER BY investment_date DESC`;
  const result = await db.query(sql, params);
  return result.rows.map(mapInvestment);
}

export async function getTaxInvestment(
  userId: number,
  id: string,
  db: Queryable = DB
): Promise<TaxInvestment | null> {
  const result = await db.query(
    `SELECT ${INVESTMENT_COLUMNS} FROM tax_investments WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ? mapInvestment(result.rows[0]) : null;
}

export async function createTaxInvestment(
  userId: number,
  input: TaxInvestmentInput,
  db: Queryable = DB
): Promise<TaxInvestment> {
  const result = await db.query(
    `INSERT INTO tax_investments
       (user_id, section_id, name, amount, investment_date, proof_status, transaction_id, notes, financial_year)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING ${INVESTMENT_COLUMNS}`,
    [
      userId,
      input.section,
      input.name,
      input.amount,
      input.investment_date,
      input.proof_status,
      input.transaction_id,
      input.notes,
      input.financial_year,
    ]
  );
  return mapInvestment(result.rows[0]);
}

export async function updateTaxInvestment(
  userId: number,
  id: string,
  version: number,
  changes: Partial<TaxInvestmentInput>,
  db: Queryable = DB
): Promise<{ ok: true; investment: TaxInvestment } | { ok: false; reason: "not_found" | "version_conflict" }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const entries: [string, unknown][] = Object.entries(changes).filter(
    ([, v]) => v !== undefined
  );
  for (const [key, value] of entries) {
    params.push(value);
    sets.push(`${key === "section" ? "section_id" : key} = $${params.length}`);
  }
  params.push(version, id, userId);
  sets.push(`version = version + 1`);
  const result = await db.query(
    `UPDATE tax_investments SET ${sets.join(", ")}
     WHERE id = $${params.length - 1} AND user_id = $${params.length} AND version = $${params.length - 2}
     RETURNING ${INVESTMENT_COLUMNS}`,
    params
  );
  if (result.rows[0]) return { ok: true, investment: mapInvestment(result.rows[0]) };
  const exists = await db.query(
    `SELECT version FROM tax_investments WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  if (!exists.rows[0]) return { ok: false, reason: "not_found" };
  return { ok: false, reason: "version_conflict" };
}

export async function deleteTaxInvestment(
  userId: number,
  id: string,
  db: Queryable = DB
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM tax_investments WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

// -- Utilization --------------------------------------------------------------
export async function getUtilization(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<UtilizationItem[]> {
  const result = await db.query(
    `SELECT t.section_code, t.name, t.max_limit, t.applicable_regime,
            COALESCE((SELECT SUM(i.amount::numeric) FROM tax_investments i
                      WHERE i.user_id = $1 AND i.financial_year = $2
                        AND i.section_id = t.section_code), 0)::float8 AS invested
     FROM tax_sections t
     ORDER BY t.sort_order`,
    [userId, financialYear]
  );
  return result.rows.map((r) => {
    const invested = Number(r.invested);
    const maxLimit = Number(r.max_limit);
    const remaining = Math.max(0, maxLimit - invested);
    return {
      section: r.section_code,
      name: r.name,
      max_limit: maxLimit,
      applicable_regime: r.applicable_regime,
      invested: money(invested),
      remaining: money(remaining),
      utilization_pct: maxLimit > 0 ? money((invested / maxLimit) * 100) : 0,
    };
  });
}

// -- Salary structure ---------------------------------------------------------
const SALARY_COLUMNS = `id, user_id, financial_year, employment_type, basic_monthly,
  hra_monthly, lta_annual, special_allowances, employer_pf, actual_rent_monthly,
  other_exemptions, gross_annual_income, additional_income, tds_deducted`;

function mapSalary(r: Record<string, unknown>): SalaryStructure {
  const row = { ...r };
  for (const key of [
    "basic_monthly",
    "hra_monthly",
    "lta_annual",
    "special_allowances",
    "employer_pf",
    "actual_rent_monthly",
    "other_exemptions",
    "gross_annual_income",
    "additional_income",
    "tds_deducted",
  ]) {
    if (row[key] !== null) row[key] = Number(row[key]);
  }
  return row as unknown as SalaryStructure;
}

export async function getSalaryStructure(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<SalaryStructure | null> {
  const result = await db.query(
    `SELECT ${SALARY_COLUMNS} FROM salary_structures
     WHERE user_id = $1 AND financial_year = $2`,
    [userId, financialYear]
  );
  return result.rows[0] ? mapSalary(result.rows[0]) : null;
}

export async function upsertSalaryStructure(
  userId: number,
  financialYear: string,
  input: Partial<Omit<SalaryStructure, "id" | "user_id" | "financial_year">>,
  db: Queryable = DB
): Promise<SalaryStructure> {
  const result = await db.query(
    `INSERT INTO salary_structures
       (user_id, financial_year, employment_type, basic_monthly, hra_monthly,
        lta_annual, special_allowances, employer_pf, actual_rent_monthly,
        other_exemptions, gross_annual_income, additional_income, tds_deducted)
     VALUES ($1,$2,
       COALESCE($3, 'salaried'), COALESCE($4, 0),
       $5, $6, $7, $8, $9, $10, $11, $12,
       $13)
     ON CONFLICT (user_id, financial_year) DO UPDATE SET
       employment_type = COALESCE(EXCLUDED.employment_type, salary_structures.employment_type),
       basic_monthly = COALESCE(EXCLUDED.basic_monthly, salary_structures.basic_monthly),
       hra_monthly = COALESCE(EXCLUDED.hra_monthly, salary_structures.hra_monthly),
       lta_annual = COALESCE(EXCLUDED.lta_annual, salary_structures.lta_annual),
       special_allowances = COALESCE(EXCLUDED.special_allowances, salary_structures.special_allowances),
       employer_pf = COALESCE(EXCLUDED.employer_pf, salary_structures.employer_pf),
       actual_rent_monthly = COALESCE(EXCLUDED.actual_rent_monthly, salary_structures.actual_rent_monthly),
       other_exemptions = COALESCE(EXCLUDED.other_exemptions, salary_structures.other_exemptions),
       gross_annual_income = COALESCE(EXCLUDED.gross_annual_income, salary_structures.gross_annual_income),
       additional_income = COALESCE(EXCLUDED.additional_income, salary_structures.additional_income),
       tds_deducted = COALESCE(EXCLUDED.tds_deducted, salary_structures.tds_deducted)
     RETURNING ${SALARY_COLUMNS}`,
    [
      userId,
      financialYear,
      input.employment_type ?? null,
      input.basic_monthly ?? null,
      input.hra_monthly ?? null,
      input.lta_annual ?? null,
      input.special_allowances ?? null,
      input.employer_pf ?? null,
      input.actual_rent_monthly ?? null,
      input.other_exemptions ?? null,
      input.gross_annual_income ?? null,
      input.additional_income ?? null,
      input.tds_deducted ?? null,
    ]
  );
  return mapSalary(result.rows[0]);
}

// -- Summary / compare / suggestions ------------------------------------------
export async function getSummary(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<{
  financial_year: string;
  salary: SalaryStructure | null;
  total_invested: number;
  deduction_total: number;
  utilization: UtilizationItem[];
  computation: RegimeComparison | null;
}> {
  const [salary, investments, sections, slabsOld, slabsNew, utilization] = await Promise.all([
    getSalaryStructure(userId, financialYear, db),
    listTaxInvestments(userId, financialYear, {}, db),
    getTaxSections(db),
    getSlabsFor(financialYear, "old", db),
    getSlabsFor(financialYear, "new", db),
    getUtilization(userId, financialYear, db),
  ]);
  const bySection = sumBySection(investments);
  let deductionTotal = 0;
  for (const section of sections) {
    if (EXEMPT_SECTIONS.has(section.section_code)) continue;
    if (section.applicable_regime !== "old" && section.applicable_regime !== "both") continue;
    const invested = bySection.get(section.section_code) ?? 0;
    if (invested <= 0) continue;
    deductionTotal += Math.min(invested, section.max_limit);
  }
  const totalInvested = money([...bySection.values()].reduce((sum, v) => sum + v, 0));
  const computation = salary
    ? computeSalaryBreakdown(salary, investments, sections, slabsOld, slabsNew)
    : null;
  return {
    financial_year: financialYear,
    salary,
    total_invested: totalInvested,
    deduction_total: money(deductionTotal),
    utilization,
    computation,
  };
}

export async function getSuggestions(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<Suggestion[]> {
  const [utilization, investments] = await Promise.all([
    getUtilization(userId, financialYear, db),
    listTaxInvestments(userId, financialYear, {}, db),
  ]);
  const bySection = sumBySection(investments);
  const suggestions: Suggestion[] = [];
  for (const item of utilization) {
    if (EXEMPT_SECTIONS.has(item.section)) continue;
    if (item.applicable_regime !== "old" && item.applicable_regime !== "both") continue;
    if (item.remaining <= 0) continue;
    if (item.section === "80E" && bySection.get("80E") === undefined) continue;
    const suggested = money(item.remaining);
    suggestions.push({
      section: item.section,
      name: item.name,
      max_limit: item.max_limit,
      invested: item.invested,
      remaining: item.remaining,
      suggested_amount: suggested,
      reason:
        item.invested === 0
          ? `Start investing up to ?${suggested.toLocaleString("en-IN")} under ${item.section} to reduce taxable income.`
          : `Invest ?${suggested.toLocaleString("en-IN")} more under ${item.section} to fully utilize the limit.`,
    });
  }
  return suggestions.slice(0, 8);
}

// -- Financial years ----------------------------------------------------------
export async function listFinancialYears(
  userId: number,
  db: Queryable = DB
): Promise<string[]> {
  const result = await db.query(
    `SELECT DISTINCT financial_year FROM (
       SELECT financial_year FROM tax_investments WHERE user_id = $1
       UNION SELECT financial_year FROM salary_structures WHERE user_id = $1
       UNION SELECT financial_year FROM itr_documents WHERE user_id = $1
     ) years ORDER BY financial_year DESC`,
    [userId]
  );
  return result.rows.map((r) => r.financial_year as string);
}

// -- ITR documents ------------------------------------------------------------
const ITR_COLUMNS = `id, user_id, financial_year, category, document_name, status,
  is_suggested, notes`;

function mapItr(r: Record<string, unknown>): ItrDocument {
  return r as unknown as ItrDocument;
}

export async function listItrDocuments(
  userId: number,
  financialYear: string,
  filters: { category?: string; status?: string } = {},
  db: Queryable = DB
): Promise<ItrDocument[]> {
  const params: unknown[] = [userId, financialYear];
  let sql = `SELECT ${ITR_COLUMNS} FROM itr_documents
             WHERE user_id = $1 AND financial_year = $2`;
  if (filters.category) {
    params.push(filters.category);
    sql += ` AND category = $${params.length}`;
  }
  if (filters.status) {
    params.push(filters.status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY category, document_name`;
  const result = await db.query(sql, params);
  return result.rows.map(mapItr);
}

export async function getItrDocument(
  userId: number,
  id: string,
  db: Queryable = DB
): Promise<ItrDocument | null> {
  const result = await db.query(
    `SELECT ${ITR_COLUMNS} FROM itr_documents WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0] ? mapItr(result.rows[0]) : null;
}

export async function createItrDocument(
  userId: number,
  input: {
    financial_year: string;
    category: string;
    document_name: string;
    status: string;
    is_suggested?: number;
    notes: string | null;
  },
  db: Queryable = DB
): Promise<ItrDocument> {
  const result = await db.query(
    `INSERT INTO itr_documents
       (user_id, financial_year, category, document_name, status, is_suggested, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING ${ITR_COLUMNS}`,
    [
      userId,
      input.financial_year,
      input.category,
      input.document_name,
      input.status,
      input.is_suggested ?? 1,
      input.notes,
    ]
  );
  return mapItr(result.rows[0]);
}

export async function updateItrDocument(
  userId: number,
  id: string,
  changes: Partial<{
    financial_year: string;
    category: string;
    document_name: string;
    status: string;
    notes: string | null;
  }>,
  db: Queryable = DB
): Promise<{ ok: true; document: ItrDocument } | { ok: false; reason: "not_found" }> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const entries: [string, unknown][] = Object.entries(changes).filter(
    ([, v]) => v !== undefined
  );
  for (const [key, value] of entries) {
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  params.push(id, userId);
  const result = await db.query(
    `UPDATE itr_documents SET ${sets.join(", ")}
     WHERE id = $${params.length - 1} AND user_id = $${params.length}
     RETURNING ${ITR_COLUMNS}`,
    params
  );
  if (result.rows[0]) return { ok: true, document: mapItr(result.rows[0]) };
  return { ok: false, reason: "not_found" };
}

export async function deleteItrDocument(
  userId: number,
  id: string,
  db: Queryable = DB
): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM itr_documents WHERE id = $1 AND user_id = $2`,
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}

export function suggestedItrNames(financialYear: string): {
  category: string;
  document_name: string;
}[] {
  return [
    { category: "income_proof", document_name: `Form 16 - ${financialYear}` },
    { category: "income_proof", document_name: `Form 26AS - ${financialYear}` },
    { category: "income_proof", document_name: `Bank Account Statement - ${financialYear}` },
    { category: "investment_proof", document_name: `PPF Statement - ${financialYear}` },
    { category: "investment_proof", document_name: `ELSS / Mutual Fund Statements - ${financialYear}` },
    { category: "investment_proof", document_name: `LIC Premium Receipts - ${financialYear}` },
    { category: "investment_proof", document_name: `NPS Statement - ${financialYear}` },
    { category: "deduction_proof", document_name: `Health Insurance Premium Receipts - ${financialYear}` },
    { category: "deduction_proof", document_name: `Home Loan Interest Certificate - ${financialYear}` },
    { category: "other", document_name: `Rent Receipts / Rent Agreement - ${financialYear}` },
  ];
}

export async function suggestItrDocuments(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<ItrDocument[]> {
  const existing = await listItrDocuments(userId, financialYear, {}, db);
  const existingKeys = new Set(
    existing.map((doc) => `${doc.category}|${doc.document_name}`)
  );
  const created: ItrDocument[] = [];
  for (const suggestion of suggestedItrNames(financialYear)) {
    if (existingKeys.has(`${suggestion.category}|${suggestion.document_name}`)) continue;
    created.push(
      await createItrDocument(
        userId,
        {
          financial_year: financialYear,
          category: suggestion.category,
          document_name: suggestion.document_name,
          status: "pending",
          is_suggested: 1,
          notes: "Auto-suggested document",
        },
        db
      )
    );
  }
  return created;
}

export async function getItrCompletion(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<ItrCompletion> {
  const result = await db.query(
    `SELECT status, COUNT(*)::int AS count FROM itr_documents
     WHERE user_id = $1 AND financial_year = $2
     GROUP BY status`,
    [userId, financialYear]
  );
  const counts: Record<string, number> = { pending: 0, collected: 0, submitted: 0 };
  let total = 0;
  for (const row of result.rows) {
    counts[row.status] = Number(row.count);
    total += Number(row.count);
  }
return {
    total,
    pending: counts.pending,
    collected: counts.collected,
    submitted: counts.submitted,
    completion_pct: total > 0 ? money(((counts.collected + counts.submitted) / total) * 100) : 0,
  };
}

// -- Exports ------------------------------------------------------------------
function csvCell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

export async function exportUtilizationCsv(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<string> {
  const utilization = await getUtilization(userId, financialYear, db);
  const rows: (string | number | null)[][] = [
    ["Section", "Name", "Max Limit", "Invested", "Remaining", "Utilization %"],
    ...utilization.map((item) => [
      item.section,
      item.name,
      item.max_limit,
      item.invested,
      item.remaining,
      item.utilization_pct,
    ]),
  ];
  return toCsv(rows);
}

export async function exportInvestmentsCsv(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<string> {
  const investments = await listTaxInvestments(userId, financialYear, {}, db);
  const rows: (string | number | null)[][] = [
    ["Section", "Name", "Amount", "Investment Date", "Proof Status", "Financial Year", "Transaction ID", "Notes"],
    ...investments.map((inv) => [
      inv.section,
      inv.name,
      inv.amount,
      inv.investment_date,
      inv.proof_status,
      inv.financial_year,
      inv.transaction_id,
      inv.notes,
    ]),
  ];
  return toCsv(rows);
}

export async function exportItrCsv(
  userId: number,
  financialYear: string,
  db: Queryable = DB
): Promise<string> {
  const documents = await listItrDocuments(userId, financialYear, {}, db);
  const rows: (string | number | null)[][] = [
    ["Category", "Document Name", "Status", "Financial Year", "Notes"],
    ...documents.map((doc) => [
      doc.category,
      doc.document_name,
      doc.status,
      doc.financial_year,
      doc.notes,
    ]),
  ];
  return toCsv(rows);
}
