import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createTaxInvestment,
  fixtureDb,
  postAs,
  rawRequest,
  requestAs,
} from "../test/helpers";

const API_SRC = dirname(fileURLToPath(import.meta.url)).replace(
  /[\\/]routes$/,
  ""
);

function readSrc(rel: string): string {
  return readFileSync(join(API_SRC, rel), "utf8");
}

function listSrc(dirRel: string, filter: (name: string) => boolean): string[] {
  return readdirSync(join(API_SRC, dirRel))
    .filter(filter)
    .map((name) => join(dirRel, name));
}

const ROUTE_FILES = listSrc(
  "routes",
  (n) => n.endsWith(".ts") && !n.endsWith(".test.ts")
);
const QUERY_FILES = listSrc("queries", (n) => n.endsWith(".ts"));
const ALL_SRC_FILES = [
  ...listSrc("routes", (n) => n.endsWith(".ts") && !n.endsWith(".test.ts")),
  ...QUERY_FILES,
  "auth.ts",
  "session.ts",
  "middleware.ts",
  "db.ts",
  "validation.ts",
];

describe("security guard: every route requires auth except the public allowlist", () => {
  const PUBLIC_ROUTES = new Set([
    "POST /api/auth/login",
    "POST /api/auth/signup",
    "POST /api/auth/logout",
    "GET /api/jobs/run", // guarded by x-cron-secret header instead
    // Intentionally-unguarded convenience endpoints:
    "GET /api/bills/upcoming",
    "GET /api/goals/templates",
  ]);

  function parseRouteTable(): { method: string; path: string }[] {
    const appTs = readSrc("app.ts");
    const mounts: Record<string, string[]> = {};
    for (const m of appTs.matchAll(/import\s*\{([^}]+)\}\s*from\s*"\.\/routes\/(\w+)"/g)) {
      const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      mounts[m[2]] = names;
    }
    const table: { method: string; path: string }[] = [];
    for (const m of appTs.matchAll(/app\.route\("([^"]+)",\s*(\w+)\)/g)) {
      const mount = m[1];
      const routerFile = Object.entries(mounts).find(([, names]) =>
        names.includes(m[2])
      );
      if (!routerFile) continue;
      const src = readSrc(`routes/${routerFile[0]}.ts`);

      // Attribute each registration to its actual receiver (`routerName.get(...)`).
      // Fresh regexes per file: global regexes carry lastIndex across matchAll calls.
      const decls: { name: string; index: number }[] = [];
      for (const d of src.matchAll(/const\s+(\w+)\s*=\s*new Hono\(\)/g)) {
        decls.push({ name: d[1], index: d.index ?? 0 });
      }
      const declNames = new Set(decls.map((d) => d.name));
      for (const r of src.matchAll(
        /\b(\w+)\.(get|post|patch|delete)\(\s*"\/([^"]*)"/g
      )) {
        const receiver = r[1];
        if (!declNames.has(receiver) || receiver !== m[2]) continue;
        const sub = "/" + r[3];
        const path = (mount + (sub === "/" ? "" : sub)).replace(
          /:[a-zA-Z]+/g,
          "00000000-0000-4000-8000-000000000000"
        );
        table.push({ method: r[2].toUpperCase(), path });
      }
    }
    return table;
  }

  it("parses a non-empty route table", () => {
    expect(parseRouteTable().length).toBeGreaterThan(100);
  });

  it("returns 401 without a session cookie for every protected route", async () => {
    const table = parseRouteTable();
    const checked = new Set<string>();
    for (const route of table) {
      const key = `${route.method} ${route.path}`;
      if (checked.has(key) || PUBLIC_ROUTES.has(key)) continue;
      checked.add(key);
      const res = await rawRequest(route.path, { method: route.method });
      expect(res.status, `${key} did not require auth`).toBe(401);
    }
    expect(checked.size).toBeGreaterThan(80);
  });

  it("keeps the public allowlist minimal and accurate", () => {
    const table = parseRouteTable();
    const keys = new Set(table.map((r) => `${r.method} ${r.path}`));
    for (const pub of PUBLIC_ROUTES) {
      if (pub.startsWith("GET /api/jobs/run")) continue; // header-guarded
      expect(keys.has(pub), `public route ${pub} no longer exists`).toBe(true);
    }
  });
});

describe("security guard: tenant scoping in query modules", () => {
  // Tables where every row belongs to exactly one user.
  const USER_OWNED_TABLES = [
    "accounts",
    "account_transfers",
    "transactions",
    "transaction_splits",
    "tags",
    "tags_transactions",
    "budgets",
    "goals",
    "goal_contributions",
    "goal_snapshots",
    "goal_milestones",
    "debts",
    "debt_payments",
    "bills",
    "payment_history",
    "subscriptions",
    "tax_investments",
    "tax_salary_structures",
    "tax_itr_documents",
    "investments",
    "investment_transactions",
    "investment_snapshots",
    "investment_price_history",
    "portfolio_snapshots",
    "dividend_income",
    "sip_trackers",
    "net_worth_snapshots",
    "manual_assets",
    "net_worth_milestones",
    "report_exports",
    "report_templates",
    "secure_notes",
    "note_attachments",
  ];

  /** Statements that legitimately read across users via an already-scoped parent. */
  const ALLOWED_STATEMENTS: RegExp[] = [
    // Summary query delegates scoping to filterClause() — contract-tested below.
    /\$\{where\}/,
  ];

  /** All string literals (template + quoted) that look like SQL statements. */
  function sqlLiterals(src: string): string[] {
    const out: string[] = [];
    const re = /`([^`]*)`|'([^'\n]*)'|"([^"\n]*)"/g;
    for (const m of src.matchAll(re)) {
      const s = m[1] ?? m[2] ?? m[3] ?? "";
      if (/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(s)) out.push(s);
    }
    return out;
  }

  it("every SELECT touching a user-owned table filters on user_id", () => {
    const violations: string[] = [];
    for (const rel of QUERY_FILES) {
      const src = readSrc(rel);
      // Extract template-literal SQL strings.
      for (const sql of sqlLiterals(src)) {
        if (!/\bSELECT\b/i.test(sql)) continue;
        if (ALLOWED_STATEMENTS.some((re) => re.test(sql))) continue;
        let touched: string | null = null;
        for (const table of USER_OWNED_TABLES) {
          if (
            new RegExp(`\\b(FROM|JOIN)\\s+(\\w+\\.)*${table}\\b`, "i").test(sql)
          ) {
            touched = table;
            break;
          }
        }
        if (touched && !/\buser_id\b/i.test(sql)) {
          violations.push(`${rel}: SELECT on '${touched}' without user_id:\n${sql.slice(0, 200)}`);
        }
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });

  it("every INSERT/UPDATE on a user-owned table includes user_id in the statement or params guard", () => {
    const violations: string[] = [];
    for (const rel of QUERY_FILES) {
      const src = readSrc(rel);
      for (const sql of sqlLiterals(src)) {
        for (const verb of ["UPDATE", "INSERT INTO"]) {
          const touches = new RegExp(
            `\\b${verb}\\s+(\\w+\\.)*(${USER_OWNED_TABLES.join("|")})\\b`,
            "i"
          ).test(sql);
          if (touches && !/\buser_id\b/i.test(sql)) {
            violations.push(`${rel}: ${verb} on user-owned table without user_id:\n${sql.slice(0, 160)}`);
          }
        }
      }
    }
    // Writes scoped by `WHERE id = $n` inside withUser transactions still must
    // carry the tenant column — none are exempt today.
    expect(violations, violations.join("\n\n")).toEqual([]);
  });
});

describe("security guard: secrets never travel in query strings", () => {
  // jobs.ts reads ?secret solely to REJECT it (400); that is the one allowed use.
  const ALLOWED_FILES = new Set(["routes/jobs.ts"]);

  it("no code reads auth material from c.req.query/searchParams", () => {
    const violations: string[] = [];
    const banned =
      /(req\.query|searchParams\.get)\(\s*["'](secret|token|password|api_key|apikey|api[-_]?secret)["']/gi;
    for (const rel of ALL_SRC_FILES) {
      if (ALLOWED_FILES.has(rel.replace(/\\/g, "/"))) continue;
      const src = readSrc(rel);
      if (banned.test(src)) violations.push(rel);
    }
    expect(violations, "files reading secrets from query strings").toEqual([]);
  });

  it("jobs/run still rejects query-string secrets explicitly", () => {
    const src = readSrc("routes/jobs.ts");
    expect(src).toMatch(/query\(\s*["']secret["']/);
  });
});

describe("security guard: shared helpers live only in utils/", () => {
  it("isoDate/csvEscape are defined once, in utils/format.ts", () => {
    const violations: string[] = [];
    const defRe = /\bfunction\s+(isoDate|csvEscape)\b/;
    for (const rel of ALL_SRC_FILES) {
      const norm = rel.replace(/\\/g, "/");
      if (norm === "utils/format.ts") continue;
      if (defRe.test(readSrc(rel))) violations.push(norm);
    }
    expect(violations, "helper redefinitions found in").toEqual([]);
  });

  it("utils/format.ts actually exports both helpers", () => {
    const src = readSrc("utils/format.ts");
    expect(src).toMatch(/export function isoDate/);
    expect(src).toMatch(/export function csvEscape/);
  });
});

describe("security guard: routes contain no SQL", () => {
  it("no .query< / .query( calls in any route module", () => {
    const violations: string[] = [];
    const sqlCall = /\b(client|q|pool|db|DB|tx)\b\s*\.\s*query\s*[<(]/;
    // SQL is always a template literal in this codebase — `query(`SELECT…`)`.
    const bareQuery = /\bquery\s*(<[^>]*>)?\(\s*`/;
    for (const rel of ROUTE_FILES) {
      const src = readSrc(rel);
      if (sqlCall.test(src) || bareQuery.test(src)) violations.push(rel);
    }
    expect(violations, "route files containing SQL").toEqual([]);
  });

  it("routes import withUser but never the raw query executor", () => {
    const violations: string[] = [];
    const importQuery = /import\s*\{[^}]*\bquery\b[^}]*\}\s*from\s*"\.\.\/db"/;
    for (const rel of ROUTE_FILES) {
      if (importQuery.test(readSrc(rel))) violations.push(rel);
    }
    expect(violations, "routes importing query() from ../db").toEqual([]);
  });
});

describe("security guard: no per-row query loops (N+1)", () => {
  // Pinned pre-existing sites that are deliberate (tiny bounded loops).
  // New occurrences fail this test — batch them instead.
  const PINNED: Record<string, number[]> = {
    "queries/goals.ts": [478], // milestone crossing: <=4 fixed pct rows
  };

  it("no await-query inside for/while loops outside the pinned set", () => {
    const violations: string[] = [];
    for (const rel of QUERY_FILES) {
      const norm = rel.replace(/\\/g, "/");
      const lines = readSrc(rel).split("\n");
      let depth = 0;
      let inLoop = false;
      let loopStart = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!inLoop && /^\s*(for|while)\s*\(/.test(line)) {
          inLoop = true;
          loopStart = i + 1;
          depth = 0;
        }
        if (inLoop) {
          depth += (line.match(/\{/g) ?? []).length;
          depth -= (line.match(/\}/g) ?? []).length;
          if (/\bawait\b[^;]*\bquery\b|\bq\.query\b|client\.query\b/.test(line)) {
            const pinned = PINNED[norm] ?? [];
            if (!pinned.includes(loopStart) && !pinned.includes(i + 1)) {
              violations.push(`${norm}:${i + 1}`);
            }
          }
          if (depth <= 0) inLoop = false;
        }
      }
    }
    expect(violations, "unpinned per-row query loops").toEqual([]);
  });
});

describe("security guard: filterClause tenant contract (the audit IDOR)", () => {
  it("always leads with the tenant clause and reserves $1 for userId", async () => {
    const { filterClause } = await import("../queries/transactions");
    const empty = filterClause(42, {});
    expect(empty.where.startsWith("WHERE t.user_id = $1")).toBe(true);
    expect(empty.params[0]).toBe(42);

    const filtered = filterClause(42, {
      accountId: "00000000-0000-4000-8000-000000000001",
      type: "expense",
      q: "rent",
    });
    expect(filtered.where.startsWith("WHERE t.user_id = $1 AND")).toBe(true);
    expect(filtered.params[0]).toBe(42);
    // Distinct placeholders are exactly 1..params.length (reuse allowed, skips not).
    const nums = (filtered.where.match(/\$\d+/g) ?? []).map((s) => Number(s.slice(1)));
    expect(Math.max(...nums)).toBe(filtered.params.length);
    expect(new Set(nums).size).toBe(filtered.params.length);
  });
});

describe("security guard: tax module cross-user isolation", () => {
  const db = fixtureDb();

  it("tax investments are invisible to other users", async () => {
    await createTaxInvestment(db.alice, { name: "Alice PPF" });
    await createTaxInvestment(db.bob, { name: "Bob PPF" });

    const aliceList = (await (
      await requestAs(db.alice, "/api/tax/investments?financial_year=2026-27")
    ).json()) as { investments: { name: string }[] };
    const bobList = (await (
      await requestAs(db.bob, "/api/tax/investments?financial_year=2026-27")
    ).json()) as { investments: { name: string }[] };

    expect(aliceList.investments.map((i) => i.name)).toEqual(["Alice PPF"]);
    expect(bobList.investments.map((i) => i.name)).toEqual(["Bob PPF"]);

    const bobId = bobList.investments.length
      ? null
      : null; // placeholder to keep shape explicit

    void bobId;
  });

  it("salary structure is scoped per user", async () => {
    const post = await postAs(
      db.alice,
      "/api/tax/salary?financial_year=2026-27",
      {
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
      }
    );
    expect(post.status).toBe(201);

    const bobRes = await requestAs(db.bob, "/api/tax/salary?financial_year=2026-27");
    expect(bobRes.status).toBe(200);
    const body = (await bobRes.json()) as { salary: unknown };
    expect(body.salary).toBeNull();

    const aliceRes = await requestAs(db.alice, "/api/tax/salary?financial_year=2026-27");
    expect(aliceRes.status).toBe(200);
    const aliceBody = (await aliceRes.json()) as { salary: { basic_monthly: number } | null };
    expect(aliceBody.salary).not.toBeNull();
  });
});
