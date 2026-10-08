"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog, useDeleteConfirm } from "@/components/common/confirm-dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { InvestmentCard } from "./investment-card";
import { InvestmentFormDialog } from "./investment-form-dialog";
import { SipFormDialog } from "./sip-form-dialog";
import { DividendFormDialog } from "./dividend-form-dialog";
import dynamic from "next/dynamic";
import { formatINR, formatDate } from "@/lib/format";
import type { Allocation, TrendPoint } from "./investment-charts";

function ChartSkeleton({ height = 300 }: { height?: number }) {
  return <div aria-hidden className="w-full animate-pulse rounded-lg bg-wash" style={{ height }} />;
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
  const [installmentDate, setInstallmentDate] = useState(new Date().toISOString().slice(0, 10));
  const [installmentPending, setInstallmentPending] = useState(false);

  const totalInvested = summary?.total_invested ?? investments.reduce((s, i) => s + Number(i.units) * Number(i.buy_price), 0);
  const totalCurrent = summary?.total_current ?? investments.reduce((s, i) => s + Number(i.units) * Number(i.current_price), 0);
  const totalReturn = summary?.total_return ?? totalCurrent - totalInvested;
  const returnPct = summary?.return_pct ?? (totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0);

  const investmentOpts = investments.map((i) => ({ id: i.id, name: i.name }));

  const [confirmState, closeConfirm, confirmDelete] = useDeleteConfirm();

  const handleDelete = (id: string) => {
    confirmDelete({
      title: "Delete this holding?",
      description: "Its price history and payouts stay in reports. This cannot be undone.",
      onDelete: () => deleteInvestmentAction(id),
      successMsg: "Deleted",
      onDone: () => router.refresh(),
    });
  };

  const handleDeleteSip = (id: string) => {
    confirmDelete({
      title: "Delete this SIP?",
      description: "Scheduled installments stop. Past installments are kept. This cannot be undone.",
      onDelete: () => deleteSipAction(id),
      successMsg: "SIP deleted",
      onDone: () => router.refresh(),
    });
  };

  const handlePause = async (id: string) => {
    const res = await pauseSip(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("SIP paused");
      router.refresh();
    }
  };
  const handleResume = async (id: string) => {
    const res = await resumeSip(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("SIP resumed");
      router.refresh();
    }
  };

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
      return (data.price_history ?? []).map((p: { price: string | number; date: string }) => ({
        price: Number(p.price),
        date: p.date,
      }));
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-ink-1">Investments</h1>
          <p className="text-sm text-ink-3 font-body mt-1">
            {investments.length} holdings • {formatINR(totalInvested)} invested • {sips.length} SIPs • {dividends.length} payouts
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add Holding
        </Button>
      </div>

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
              {investments.map((inv) => (
                <div key={inv.id} className="space-y-2">
                  <InvestmentCard
                    investment={inv}
                    onEdit={() => {
                      setEditing(inv);
                      setFormOpen(true);
                    }}
                    onDelete={() => handleDelete(inv.id)}
                    onUpdatePrice={() => {
                      setEditing(inv);
                      setFormOpen(true);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      setPriceInv(inv);
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
              onClick={() => {
                if (investments.length === 0) {
                  toast.error("Add a holding first");
                  return;
                }
                setEditingSip(null);
                setSipOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add SIP
            </Button>
          </div>

          {sipsDue.length > 0 && (
            <Card className="p-4 border-warning/20 bg-tint-warning/30 dark:bg-[#78350F]/30">
              <p className="text-sm font-medium font-heading text-warning-dark dark:text-[#FDE68A] flex items-center gap-2">
                <Calendar className="h-4 w-4" /> Due in next 7 days - {sipsDue.length}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sipsDue.map((d) => (
                  <Badge key={d.id} variant="warning">
                    {d.investment_name} • {formatINR(d.amount)} • {d.next_date}
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
              onAction={() => {
                if (investments.length === 0) {
                  toast.error("Add a holding first");
                  return;
                }
                setEditingSip(null);
                setSipOpen(true);
              }}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {sips.map((sip) => (
                <Card key={sip.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1.5">
                      <p className="truncate text-sm font-semibold font-heading text-ink-1">{sip.investment_name}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="default">{sip.frequency}</Badge>
                        <Badge variant="default">{formatINR(Number(sip.amount))}</Badge>
                        <Badge variant="default">{sip.end_date ? `ends ${formatDate(sip.end_date)}` : "Ongoing"}</Badge>
                      </div>
                      <p className={`text-xs ${sip.days_until_next != null && sip.days_until_next < 0 ? "text-error-dark font-medium" : sip.days_until_next != null && sip.days_until_next <= 7 ? "text-warning-dark font-medium" : "text-neutral-400"}`}>
                        Next: {formatDate(sip.next_date)}
                        {sip.days_until_next != null && (sip.days_until_next === 0 ? " • Due today" : sip.days_until_next > 0 ? ` • Due in ${sip.days_until_next} days` : ` • Overdue ${Math.abs(sip.days_until_next)} days`)}
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
                          <DropdownMenuItem onClick={() => {
                            setEditingSip(sip);
                            setSipOpen(true);
                          }}>
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
                        setInstallmentDate(new Date().toISOString().slice(0, 10));
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
              onClick={() => {
                if (investments.length === 0) {
                  toast.error("Add a holding first");
                  return;
                }
                setEditingDividend(null);
                setDividendOpen(true);
              }}
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
              onAction={() => {
                if (investments.length === 0) {
                  toast.error("Add a holding first");
                  return;
                }
                setEditingDividend(null);
                setDividendOpen(true);
              }}
            />
          ) : (
            <div className="space-y-3">
              <Card className="p-3 flex items-center justify-between">
                <span className="text-sm text-ink-3">Total payouts</span>
                <span className="text-sm font-bold font-heading">
                  {formatINR(dividends.reduce((s, d) => s + Number(d.amount), 0))} • {dividends.length} records
                </span>
              </Card>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {dividends.map((div) => (
                  <Card key={div.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold font-heading text-ink-1">{div.investment_name}</p>
                        <p className="text-xs text-ink-3">
                          {div.type} • {formatDate(div.date)}
                        </p>
                      </div>
                      <Badge variant="info">{div.type}</Badge>
                    </div>
                    <p className="text-lg font-bold font-heading">{formatINR(Number(div.amount))}</p>
                    {div.notes && <p className="text-xs text-neutral-400">{div.notes}</p>}
                    <div className="flex gap-2 pt-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingDividend(div);
                          setDividendOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="ghost" size="sm" className="text-error" onClick={() => handleDeleteDividend(div.id)}>
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
                <div className="rounded-lg bg-tint-info p-4 text-center dark:bg-[#1E1E1E]/50">
                  <p className="text-xs text-primary-700 dark:text-[#BFDBFE]">Portfolio XIRR</p>
                  <p className="text-2xl font-bold font-heading text-primary-700 dark:text-[#BFDBFE]">{portfolioXirr != null ? `${portfolioXirr.toFixed(2)}%` : "-"}</p>
                  <p className="text-xs text-ink-3 mt-1">Annualized return • {returnPct.toFixed(1)}% absolute</p>
                </div>

                <div>
                  <p className="text-sm font-medium font-heading flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" /> Maturity alerts
                  </p>
                  {alerts.length === 0 ? (
                    <p className="text-xs text-ink-3 mt-2">No maturities in next 30 days.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {alerts.map((al) => (
                        <div key={al.id} className="flex items-center justify-between rounded-lg border border-warning/20 bg-tint-warning/20 px-3 py-2 text-sm dark:bg-[#78350F]/30">
                          <div>
                            <p className="font-medium font-heading">{al.name}</p>
                            <p className="text-xs text-ink-3">
                              {al.type} • {formatDate(al.maturity_date)}
                            </p>
                          </div>
                          <Badge variant={al.days_until <= 7 ? "error" : "warning"}>{al.days_until <= 0 ? "matured" : `${al.days_until}d`}</Badge>
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

      <InvestmentFormDialog open={formOpen} onOpenChange={setFormOpen} investment={editing} onSuccess={() => router.refresh()} />

      <SipFormDialog open={sipOpen} onOpenChange={setSipOpen} sip={editingSip} investments={investmentOpts} onSuccess={() => router.refresh()} />

      <DividendFormDialog open={dividendOpen} onOpenChange={setDividendOpen} dividend={editingDividend} investments={investmentOpts} onSuccess={() => router.refresh()} />

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
      <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
    </div>
  );
}
