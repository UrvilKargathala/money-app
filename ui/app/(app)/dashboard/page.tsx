import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/common/stat-card";
import { AlertTriangle, ArrowUpRight, CalendarClock, FileUp, PiggyBank, Plus, Receipt, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import Link from "next/link";
import {
  getAccountsData,
  getBillsOverview,
  getBudgetOverview,
  getReportsCashflow,
  getReportsSpendingByCategory,
  getTransactionsData,
  getTransactionSummary,
  getSettings,
} from "@/lib/api-client";
import { formatINR } from "@/lib/format";
import { CashflowTrendCard, SpendingBreakdownCard } from "./dashboard-charts";
import { WidgetsGrid } from "@/components/dashboard/widgets-grid";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [accountsData, txnSummary, recentTxns, budgetOverview, billsOverview, cashflowData, spendingData, settingsData] = await Promise.all([
    getAccountsData(),
    getTransactionSummary(),
    getTransactionsData(new URLSearchParams({ page: "1", pageSize: "5" })),
    getBudgetOverview(month, year).catch(() => null),
    getBillsOverview().catch(() => null),
    getReportsCashflow().catch(() => null),
    getReportsSpendingByCategory().catch(() => null),
    getSettings().catch(() => null),
  ]);

  const accounts = accountsData?.accounts ?? [];
  const totalAssets = accounts.filter((a) => a.is_asset === 1).reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = accounts.filter((a) => a.is_asset === 0).reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  const income = txnSummary?.income ?? 0;
  const expense = txnSummary?.expense ?? 0;
  const net = txnSummary?.net ?? 0;
  const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;
  const budget = budgetOverview?.overview ?? null;
  const bills = billsOverview?.overview ?? null;
  const cashflow = cashflowData?.cashflow ?? [];
  const spendingByCategory = spendingData?.categories ?? [];
  const lowBalanceAccounts = accounts.filter((account) => account.is_asset === 1 && account.balance < 1000).slice(0, 2);
  const attentionItems = [
    ...(bills?.overdue_count ? [{ label: "Overdue bills", value: String(bills.overdue_count), href: "/bills", tone: "text-error" }] : []),
    ...(budget && budget.utilization_pct >= 80 ? [{ label: "Budget used", value: `${Math.round(budget.utilization_pct)}%`, href: "/budgets", tone: budget.utilization_pct >= 100 ? "text-error" : "text-warning" }] : []),
    ...(bills?.upcoming?.slice(0, 2).map((item) => ({ label: item.label, value: formatINR(item.amount), href: "/bills", tone: "text-neutral-900" })) ?? []),
    ...lowBalanceAccounts.map((account) => ({ label: `${account.name} low balance`, value: formatINR(account.balance), href: "/accounts", tone: "text-warning" })),
  ].slice(0, 5);

  const recent = (recentTxns?.transactions ?? []) as {
    id: string;
    description: string;
    merchant_clean: string | null;
    category_name: string | null;
    amount: string;
    type: string;
    date: string;
    account_name: string;
  }[];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Dashboard</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">Month-to-date financial control center</p>
        </div>
        <Button asChild>
          <Link href="/add"><Plus className="h-4 w-4" /> Quick Add</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net Worth" value={formatINR(netWorth)} subtext={`${accounts.length} accounts`} icon={<Wallet className="h-5 w-5" />} variant="primary" />
        <StatCard label="Monthly Income" value={formatINR(income)} subtext={`${txnSummary?.count ?? 0} transactions`} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
        <StatCard label="Monthly Expenses" value={formatINR(expense)} subtext="Total spent" icon={<TrendingDown className="h-5 w-5" />} variant="rose" />
        <StatCard
          label="Savings Rate"
          value={income > 0 ? `${savingsRate}%` : "-"}
          subtext={income > 0 ? (savingsRate >= 20 ? "Healthy" : "Needs attention") : "No income yet"}
          trend={income > 0 ? { value: `${net >= 0 ? "+" : ""}${formatINR(net)}`, positive: net >= 0 } : undefined}
          icon={<PiggyBank className="h-5 w-5" />}
          variant="violet"
        />
      </div>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Button asChild>
            <Link href="/add"><Plus className="h-4 w-4" /> Add transaction</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/transactions?import=1"><FileUp className="h-4 w-4" /> Import statement</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/accounts?create=1"><Wallet className="h-4 w-4" /> Add account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/bills?create=1"><Receipt className="h-4 w-4" /> Add bill</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/budgets?create=1"><Target className="h-4 w-4" /> Create budget</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <CashflowTrendCard cashflow={cashflow} />
        <Card className="min-h-[390px]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Needs attention</CardTitle>
            <CardDescription>Items that may need action soon</CardDescription>
          </CardHeader>
          <CardContent>
            {attentionItems.length === 0 ? (
              <div className="flex h-[270px] items-center justify-center rounded-lg border border-dashed border-neutral-200 text-center text-sm text-neutral-500">
                No urgent money tasks right now.
              </div>
            ) : (
              <div className="space-y-3">
                {attentionItems.map((item) => (
                  <Link key={`${item.label}-${item.value}`} href={item.href} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3 transition hover:border-primary-200 hover:bg-primary-50/40">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                        <CalendarClock className="h-4 w-4" />
                      </div>
                      <p className="truncate text-sm font-medium text-neutral-800">{item.label}</p>
                    </div>
                    <p className={`text-sm font-semibold ${item.tone}`}>{item.value}</p>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <WidgetsGrid layout={(settingsData as { widget_layout?: unknown[] } | null)?.widget_layout} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(360px,1fr)]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Latest money movement</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/transactions">
                View all <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-neutral-500">No transactions yet.</p>
                <Button asChild className="mt-4">
                  <Link href="/transactions">Add transaction</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {recent.map((t) => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
                    <div>
                      <p className="text-sm font-medium font-heading text-neutral-800">
                        {t.merchant_clean || t.description || "Transfer"}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5">{t.category_name || "Uncategorized"}</span>
                        <span>{t.account_name}</span>
                        <span>{new Date(t.date).toLocaleDateString("en-IN")}</span>
                      </div>
                    </div>
                    <span
                      className={`text-sm font-semibold font-heading ${
                        t.type === "income" ? "text-success" : t.type === "expense" ? "text-error" : "text-neutral-700"
                      }`}
                    >
                      {t.type === "income" ? "+" : t.type === "expense" ? "- " : ""}
                      {formatINR(Number(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <SpendingBreakdownCard categories={spendingByCategory} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>
                {accounts.length} accounts • Net {formatINR(netWorth)}
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/accounts">
                View all <ArrowUpRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <p className="text-sm text-neutral-500">No accounts yet.</p>
                <Button asChild className="mt-4">
                  <Link href="/accounts">Manage accounts</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="rounded-lg bg-success-light p-3">
                    <p className="text-xs text-success-dark font-medium">Assets</p>
                    <p className="text-sm font-bold font-heading text-success-dark">{formatINR(totalAssets)}</p>
                  </div>
                  <div className="rounded-lg bg-error-light p-3">
                    <p className="text-xs text-error-dark font-medium">Liabilities</p>
                    <p className="text-sm font-bold font-heading text-error-dark">{formatINR(totalLiabilities)}</p>
                  </div>
                  <div className="rounded-lg bg-primary-50 p-3">
                    <p className="text-xs text-primary-700 font-medium">Net</p>
                    <p className="text-sm font-bold font-heading text-primary-700">{formatINR(netWorth)}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {accounts.slice(0, 4).map((a) => (
                    <div key={a.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold" style={{ backgroundColor: (a.color || "#2563EB") + "15", color: a.color || "#2563EB" }}>
                          {a.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium font-heading text-neutral-800">{a.name}</p>
                          <p className="text-xs text-neutral-500">{a.display_name}</p>
                        </div>
                      </div>
                      <span className={`text-sm font-semibold font-heading ${a.balance >= 0 ? "text-neutral-900" : "text-error"}`}>
                        {formatINR(a.balance)}
                      </span>
                    </div>
                  ))}
                  {accounts.length > 4 && <p className="text-xs text-center text-neutral-500">+ {accounts.length - 4} more accounts</p>}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Budget pulse</CardTitle>
            <CardDescription>This month against plan</CardDescription>
          </CardHeader>
          <CardContent>
            {!budget ? (
              <div className="flex min-h-[180px] items-center justify-center rounded-lg border border-dashed border-neutral-200 text-sm text-neutral-500">
                Create a budget to track monthly control.
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Budgeted</p>
                    <p className="text-sm font-bold text-neutral-900">{formatINR(budget.total_budgeted)}</p>
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Spent</p>
                    <p className="text-sm font-bold text-neutral-900">{formatINR(budget.total_spent)}</p>
                  </div>
                  <div className="rounded-lg bg-neutral-50 p-3">
                    <p className="text-xs text-neutral-500">Over</p>
                    <p className="text-sm font-bold text-neutral-900">{budget.over_budget_count}</p>
                  </div>
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-medium text-neutral-700">Utilization</span>
                    <span className="font-semibold text-neutral-900">{Math.round(budget.utilization_pct)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                    <div className="h-full rounded-full bg-primary-600" style={{ width: `${Math.min(100, budget.utilization_pct)}%` }} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
