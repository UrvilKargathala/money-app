/** Public/protected route smoke test for local and production deployments. */
const base = (process.env.SMOKE_BASE_URL || "http://localhost:3016").replace(/\/$/, "");
const pages = [
  "/login", "/signup", "/forgot-password", "/pricing",
  "/dashboard", "/accounts", "/transactions", "/budgets", "/bills",
  "/subscriptions", "/goals", "/debts", "/investments", "/notes",
  "/reports", "/shared-groups", "/settings", "/notifications", "/calendar",
  "/recurring", "/net-worth", "/export", "/tax",
];
const publicPages = new Set(["/login", "/signup", "/forgot-password", "/pricing"]);
let failed = 0;
for (const path of pages) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const expected = publicPages.has(path) ? 200 : 307;
  const ok = response.status === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${path}: ${response.status} (expected ${expected})`);
  if (!ok) failed += 1;
}
for (const path of ["/api/accounts", "/api/transactions", "/api/bills", "/api/shared-groups", "/api/reports"]) {
  const response = await fetch(`${base}${path}`);
  const ok = response.status === 401;
  console.log(`${ok ? "PASS" : "FAIL"} unauthenticated ${path}: ${response.status} (expected 401)`);
  if (!ok) failed += 1;
}
if (failed) process.exitCode = 1;
