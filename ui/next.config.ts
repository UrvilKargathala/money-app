import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const nextConfig: NextConfig = {
  transpilePackages: ["@moneymind/api"],
  experimental: {
    // Per-icon imports for the icon barrel (lucide-react is fully ESM but
    // the barrel re-exports every icon; this keeps tree-shaking exact).
    optimizePackageImports: ["lucide-react"],
  },
};

// Section-hierarchy migration (P7): every legacy flat path permanently
// redirects to its section URL so bookmarks, stored notification deep_links,
// and emailed links keep working. New code must link to section URLs directly.
const LEGACY_PAGE_REDIRECTS: Array<{ source: string; destination: string }> = [
  { source: "/dashboard", destination: "/overview/dashboard" },
  { source: "/net-worth", destination: "/overview/net-worth" },
  { source: "/reports", destination: "/overview/reports" },
  { source: "/accounts", destination: "/money/accounts" },
  { source: "/accounts/:id", destination: "/money/accounts/:id" },
  { source: "/transactions", destination: "/money/transactions" },
  { source: "/transactions/:id", destination: "/money/transactions/:id" },
  { source: "/budgets", destination: "/money/budgets" },
  { source: "/bills", destination: "/money/bills" },
  { source: "/bills/:id", destination: "/money/bills/:id" },
  { source: "/subscriptions", destination: "/money/subscriptions" },
  { source: "/subscriptions/:id", destination: "/money/subscriptions/:id" },
  { source: "/recurring", destination: "/money/recurring" },
  { source: "/investments", destination: "/wealth/investments" },
  { source: "/investments/:id", destination: "/wealth/investments/:id" },
  { source: "/debts", destination: "/wealth/debts" },
  { source: "/debts/:id", destination: "/wealth/debts/:id" },
  { source: "/goals", destination: "/wealth/goals" },
  { source: "/goals/:id", destination: "/wealth/goals/:id" },
  { source: "/calendar", destination: "/planning/calendar" },
  { source: "/tax", destination: "/planning/tax" },
  { source: "/notes", destination: "/planning/notes" },
  { source: "/shared-groups", destination: "/planning/shared-groups" },
  { source: "/shared-groups/invite/:token", destination: "/planning/shared-groups/invite/:token" },
  { source: "/export", destination: "/planning/export" },
];

export default (phase: string): NextConfig => ({
  ...nextConfig,
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next",
  async redirects() {
    return LEGACY_PAGE_REDIRECTS.map(({ source, destination }) => ({
      source,
      destination,
      permanent: true,
    }));
  },
});
