import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { Pool } from "pg";
import { loadEnvLocal, testDatabaseUrl } from "./env";

const DEFAULTS: Record<string, string> = {
  PGHOST: "localhost",
  PGPORT: "5432",
  PGUSER: "postgres",
  PGPASSWORD: "postgres",
};

const ACCOUNT_TYPES = [
  ["bank_savings", "Savings Account", "wallet", 1, 1],
  ["bank_current", "Current Account", "briefcase", 1, 2],
  ["credit_card", "Credit Card", "card", 0, 3],
  ["wallet", "E-Wallet", "phone", 1, 4],
  ["cash", "Cash", "note", 1, 5],
  ["fd", "Fixed Deposit", "lock", 1, 6],
  ["ppf", "PPF Account", "shield", 1, 7],
];

const DEBT_TYPES = [
  ["home_loan", "Home Loan", 1, 1],
  ["car_loan", "Car Loan", 1, 2],
  ["personal_loan", "Personal Loan", 0, 3],
  ["education_loan", "Education Loan", 0, 4],
  ["credit_card", "Credit Card", 0, 5],
  ["other", "Other Loan", 0, 6],
];

const TAX_SECTIONS = [
  ["80C", "Section 80C - ELSS, PPF, EPF, Life Insurance", "Deductions on 80C investments", 150000, "old", 1],
  ["80CCD-1B", "Section 80CCD(1B) - NPS Additional", "NPS extra deduction", 50000, "both", 2],
  ["80D", "Section 80D - Health Insurance", "Health insurance premiums", 100000, "both", 3],
  ["80DD", "Section 80DD - Disabled Dependent", "Medical of disabled dependent", 150000, "old", 4],
  ["80E", "Section 80E - Education Loan Interest", "Interest on education loans", 999999, "old", 5],
  ["80G", "Section 80G - Donations", "Donations to eligible funds", 50000, "old", 6],
  ["80TTA", "Section 80TTA - Savings Interest", "Interest up to 10000 exempt", 10000, "old", 7],
  ["24B", "Section 24(b) - Home Loan Interest", "Self-occupied property interest", 200000, "old", 8],
  ["HRA", "HRA Exemption", "House rent allowance exemption", 999999, "old", 9],
  ["LTA", "LTA Exemption", "Leave travel allowance", 999999, "old", 10],
  ["STD", "Standard Deduction", "Flat standard deduction", 50000, "both", 11],
];

const TAX_SLABS = [
  ["2026-27", "old", 0, 250000, 0.0, 0.04],
  ["2026-27", "old", 250000, 500000, 0.05, 0.04],
  ["2026-27", "old", 500000, 1000000, 0.2, 0.04],
  ["2026-27", "old", 1000000, 999999999, 0.3, 0.04],
  ["2026-27", "new", 0, 300000, 0.0, 0.04],
  ["2026-27", "new", 300000, 600000, 0.05, 0.04],
  ["2026-27", "new", 600000, 900000, 0.1, 0.04],
  ["2026-27", "new", 900000, 1200000, 0.15, 0.04],
  ["2026-27", "new", 1200000, 1500000, 0.2, 0.04],
  ["2026-27", "new", 1500000, 999999999, 0.3, 0.04],
];

const NOTE_TEMPLATES: [string, string, string, object, string, number][] = [
  ["passport", "Passport", "Passport number and details",
    { fields: [{ key: "passport_no", label: "Passport Number" }, { key: "expiry", label: "Expiry Date" }] }, "globe", 1],
  ["pan_card", "PAN Card", "PAN number",
    { fields: [{ key: "pan_no", label: "PAN Number" }] }, "file", 2],
  ["aadhaar", "Aadhaar", "Aadhaar number",
    { fields: [{ key: "aadhaar_no", label: "Aadhaar Number" }] }, "id", 3],
  ["driving_license", "Driving License", "Driving license details",
    { fields: [{ key: "license_no", label: "License Number" }, { key: "expiry", label: "Expiry Date" }] }, "car", 4],
  ["vehicle_rc", "Vehicle RC", "Vehicle registration certificate",
    { fields: [{ key: "reg_no", label: "Registration Number" }, { key: "chassis_no", label: "Chassis Number" }] }, "car", 5],
  ["health_insurance", "Health Insurance Policy", "Health policy details",
    { fields: [{ key: "policy_no", label: "Policy Number" }, { key: "expiry", label: "Expiry Date" }, { key: "sum_insured", label: "Sum Insured" }] }, "heart", 6],
  ["vehicle_insurance", "Vehicle Insurance", "Vehicle policy details",
    { fields: [{ key: "policy_no", label: "Policy Number" }, { key: "expiry", label: "Expiry Date" }] }, "car", 7],
  ["membership", "Membership Card", "Gym / club membership",
    { fields: [{ key: "member_id", label: "Membership ID" }, { key: "expiry", label: "Expiry Date" }] }, "star", 8],
];

function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "scripts", "db_setup.py"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("Cannot locate the repo root (scripts/db_setup.py not found).");
}

/**
 * Seeds the system lookups that `db_setup.py` intentionally leaves out
 * (they normally come from `scripts/mock_data.py`): account_types. Test
 * categories are created per-test through the API instead.
 */
async function seedLookups(databaseUrl: string): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const placeholders = ACCOUNT_TYPES.map(
      (_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`
    ).join(",");
    await pool.query(
      `INSERT INTO account_types (type_code, display_name, icon, is_asset, sort_order)
       VALUES ${placeholders}
       ON CONFLICT (type_code) DO NOTHING`,
      ACCOUNT_TYPES.flat()
    );
    const debtPlaceholders = DEBT_TYPES.map(
      (_, i) => `($${i * 4 + 1},$${i * 4 + 2},$${i * 4 + 3},$${i * 4 + 4})`
    ).join(",");
    await pool.query(
      `INSERT INTO debt_types (type_code, display_name, is_secured, sort_order)
       VALUES ${debtPlaceholders}
       ON CONFLICT (type_code) DO NOTHING`,
      DEBT_TYPES.flat()
    );
    const sectionPlaceholders = TAX_SECTIONS.map(
      (_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`
    ).join(",");
    await pool.query(
      `INSERT INTO tax_sections (section_code, name, description, max_limit, applicable_regime, sort_order)
       VALUES ${sectionPlaceholders}
       ON CONFLICT (section_code) DO NOTHING`,
      TAX_SECTIONS.flat()
    );
    const slabPlaceholders = TAX_SLABS.map(
      (_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4},$${i * 6 + 5},$${i * 6 + 6})`
    ).join(",");
    await pool.query(
      `INSERT INTO tax_regime_slabs (financial_year, regime, slab_from, slab_to, rate, cess_rate)
       VALUES ${slabPlaceholders}
       ON CONFLICT (id) DO NOTHING`,
      TAX_SLABS.flat()
    );
    const templateRows = NOTE_TEMPLATES.map(
      ([code, name, description, fields, icon, sortOrder]) => [
        code, name, description, JSON.stringify(fields), icon, sortOrder,
      ]
    );
    const templatePlaceholders = templateRows.map(
      (_, i) => `($${i * 6 + 1},$${i * 6 + 2},$${i * 6 + 3},$${i * 6 + 4}::jsonb,$${i * 6 + 5},$${i * 6 + 6})`
    ).join(",");
    await pool.query(
      `INSERT INTO note_templates (template_code, name, description, fields, icon, sort_order)
       VALUES ${templatePlaceholders}
       ON CONFLICT (template_code) DO NOTHING`,
      templateRows.flat()
    );
  } finally {
    await pool.end();
  }
}

/**
 * Bootstraps the `moneymind_test` database using the exact DDL + RLS +
 * system-row seeds from `scripts/db_setup.py` (drop + recreate, so the test
 * schema always matches the dev schema). Runs once per `vitest run`.
 */
export default async function globalSetup(): Promise<void> {
  loadEnvLocal();
  const root = findRepoRoot();
  const scriptsDir = join(root, "scripts");
  const venvPython = join(scriptsDir, ".venv", "Scripts", "python.exe");
  const python = existsSync(venvPython) ? venvPython : "python";

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: "",
    PGDATABASE: "moneymind_test",
  };
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (!env[key]) env[key] = value;
  }

  execFileSync(python, [join(scriptsDir, "db_setup.py")], {
    env,
    stdio: "inherit",
  });

  await seedLookups(testDatabaseUrl());
}
