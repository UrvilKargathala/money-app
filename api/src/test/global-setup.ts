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
