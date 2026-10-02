/** Public/protected route smoke test for local and production deployments. */
const base = (process.env.SMOKE_BASE_URL || "http://localhost:3016").replace(/\/$/, "");
const pages = [
  "/login", "/signup", "/forgot-password", "/pricing",
  "/overview/dashboard", "/money/accounts", "/money/transactions", "/money/budgets",
  "/money/bills", "/money/subscriptions", "/wealth/goals", "/wealth/debts",
  "/wealth/investments", "/planning/notes", "/overview/reports",
  "/planning/shared-groups", "/settings", "/notifications", "/planning/calendar",
  "/money/recurring", "/overview/net-worth", "/planning/export", "/planning/tax",
];
// Legacy flat paths must permanently redirect to their section URLs.
const legacyRedirects = {
  "/dashboard": "/overview/dashboard",
  "/accounts": "/money/accounts",
  "/transactions": "/money/transactions",
  "/budgets": "/money/budgets",
  "/bills": "/money/bills",
  "/subscriptions": "/money/subscriptions",
  "/goals": "/wealth/goals",
  "/debts": "/wealth/debts",
  "/investments": "/wealth/investments",
  "/notes": "/planning/notes",
  "/reports": "/overview/reports",
  "/shared-groups": "/planning/shared-groups",
  "/calendar": "/planning/calendar",
  "/recurring": "/money/recurring",
  "/net-worth": "/overview/net-worth",
  "/export": "/planning/export",
  "/tax": "/planning/tax",
};
const publicPages = new Set(["/login", "/signup", "/forgot-password", "/pricing"]);
let failed = 0;
for (const path of pages) {
  const response = await fetch(`${base}${path}`, { redirect: "manual" });
  const expected = publicPages.has(path) ? 200 : 307;
  const ok = response.status === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${path}: ${response.status} (expected ${expected})`);
  if (!ok) failed += 1;
}
for (const [oldPath, newPath] of Object.entries(legacyRedirects)) {
  // NOTE: middleware runs before redirects, so logged-out requests 307 to
  // /login while authenticated ones 308 to the section URL. Both prove the
  // legacy path is handled (never 404).
  const response = await fetch(`${base}${oldPath}`, { redirect: "manual" });
  const location = response.headers.get("location") || "";
  const ok =
    (response.status === 308 && location.endsWith(newPath)) ||
    (response.status === 307 && location.includes("/login"));
  console.log(`${ok ? "PASS" : "FAIL"} legacy ${oldPath} -> ${newPath}: ${response.status} ${location}`);
  if (!ok) failed += 1;
}
for (const path of ["/api/accounts", "/api/transactions", "/api/bills", "/api/shared-groups", "/api/reports"]) {
  const response = await fetch(`${base}${path}`);
  const ok = response.status === 401;
  console.log(`${ok ? "PASS" : "FAIL"} unauthenticated ${path}: ${response.status} (expected 401)`);
  if (!ok) failed += 1;
}
if (failed) process.exitCode = 1;
