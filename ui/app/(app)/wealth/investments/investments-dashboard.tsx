"use client";

import { useCallback, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/common/stat-card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { useDeleteConfirm } from "@/components/common/confirm-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InvestmentCard } from "./investment-card";
import dynamic from "next/dynamic";
import { formatINR, formatDate, todayLocalISO } from "@/lib/format";
import type { Allocation, TrendPoint } from "./investment-charts";

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <div aria-hidden className="w-full animate-pulse rounded-lg bg-soft" style={{ height }} />;
}

// Recharts ships in deferred chunks: the allocation donut, the trend chart
// and the price-history dialog load only when their sections render.
const AllocationDonut = dynamic(() => import("./investment-charts").then((m) => m.AllocationDonut), {
  ssr: false,
  loading: () => <ChartSkeleton height={320} />,
});
const PortfolioTrend = dynamic(() => import("./investment-charts").then((m) => m.PortfolioTrend), {
  ssr: false,
  loading: () => <ChartSkeleton height={300} />,
});
const PriceHistoryDialog = dynamic(() => import("./price-history-dialog").then((m) => m.PriceHistoryDialog), {
  ssr: false,
});
// Form dialogs mount only when opened — same code-split treatment.
const InvestmentFormDialog = dynamic(() => import("./investment-form-dialog").then((m) => m.InvestmentFormDialog), {
  ssr: false,
});
const SipFormDialog = dynamic(() => import("./sip-form-dialog").then((m) => m.SipFormDialog), {
  ssr: false,
});
const DividendFormDialog = dynamic(() => import("./dividend-form-dialog").then((m) => m.DividendFormDialog), {
  ssr: false,
});
const ConfirmDialog = dynamic(() => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog), {
  ssr: false,
});
import { TrendingUp, Plus, Wallet, Calendar, Coins, PieChart, AlertTriangle, LineChartIcon, History, MoreVertical, Pencil, Trash2, Pause, Play } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { deleteInvestmentAction, deleteSipAction, pauseSip, resumeSip, logInstallment, deleteDividendAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import type { Investment } from "@/lib/entities";

type Sip = {
  id: string;
  investment_id: string;
  investment_name: string;
  amount: string | number;
  frequency: string;
  next_date: string;
  end_date?: string | null;
  account_id: string | null;
  account_name: string | null;
  status: string;
  days_until_next?: number;
};

type Dividend = {
  id: string;
  investment_id: string;
  investment_name: string;
  type: string;
  amount: string | number;
  date: string;
  notes: string | null;
};

type AlertItem = { id: string; name: string; type: string; maturity_date: string; days_until: number };

const SIP_DUE_SOON_DAYS = 7;

type SipUrgency = "overdue" | "due-soon" | "upcoming";

/** Urgency bucket + label for a SIP's next installment (was nested ternaries in JSX). */
function getSipUrgency(daysUntilNext: number | null | undefined): { urgency: SipUrgency | null; label: string } {
  if (daysUntilNext == null) return { urgency: null, label: "" };
  if (daysUntilNext < 0) return { urgency: "overdue", label: ` • Overdue ${Math.abs(daysUntilNext)} days` };
  if (daysUntilNext === 0) return { urgency: "due-soon", label: " • Due today" };
  if (daysUntilNext <= SIP_DUE_SOON_DAYS) return { urgency: "due-soon", label: ` • Due in ${daysUntilNext} days` };
  return { urgency: "upcoming", label: "" };
}

function sipUrgencyClass(urgency: SipUrgency | null): string {
  if (urgency === "overdue") return "text-error-dark dark:text-[#FCA5A5] font-medium";
  if (urgency === "due-soon") return "text-warning-dark dark:text-[#FDE68A] font-medium";
  return "text-faint";
}

export function InvestmentsDashboard({
  investments,
  summary,
  sips,
  sipsDue,
  dividends,
  allocation,
  trend,
  alerts,
  portfolioXirr,
}: {
  investments: Investment[];
  summary: { total_invested: number; total_current: number; total_return: number; return_pct: number } | null;
  sips: Sip[];
  sipsDue: { id: string; investment_name: string; amount: number; frequency: string; next_date: string; days_until_next: number }[];
  dividends: Dividend[];
  allocation: Allocation[];
  trend: TrendPoint[];
  alerts: AlertItem[];
  portfolioXirr: number | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("holdings");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);

  const [sipOpen, setSipOpen] = useState(false);
  const [editingSip, setEditingSip] = useState<Sip | null>(null);
  const [dividendOpen, setDividendOpen] = useState(false);
  const [editingDividend, setEditingDividend] = useState<Dividend | null>(null);

  const [priceOpen, setPriceOpen] = useState(false);
  const [priceInv, setPriceInv] = useState<Investment | null>(null);

  const [installmentOpen, setInstallmentOpen] = useState(false);
  const [installmentSip, setInstallmentSip] = useState<Sip | null>(null);
  const [installmentDate, setInstallmentDate] = useState(todayLocalISO());
  const [installmentPending, setInstallmentPending] = useState(false);

  // Portfolio totals in one pass (were 2 full Number()-coercing reduces +
  // derived chains rerun on every tab/dialog state change).
  const totals = useMemo(() => {
    if (summary) {
      return {
        invested: summary.total_invested,
        current: summary.total_current,
        ret: summary.total_return,
        pct: summary.return_pct,
      };
    }
    let invested = 0;
    let current = 0;
    for (const investment of investments) {
      invested += Number(investment.units) * Number(investment.buy_price);
      current += Number(investment.units) * Number(investment.current_price);
    }
    const ret = current - invested;
    return { invested, current, ret, pct: invested > 0 ? (ret / invested) * 100 : 0 };
  }, [summary, investments]);
  const totalInvested = totals.invested;
  const totalCurrent = totals.current;
  const totalReturn = totals.ret;
  const returnPct = totals.pct;

  const investmentOpts = useMemo(() => investments.map((investment) => ({ id: investment.id, name: investment.name })), [investments]);

  const dividendsTotal = useMemo(() => dividends.reduce((sum, dividend) => sum + Number(dividend.amount), 0), [dividends]);

  const [confirmState, closeConfirm, confirmDelete] = useDeleteConfirm();

  const handleEditInvestment = useCallback((investment: Investment) => {
    setEditing(investment);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    (investment: Investment) => {
      confirmDelete({
        title: "Delete this holding?",
        description: "Its price history and payouts stay in reports. This cannot be undone.",
        onDelete: () => deleteInvestmentAction(investment.id),
        successMsg: "Deleted",
        onDone: () => router.refresh(),
      });
    },
    [confirmDelete, router]
  );

  const openSipForm = useCallback((sip: Sip | null) => {
    setEditingSip(sip);
    setSipOpen(true);
  }, []);

  const openDividendForm = useCallback((dividend: Dividend | null) => {
    setEditingDividend(dividend);
    setDividendOpen(true);
  }, []);

  // Guarded "new" launchers: payouts/SIPs need a holding to attach to.
  const openNewSip = useCallback(() => {
    if (investments.length === 0) {
      toast.error("Add a holding first");
      return;
    }
    openSipForm(null);
  }, [investments.length, openSipForm]);

  const openNewDividend = useCallback(() => {
    if (investments.length === 0) {
      toast.error("Add a holding first");
      return;
    }
    openDividendForm(null);
  }, [investments.length, openDividendForm]);

  const handleDeleteSip = useCallback(
    (id: string) => {
      confirmDelete({
        title: "Delete this SIP?",
        description: "Scheduled installments stop. Past installments are kept. This cannot be undone.",
        onDelete: () => deleteSipAction(id),
        successMsg: "SIP deleted",
        onDone: () => router.refresh(),
      });
    },
    [confirmDelete, router]
  );

  const handlePause = useCallback(
    async (id: string) => {
      const res = await pauseSip(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("SIP paused");
        router.refresh();
      }
    },
    [router]
  );
  const handleResume = useCallback(
    async (id: string) => {
      const res = await resumeSip(id);
      if (res?.error) toast.error(res.error);
      else {
        toast.success("SIP resumed");
        router.refresh();
      }
    },
    [router]
  );

  const handleInstallment = async () => {
    if (!installmentSip) return;
    setInstallmentPending(true);
    const fd = new FormData();
    fd.set("id", installmentSip.id);
    fd.set("date", installmentDate);
    // import logInstallment action signature is (prev, formData)
    const res = await logInstallment(null as unknown as never, fd);
    setInstallmentPending(false);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Installment logged");
      setInstallmentOpen(false);
      router.refresh();
    }
  };

  const handleDeleteDividend = (id: string) => {
    confirmDelete({
      title: "Delete this payout?",
      description: "This cannot be undone.",
      onDelete: () => deleteDividendAction(id),
      successMsg: "Payout deleted",
      onDone: () => router.refresh(),
    });
  };

  const fetchPriceHistory = async (id: string) => {
    try {
      const res = await fetch(`/api/investments/${id}/price-history`);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.price_history ?? []).map((entry: { price: string | number; date: string }) => ({
        price: Number(entry.price),
        date: entry.date,
      }));
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Investments"
        description={
          <>
            {investments.length} holdings • {formatINR(totalInvested)} invested • {sips.length} SIPs • {dividends.length} payouts
          </>
        }
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Holding
          </Button>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Invested" value={formatINR(totalInvested)} icon={<Wallet className="h-5 w-5" />} variant="primary" />
        <StatCard label="Current Value" value={formatINR(totalCurrent)} icon={<TrendingUp className="h-5 w-5" />} variant="success" />
        <StatCard
          label="Returns"
          value={`${formatINR(totalReturn)} (${returnPct.toFixed(1)}%)`}
          subtext={portfolioXirr != null ? `XIRR ${portfolioXirr.toFixed(2)}%` : undefined}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="teal"
        />
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
          <TabsTrigger value="sips">SIPs</TabsTrigger>
          <TabsTrigger value="dividends">Dividends</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings" className="space-y-4 mt-4">
          {investments.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="h-6 w-6" />}
              title="No holdings"
              description="Add your mutual funds, stocks, FDs to track returns."
              actionLabel="Add Holding"
              onAction={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {investments.map((investment) => (
                <div key={investment.id} className="space-y-2">
                  <InvestmentCard
                    investment={investment}
                    onEdit={handleEditInvestment}
                    onDelete={handleDelete}
                    onUpdatePrice={handleEditInvestment}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setPriceInv(investment);
                      setPriceOpen(true);
                    }}
                  >
                    <History className="h-3.5 w-3.5" /> Price history
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sips" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold font-heading">Systematic Investment Plans</h2>
            <Button
              size="sm"
              onClick={openNewSip}
            >
              <Plus className="h-4 w-4" /> Add SIP
            </Button>
          </div>

          {sipsDue.length > 0 && (
            <Card className="p-4 border-warning/20 bg-warning-soft/30 dark:border-[#78350F] dark:bg-[#78350F]/30">
              <p className="text-sm font-medium font-heading text-warning-dark dark:text-[#FDE68A] flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Due in next 7 days - {sipsDue.length}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sipsDue.map((due) => (
                  <Badge key={due.id} variant="warning">
                    {due.investment_name} • {formatINR(due.amount)} • {due.next_date}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {sips.length === 0 ? (
            <EmptyState
              icon={<Calendar className="h-6 w-6" />}
              title="No SIPs"
              description="Schedule SIPs to automate investing."
              actionLabel="Add SIP"
              onAction={openNewSip}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sips.map((sip) => (
                <Card key={sip.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <p className="truncate text-sm font-semibold font-heading text-foreground">{sip.investment_name}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default">{sip.frequency}</Badge>
                        <Badge variant="default">{formatINR(Number(sip.amount))}</Badge>
                        <Badge variant="default">{sip.end_date ? `ends ${formatDate(sip.end_date)}` : "Ongoing"}</Badge>
                      </div>
                      {/* getSipUrgency is pure + O(1): called twice (class + label) to stay expression-style in the map. */}
                      <p className={`text-xs ${sipUrgencyClass(getSipUrgency(sip.days_until_next).urgency)}`}>
                        Next: {formatDate(sip.next_date)}
                        {getSipUrgency(sip.days_until_next).label}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={sip.status === "active" ? "success" : sip.status === "paused" ? "warning" : "default"}>{sip.status}</Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Actions for ${sip.investment_name}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {sip.status === "active" && (
                            <DropdownMenuItem onClick={() => handlePause(sip.id)}>
                              <Pause className="h-4 w-4" /> Pause
                            </DropdownMenuItem>
                          )}
                          {sip.status === "paused" && (
                            <DropdownMenuItem onClick={() => handleResume(sip.id)}>
                              <Play className="h-4 w-4" /> Resume
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => openSipForm(sip)}>
                            <Pencil className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDeleteSip(sip.id)} className="text-error">
                            <Trash2 className="h-4 w-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setInstallmentSip(sip);
                        setInstallmentDate(todayLocalISO());
                        setInstallmentOpen(true);
                      }}
                    >
                      Log installment
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dividends" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold font-heading">Dividends & Interest</h2>
            <Button
              size="sm"
              onClick={openNewDividend}
            >
              <Plus className="h-4 w-4" /> Add payout
            </Button>
          </div>

          {dividends.length === 0 ? (
            <EmptyState
              icon={<Coins className="h-6 w-6" />}
              title="No payouts"
              description="Record dividends, interest and maturity proceeds."
              actionLabel="Add payout"
              onAction={openNewDividend}
            />
          ) : (
            <div className="space-y-3">
              <Card className="p-3 flex items-center justify-between">
                <span className="text-sm text-faint">Total payouts</span>
                <span className="text-sm font-bold font-heading">
                  {formatINR(dividendsTotal)} • {dividends.length} records
                </span>
              </Card>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dividends.map((dividend) => (
                  <Card key={dividend.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold font-heading text-foreground">{dividend.investment_name}</p>
                        <p className="text-xs text-faint">
                          {dividend.type} • {formatDate(dividend.date)}
                        </p>
                      </div>
                      <Badge variant="info">{dividend.type}</Badge>
                    </div>
                    <p className="text-lg font-bold font-heading">{formatINR(Number(dividend.amount))}</p>
                    {dividend.notes && <p className="text-xs text-faint">{dividend.notes}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openDividendForm(dividend)}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-error" onClick={() => handleDeleteDividend(dividend.id)}>
                        Delete
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-4 mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <PieChart className="h-4 w-4" /> Asset Allocation
                </CardTitle>
                <CardDescription>By category • donut</CardDescription>
              </CardHeader>
              <CardContent>
                <AllocationDonut allocation={allocation} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" /> Returns
                </CardTitle>
                <CardDescription>Portfolio XIRR & maturity alerts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-info-soft p-4 text-center dark:bg-[#1E1E1E]/50">
                  <p className="text-xs text-primary-700 dark:text-[#BFDBFE]">Portfolio XIRR</p>
                  <p className="text-2xl font-bold font-heading text-primary-700 dark:text-[#BFDBFE]">{portfolioXirr != null ? `${portfolioXirr.toFixed(2)}%` : "-"}</p>
                  <p className="text-xs text-faint mt-1">Annualized return • {returnPct.toFixed(1)}% absolute</p>
                </div>

                <div>
                  <p className="text-sm font-medium font-heading flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Maturity alerts
                  </p>
                  {alerts.length === 0 ? (
                    <p className="text-xs text-faint mt-2">No maturities in next 30 days.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {alerts.map((alert) => (
                        <div key={alert.id} className="flex items-center justify-between rounded-lg border border-warning/20 bg-warning-soft/20 px-3 py-2 text-sm dark:border-[#78350F] dark:bg-[#78350F]/30">
                          <div>
                            <p className="font-medium font-heading">{alert.name}</p>
                            <p className="text-xs text-faint">
                              {alert.type} • {formatDate(alert.maturity_date)}
                            </p>
                          </div>
                          <Badge variant={alert.days_until <= 7 ? "error" : "warning"}>{alert.days_until <= 0 ? "matured" : `${alert.days_until}d`}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <LineChartIcon className="h-4 w-4" /> Portfolio Trend
              </CardTitle>
              <CardDescription>Invested vs current value over time</CardDescription>
            </CardHeader>
              <CardContent>
                <PortfolioTrend trend={trend} />
              </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {formOpen ? <InvestmentFormDialog open={formOpen} onOpenChange={setFormOpen} investment={editing} onSuccess={() => router.refresh()} /> : null}

      {sipOpen ? <SipFormDialog open={sipOpen} onOpenChange={setSipOpen} sip={editingSip} investments={investmentOpts} onSuccess={() => router.refresh()} /> : null}

      {dividendOpen ? <DividendFormDialog open={dividendOpen} onOpenChange={setDividendOpen} dividend={editingDividend} investments={investmentOpts} onSuccess={() => router.refresh()} /> : null}

      <PriceHistoryDialog
        open={priceOpen}
        onOpenChange={setPriceOpen}
        investmentName={priceInv?.name ?? ""}
        investmentId={priceInv?.id ?? ""}
        fetchHistory={fetchPriceHistory}
      />

      <Dialog open={installmentOpen} onOpenChange={setInstallmentOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Log SIP installment</DialogTitle>
            <DialogDescription>
              {installmentSip ? `${installmentSip.investment_name} • ${formatINR(Number(installmentSip.amount))}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="installment-date">Installment date</Label>
              <Input id="installment-date" type="date" value={installmentDate} onChange={(e) => setInstallmentDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInstallmentOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleInstallment} disabled={installmentPending}>
              {installmentPending ? "Logging..." : "Log installment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </div>
  );
}
