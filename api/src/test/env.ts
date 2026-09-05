import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Loads the repository root `.env.local` into process.env (without
 * overwriting already-set values). Walks up from the current working
 * directory so the same helpers work from the repo root or from api/.
 */
export function loadEnvLocal(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const file = join(dir, ".env.local");
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) {
          process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
        }
      }
      return;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

/**
 * The test database URL — same credentials as the dev URL, database name
 * swapped to `moneymind_test` (never touches the dev/seed database).
 */
export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@localhost:5432/moneymind_dev";
  const url = new URL(base);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error("Set an explicit TEST_DATABASE_URL before database tests; never reset the application Neon database.");
  }
  url.pathname = "/moneymind_test";
  return url.toString();
}
