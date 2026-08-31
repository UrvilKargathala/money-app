import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/common/stat-card";
import { Wallet, TrendingUp, TrendingDown, PiggyBank, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { getAccountsData, getTransactionsData, getTransactionSummary, apiJson } from "@/lib/api-client";
import { formatINR } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [accountsData, txnSummary, recentTxns, budgetOverview] = await Promise.all([
    getAccountsData(),
    getTransactionSummary(),
    getTransactionsData(new URLSearchParams({ page: "1", pageSize: "5" })),
    apiJson<{ overview: { total_budgeted: number; total_spent: number; utilization_pct: number } | null }>(
      `/api/budgets/overview?month=${new Date().getMonth() + 1}&year=${new Date().getFullYear()}`
    ).catch(() => null),
  ]);

  const accounts = accountsData?.accounts ?? [];
  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
  const totalAssets = accounts.filter((a) => a.is_asset === 1).reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = accounts.filter((a) => a.is_asset === 0).reduce((sum, a) => sum + Math.abs(a.balance), 0);
  const netWorth = totalAssets - totalLiabilities;

  const income = txnSummary?.income ?? 0;
  const expense = txnSummary?.expense ?? 0;
  const net = txnSummary?.net ?? 0;
  const savingsRate = income > 0 ? Math.round(((income - expense) / income) * 100) : 0;

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
          <p className="text-sm text-neutral-500 font-body mt-1">Overview of your finances</p>
        </div>
        <Button asChild>
          <Link href="/add">Quick Add</Link>
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Net Worth" value={formatINR(netWorth)} subtext={`${accounts.length} accounts`} icon={<Wallet className="h-5 w-5" />} variant="primary" />
        <StatCard label="Monthly Income" value={formatINR(income)} subtext={`${txnSummary?.count ?? 0} transactions`} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
        <StatCard label="Monthly Expenses" value={formatINR(expense)} subtext="Total spent" icon={<TrendingDown className="h-5 w-5" />} variant="rose" />
        <StatCard
          label="Savings Rate"
          value={income > 0 ? `${savingsRate}%` : "—"}
          subtext={income > 0 ? (savingsRate >= 20 ? "Healthy" : "Needs attention") : "No income yet"}
          trend={income > 0 ? { value: `${net >= 0 ? "+" : ""}${formatINR(net)}`, positive: net >= 0 } : undefined}
          icon={<PiggyBank className="h-5 w-5" />}
          variant="violet"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your latest activity</CardDescription>
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
                      <p className="text-xs text-neutral-500">
                        {t.category_name || t.type} • {t.account_name} • {new Date(t.date).toLocaleDateString("en-IN")}
                      </p>
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
      </div>
    </div>
  );
}
