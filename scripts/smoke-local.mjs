const base = process.env.SMOKE_BASE_URL || "http://localhost:3016";
const checks = [
  ["public login", "/login", 200],
  ["public signup", "/signup", 200],
  ["protected dashboard redirect", "/dashboard", [307, 308]],
  ["protected transactions redirect", "/transactions", [307, 308]],
  ["unauthenticated accounts API", "/api/accounts", 401],
  ["unauthenticated transactions API", "/api/transactions", 401],
  ["reports index", "/api/reports", 401],
];

let failed = 0;
for (const [label, pathname, expected] of checks) {
  const response = await fetch(`${base}${pathname}`, { redirect: "manual" });
  // Next.js permanent redirects emit 308; middleware emits 307 — accept both.
  const wanted = Array.isArray(expected) ? expected : [expected];
  const ok = wanted.includes(response.status);
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: ${response.status} (expected ${wanted.join("/")})`);
  if (!ok) failed += 1;
}
if (failed) process.exitCode = 1;
