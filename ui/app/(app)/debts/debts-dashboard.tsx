"use client";

import { useEffect, useState, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { DebtCard } from "./debt-card";
import { DebtFormDialog } from "./debt-form-dialog";
import { formatINR } from "@/lib/format";
import { Landmark, Plus, Wallet, AlertTriangle, TrendingDown, Download, Calendar, Calculator, History, BarChart3, ShieldAlert, ArrowUpDown, RefreshCw } from "lucide-react";
import { deleteDebtAction, closeDebtAction, reopenDebtAction, updateMonthlyIncome, regenerateAmortization } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Debt = {
  id: string;
  name: string;
  type: string;
  principal_original: string;
  principal_outstanding: string;
  interest_rate: string;
  emi_amount: string;
  tenure_months: number;
  start_date: string;
  version: number;
  account_id: string | null;
  months_remaining?: number | null;
  total_interest_paid?: number | string;
  remaining_interest?: number | null;
  progress_pct?: number | null;
};

type Dti = {
  monthly_income: number | null;
  total_monthly_emi: number;
  dti: number | null;
  level: string | null;
  color: string | null;
  income_missing: boolean;
} | null;

type HealthAlerts = {
  alerts: { type: string; severity: string; details: unknown }[];
  summary: { critical: number; warning: number; info: number };
} | null;

type CombinedTimeline = {
  combined: {
    total_outstanding: number;
    total_monthly_emi: number;
    total_interest_remaining?: number;
    debt_free_date: string | null;
    active_count: number;
  };
  timeline: { debt_id: string; name: string; type: string; outstanding: number; emi_amount: number | null; interest_rate: number; months_remaining: number | null; payoff_date: string | null }[];
} | null;

type ScheduleRow = { period: number; emi_amount: number; principal_part: number; interest_part: number; outstanding_after: number; cumulative_interest: number; scheduled_date: string | null };
type Payment = { id: string; debt_id: string; type: string; amount: number; principal_part: number; interest_part: number; outstanding_after: number; date: string; transaction_id: string | null; notes: string | null };
type PaymentStatusEntry = { month: string; status: string; scheduled_emi: number | null; amount: number | null; period: number | null };

function DtiCard({ dti }: { dti: Dti }) {
  const [open, setOpen] = useState(false);
  const [income, setIncome] = useState(dti?.monthly_income != null ? String(dti.monthly_income) : "");
  const [state, formAction, isPending] = useActionState(updateMonthlyIncome as unknown as (prev: unknown, fd: FormData) => Promise<unknown>, null);
  useEffect(() => {
    const s = state as unknown as { success?: boolean; error?: string } | null;
    if (s?.success) {
      toast.success("Monthly income updated");
      setOpen(false);
    }
    if (s?.error) toast.error(String(s.error));
  }, [state]);

  useEffect(() => {
    setIncome(dti?.monthly_income != null ? String(dti.monthly_income) : "");
  }, [dti]);

  const levelColor = dti?.color || (dti?.level === "green" ? "#16a34a" : dti?.level === "yellow" ? "#eab308" : dti?.level === "orange" ? "#f97316" : dti?.level === "red" ? "#dc2626" : "#6b7280");

  return (
    <>
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[13px] font-medium font-heading text-neutral-500">Debt-to-Income (DTI)</p>
            <p className="text-[28px] font-bold font-heading leading-none" style={{ color: dti?.dti != null ? levelColor : "#111827" }}>
              {dti?.dti != null ? `${dti.dti.toFixed(2)}%` : "—"}
            </p>
            <p className="text-xs text-neutral-500 font-body">
              {dti?.income_missing ? "Set monthly income to calculate DTI" : dti?.level ? `Level: ${dti.level}` : "No active EMI"}
            </p>
            <p className="text-xs text-neutral-400">EMI {formatINR(dti?.total_monthly_emi ?? 0)} {dti?.monthly_income != null ? `• Income ${formatINR(dti.monthly_income)}` : ""}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {dti?.dti != null && <Badge variant={dti.level === "green" ? "success" : dti.level === "red" ? "error" : "warning"}>{dti.level}</Badge>}
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>Set Income</Button>
          </div>
        </div>
        {dti?.dti != null && (
          <div className="mt-3">
            <Progress value={Math.min(100, dti.dti)} indicatorClassName={dti.level === "green" ? "bg-green-600" : dti.level === "yellow" ? "bg-yellow-500" : dti.level === "orange" ? "bg-orange-500" : "bg-red-600"} />
          </div>
        )}
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update monthly income</DialogTitle>
            <DialogDescription>Used to calculate DTI. Leave empty to clear.</DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="monthly_income">Monthly income (INR)</Label>
              <Input id="monthly_income" name="monthly_income" type="number" step="0.01" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="50000" />
              {(state as unknown as { fieldErrors?: Record<string, string> })?.fieldErrors?.monthly_income && <p className="text-xs text-error-dark">{(state as unknown as { fieldErrors?: Record<string, string> }).fieldErrors?.monthly_income}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : "Save"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function HealthAlertsCard({ data }: { data: HealthAlerts }) {
  if (!data) return null;
  const alerts = data.alerts ?? [];
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-5 w-5" /> Health Alerts</CardTitle>
        <CardDescription>{alerts.length} alerts • {data.summary?.critical ?? 0} critical, {data.summary?.warning ?? 0} warning, {data.summary?.info ?? 0} info</CardDescription>
      </CardHeader>
      {alerts.length === 0 ? (
        <p className="text-sm text-neutral-500">No health alerts — you are on track.</p>
      ) : (
        <div className="space-y-3">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-start justify-between rounded-lg border border-neutral-100 p-3">
              <div>
                <p className="text-sm font-medium font-heading text-neutral-800">{a.type.replace(/_/g, " ")}</p>
                <pre className="text-xs text-neutral-500 whitespace-pre-wrap break-words max-w-[32ch] sm:max-w-none">{JSON.stringify(a.details, null, 2)}</pre>
              </div>
              <Badge variant={a.severity === "critical" ? "error" : a.severity === "warning" ? "warning" : "info"}>{a.severity}</Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function AmortizationDialog({ debt, open, onOpenChange }: { debt: Debt | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState<string>("");
  const [cost, setCost] = useState<{ principal_paid: number; interest_paid: number; remaining_interest: number; total_cost: number; principal_pct: number; interest_pct: number } | null>(null);

  useEffect(() => {
    if (!open || !debt) return;
    setLoading(true);
    const qs = year ? `?year=${year}` : "";
    fetch(`/api/debts/${debt.id}/amortization${qs}`)
      .then((r) => r.json())
      .then((d) => setRows(d.schedule ?? []))
      .catch(() => toast.error("Could not load amortization"))
      .finally(() => setLoading(false));
    fetch(`/api/debts/${debt.id}/cost-breakdown`)
      .then((r) => r.json())
      .then((d) => setCost(d))
      .catch(() => {});
  }, [open, debt, year]);

  const handleRegenerate = async () => {
    if (!debt) return;
    const fd = new FormData();
    fd.set("debtId", debt.id);
    const res = await regenerateAmortization(null as never, fd as never);
    if ((res as { error?: string })?.error) toast.error(String((res as { error: string }).error));
    else {
      toast.success("Schedule regenerated");
      const r = await fetch(`/api/debts/${debt.id}/amortization`).then((x) => x.json());
      setRows(r.schedule ?? []);
    }
  };

  if (!debt) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Amortization — {debt.name}</DialogTitle>
          <DialogDescription>{rows.length} periods • {formatINR(Number(debt.emi_amount || 0))} EMI at {debt.interest_rate}%</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap gap-2 items-center">
          <Input placeholder="Filter year e.g. 2026" value={year} onChange={(e) => setYear(e.target.value)} className="w-40" />
          <Button variant="outline" size="sm" onClick={handleRegenerate}><RefreshCw className="h-4 w-4" /> Regenerate</Button>
          <Button variant="outline" size="sm" asChild><a href={`/api/debts/${debt.id}/amortization/export`} download><Download className="h-4 w-4" /> Export CSV</a></Button>
        </div>
        {cost && (
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-neutral-50 p-2"><p className="text-neutral-500">Principal paid</p><p className="font-semibold">{formatINR(cost.principal_paid)}</p></div>
            <div className="rounded-lg bg-primary-50 p-2"><p className="text-primary-700">Interest paid</p><p className="font-semibold">{formatINR(cost.interest_paid)}</p></div>
            <div className="rounded-lg bg-amber-50 p-2"><p className="text-amber-700">Remaining interest</p><p className="font-semibold">{formatINR(cost.remaining_interest)}</p></div>
          </div>
        )}
        <div className="max-h-[50vh] overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
              <tr><th className="p-2 text-left">Period</th><th className="p-2 text-right">EMI</th><th className="p-2 text-right">Principal</th><th className="p-2 text-right">Interest</th><th className="p-2 text-right">Balance</th><th className="p-2 text-right">Cumulative</th><th className="p-2 text-left">Date</th></tr>
            </thead>
            <tbody>
              {loading ? <tr><td colSpan={7} className="p-4 text-center text-neutral-400">Loading...</td></tr> : rows.length === 0 ? <tr><td colSpan={7} className="p-4 text-center text-neutral-400">No schedule (credit card or fully paid)</td></tr> : rows.map((r) => (
                <tr key={r.period} className="border-t text-xs">
                  <td className="p-2">{r.period}</td>
                  <td className="p-2 text-right">{formatINR(r.emi_amount)}</td>
                  <td className="p-2 text-right">{formatINR(r.principal_part)}</td>
                  <td className="p-2 text-right">{formatINR(r.interest_part)}</td>
                  <td className="p-2 text-right">{formatINR(r.outstanding_after)}</td>
                  <td className="p-2 text-right">{formatINR(r.cumulative_interest)}</td>
                  <td className="p-2">{r.scheduled_date ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PrepaymentSimulatorDialog({ debt, open, onOpenChange }: { debt: Debt | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [amount, setAmount] = useState("10000");
  const [strategy, setStrategy] = useState<"reduce_emi" | "reduce_tenure">("reduce_tenure");
  const [result, setResult] = useState<{ new_emi: number; new_tenure_months: number; months_saved: number; interest_saved: number; original_interest: number; new_interest: number; current_debt_free_date: string | null; new_debt_free_date: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const simulate = async () => {
    if (!debt) return;
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount"); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/debts/${debt.id}/simulate-prepayment`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, strategy }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.fieldErrors?.amount || data.fieldErrors?.strategy || "Simulation failed");
      setResult(data.simulation);
    } catch (e) {
      toast.error(String(e));
    } finally { setLoading(false); }
  };

  const apply = async () => {
    if (!debt) return;
    const res = await fetch(`/api/debts/${debt.id}/prepayments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, date: new Date().toISOString().slice(0, 10) }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || data.fieldErrors?.amount || "Prepayment failed");
    else {
      toast.success("Prepayment applied");
      onOpenChange(false);
      router.refresh();
    }
  };

  useEffect(() => { if (!open) setResult(null); }, [open]);

  if (!debt) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prepayment simulator — {debt.name}</DialogTitle>
          <DialogDescription>Compare reduce EMI vs reduce tenure before applying.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Amount (INR)</Label>
              <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" />
            </div>
            <div className="space-y-2">
              <Label>Strategy</Label>
              <Select value={strategy} onValueChange={(v) => setStrategy(v as never)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reduce_tenure">Reduce tenure (keep EMI)</SelectItem>
                  <SelectItem value="reduce_emi">Reduce EMI (keep tenure)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={simulate} disabled={loading} className="w-full"><Calculator className="h-4 w-4" /> {loading ? "Simulating..." : "Simulate"}</Button>

          {result && (
            <Card className="p-4 space-y-2 bg-neutral-50">
              <p className="text-sm font-semibold">Result ({strategy.replace("_"," ")})</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><p className="text-xs text-neutral-500">New EMI</p><p className="font-medium">{formatINR(result.new_emi)}</p></div>
                <div><p className="text-xs text-neutral-500">New tenure</p><p className="font-medium">{result.new_tenure_months} months</p></div>
                <div><p className="text-xs text-neutral-500">Months saved</p><p className="font-medium">{result.months_saved}</p></div>
                <div><p className="text-xs text-neutral-500">Interest saved</p><p className="font-medium text-success">{formatINR(result.interest_saved)}</p></div>
                <div><p className="text-xs text-neutral-500">Original interest</p><p className="font-medium">{formatINR(result.original_interest)}</p></div>
                <div><p className="text-xs text-neutral-500">New interest</p><p className="font-medium">{formatINR(result.new_interest)}</p></div>
              </div>
              <p className="text-xs text-neutral-400">Current debt-free {result.current_debt_free_date ?? "—"} → New {result.new_debt_free_date ?? "—"}</p>
              <Button onClick={apply} variant="default" className="w-full mt-2">Apply prepayment</Button>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsHistoryDialog({ debt, open, onOpenChange }: { debt: Debt | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(false);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0,10));
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<Payment | null>(null);
  const router = useRouter();

  const load = async () => {
    if (!debt) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/debts/${debt.id}/payments`);
      const d = await r.json();
      setPayments(d.payments ?? []);
    } catch { toast.error("Could not load payments"); }
    finally { setLoading(false); }
  };
  useEffect(() => { if (open) load(); }, [open, debt]);

  const handleLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debt) return;
    const payload: Record<string, unknown> = { date };
    if (amount) payload.amount = amount;
    if (notes) payload.notes = notes;
    const res = await fetch(`/api/debts/${debt.id}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || data.fieldErrors?.amount || "Could not log payment");
    else { toast.success("Payment logged"); setAmount(""); setNotes(""); load(); router.refresh(); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debt || !editing) return;
    const res = await fetch(`/api/debts/${debt.id}/payments/${editing.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount, date, notes }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) toast.error(data.error || "Could not update");
    else { toast.success("Payment updated"); setEditing(null); setAmount(""); setNotes(""); load(); router.refresh(); }
  };

  const handleDelete = async (pid: string) => {
    if (!debt) return;
    if (!confirm("Delete payment?")) return;
    const res = await fetch(`/api/debts/${debt.id}/payments/${pid}`, { method: "DELETE" });
    if (!res.ok) toast.error("Could not delete");
    else { toast.success("Payment deleted"); load(); router.refresh(); }
  };

  if (!debt) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Payments — {debt.name}</DialogTitle>
          <DialogDescription>{payments.length} payments • Outstanding {formatINR(Number(debt.principal_outstanding))}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="history" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
            <TabsTrigger value="log" className="flex-1">{editing ? "Edit" : "Log"} Payment</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="space-y-3">
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500"><tr><th className="p-2 text-left">Date</th><th className="p-2 text-left">Type</th><th className="p-2 text-right">Amount</th><th className="p-2 text-right">Principal</th><th className="p-2 text-right">Interest</th><th className="p-2 text-right">Balance</th><th className="p-2">Actions</th></tr></thead>
                <tbody>
                  {loading ? <tr><td colSpan={7} className="p-4 text-center text-neutral-400">Loading...</td></tr> : payments.length === 0 ? <tr><td colSpan={7} className="p-4 text-center text-neutral-400">No payments yet</td></tr> : payments.map((p) => (
                    <tr key={p.id} className="border-t text-xs">
                      <td className="p-2">{p.date}</td>
                      <td className="p-2"><Badge variant={p.type === "prepayment" ? "warning" : "secondary"}>{p.type}</Badge></td>
                      <td className="p-2 text-right">{formatINR(p.amount)}</td>
                      <td className="p-2 text-right">{formatINR(p.principal_part)}</td>
                      <td className="p-2 text-right">{formatINR(p.interest_part)}</td>
                      <td className="p-2 text-right">{formatINR(p.outstanding_after)}</td>
                      <td className="p-2 flex gap-1 justify-center">
                        <Button variant="ghost" size="sm" onClick={() => { setEditing(p); setAmount(String(p.amount)); setDate(p.date); setNotes(p.notes ?? ""); }}>Edit</Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDelete(p.id)}>Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="log">
            <form onSubmit={editing ? handleUpdate : handleLog} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount (defaults to EMI {formatINR(Number(debt.emi_amount || 0))})</Label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="10000" />
                </div>
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="EMI June" />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{editing ? "Update Payment" : "Log Payment"}</Button>
                {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setAmount(""); setNotes(""); }}>Cancel</Button>}
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function PaymentStatusDialog({ debt, open, onOpenChange }: { debt: Debt | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const [entries, setEntries] = useState<PaymentStatusEntry[]>([]);
  const [missed, setMissed] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open || !debt) return;
    setLoading(true);
    fetch(`/api/debts/${debt.id}/payment-status`)
      .then((r) => r.json())
      .then((d) => { setEntries(d.months ?? []); setMissed(d.missed_count ?? 0); })
      .catch(() => toast.error("Could not load payment status"))
      .finally(() => setLoading(false));
  }, [open, debt]);
  if (!debt) return null;
  const colorFor = (s: string) => s === "paid" ? "success" : s === "missed" ? "error" : s === "partial" ? "warning" : s === "scheduled" ? "secondary" : "default";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Payment status — {debt.name}</DialogTitle>
          <DialogDescription>12-month timeline • {missed} missed payments</DialogDescription>
        </DialogHeader>
        {loading ? <p className="text-sm text-neutral-400">Loading...</p> : (
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            <div className="grid grid-cols-4 gap-2 text-xs">
              {entries.map((m) => (
                <div key={m.month} className="rounded-lg border border-neutral-100 p-2 text-center">
                  <p className="font-medium">{m.month}</p>
                  <Badge variant={colorFor(m.status) as never} className="mt-1">{m.status}</Badge>
                  <p className="text-[11px] text-neutral-400 mt-1">{m.amount != null ? formatINR(m.amount) : "—"} {m.scheduled_emi != null ? `/ ${formatINR(m.scheduled_emi)}` : ""}</p>
                </div>
              ))}
            </div>
            {entries.length === 0 && <p className="text-sm text-neutral-500">No schedule available.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StrategiesCompare({ debts }: { debts: Debt[] }) {
  const [extra, setExtra] = useState("5000");
  const [data, setData] = useState<{ baseline: { months_to_debt_free: number; total_interest: number }; avalanche: { months_to_debt_free: number; total_interest: number; interest_saved: number; debt_free_date: string | null; payoff_order: string[] }; snowball: { months_to_debt_free: number; total_interest: number; interest_saved: number; payoff_order: string[] } } | null>(null);
  const [loading, setLoading] = useState(false);
  const compare = async () => {
    if (!extra || Number(extra) <= 0) { toast.error("Enter extra amount > 0"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/debts/strategies/compare", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extra_monthly: extra }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.fieldErrors?.extra_monthly || "Compare failed");
      setData(j);
    } catch (e) {
      toast.error(String(e));
    } finally { setLoading(false); }
  };
  const compareCombined = async () => {
    if (!extra || Number(extra) <= 0) { toast.error("Enter extra amount > 0"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/debts/combined/strategies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ extra_monthly: extra }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || j.fieldErrors?.extra_monthly || "Compare failed");
      setData(j);
    } catch (e) {
      toast.error(String(e));
    } finally { setLoading(false); }
  };
  if (debts.length === 0) return null;
  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ArrowUpDown className="h-5 w-5" /> Strategies: Avalanche vs Snowball</CardTitle>
        <CardDescription>Compare payoff order with extra monthly payment. All data from API.</CardDescription>
      </CardHeader>
      <div className="flex gap-2 items-end">
        <div className="space-y-1">
          <Label>Extra monthly (INR)</Label>
          <Input value={extra} onChange={(e) => setExtra(e.target.value)} type="number" className="w-40" />
        </div>
        <Button onClick={compare} disabled={loading}><TrendingDown className="h-4 w-4" /> {loading ? "..." : "Compare (per-debt)"}</Button>
        <Button variant="outline" onClick={compareCombined} disabled={loading}>Compare (combined)</Button>
      </div>
      {data && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-neutral-500">Baseline</p>
            <p className="text-sm font-semibold">{data.baseline.months_to_debt_free} months</p>
            <p className="text-xs text-neutral-500">Interest {formatINR(data.baseline.total_interest)}</p>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-xs text-green-700">Avalanche (high rate first)</p>
            <p className="text-sm font-semibold">{data.avalanche.months_to_debt_free} months • Saved {formatINR(data.avalanche.interest_saved)}</p>
            <p className="text-xs text-neutral-500">Interest {formatINR(data.avalanche.total_interest)}</p>
            <p className="text-xs text-neutral-400 break-all">Order: {data.avalanche.payoff_order.join(" → ") || "—"}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs text-blue-700">Snowball (small balance first)</p>
            <p className="text-sm font-semibold">{data.snowball.months_to_debt_free} months • Saved {formatINR(data.snowball.interest_saved)}</p>
            <p className="text-xs text-neutral-500">Interest {formatINR(data.snowball.total_interest)}</p>
            <p className="text-xs text-neutral-400 break-all">Order: {data.snowball.payoff_order.join(" → ") || "—"}</p>
          </div>
        </div>
      )}
    </Card>
  );
}

export function DebtsDashboard({
  debts,
  dashboard,
  accounts,
  dti,
  healthAlerts,
  combinedTimeline,
}: {
  debts: Debt[];
  dashboard: { total_outstanding: number; total_emi: number; total_monthly_emi?: number; debt_free_date?: string | null; dti?: unknown; active_count?: number; closed_count?: number } | null;
  accounts: { id: string; name: string }[];
  dti?: Dti;
  healthAlerts?: HealthAlerts;
  combinedTimeline?: CombinedTimeline;
  settings?: unknown;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Debt | null>(null);
  const [amortDebt, setAmortDebt] = useState<Debt | null>(null);
  const [prepayDebt, setPrepayDebt] = useState<Debt | null>(null);
  const [historyDebt, setHistoryDebt] = useState<Debt | null>(null);
  const [statusDebt, setStatusDebt] = useState<Debt | null>(null);

  const totalOutstanding = dashboard?.total_outstanding ?? combinedTimeline?.combined.total_outstanding ?? debts.reduce((s, d) => s + Number(d.principal_outstanding), 0);
  const totalEmi = dashboard?.total_emi ?? dashboard?.total_monthly_emi ?? combinedTimeline?.combined.total_monthly_emi ?? debts.reduce((s, d) => s + Number(d.emi_amount || 0), 0);
  const debtFreeDate = dashboard?.debt_free_date ?? combinedTimeline?.combined.debt_free_date ?? null;

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this debt? Only if no EMI recorded.")) return;
    const res = await deleteDebtAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Debt deleted");
      router.refresh();
    }
  };
  const handleClose = async (id: string) => {
    const res = await closeDebtAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Debt closed");
      router.refresh();
    }
  };
  const handleReopen = async (id: string) => {
    const res = await reopenDebtAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Debt reopened");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Debts</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">{debts.length} debts • Total EMI {formatINR(totalEmi)} {debtFreeDate ? `• Debt-free ${debtFreeDate}` : ""}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/api/debts/export" download>
              <Download className="h-4 w-4" /> Export Debts
            </a>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Debt
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Total Outstanding" value={formatINR(totalOutstanding)} icon={<Landmark className="h-5 w-5" />} variant="rose" />
        <StatCard label="Monthly EMI" value={formatINR(totalEmi)} icon={<Wallet className="h-5 w-5" />} subtext={combinedTimeline?.combined.active_count != null ? `${combinedTimeline.combined.active_count} active` : undefined} variant="amber" />
        <DtiCard dti={dti ?? null} />
      </div>

      {healthAlerts && <HealthAlertsCard data={healthAlerts} />}

      {combinedTimeline && (
        <Card className="p-6">
          <CardHeader className="p-0 mb-3">
            <CardTitle className="flex items-center gap-2 text-base"><BarChart3 className="h-5 w-5" /> Combined Timeline</CardTitle>
            <CardDescription>Total outstanding {formatINR(combinedTimeline.combined.total_outstanding)} • EMI {formatINR(combinedTimeline.combined.total_monthly_emi)} • Debt-free {combinedTimeline.combined.debt_free_date ?? "—"}</CardDescription>
          </CardHeader>
          <div className="space-y-2">
            {combinedTimeline.timeline.map((t) => (
              <div key={t.debt_id} className="flex justify-between items-center rounded-lg bg-neutral-50 p-3">
                <div>
                  <p className="text-sm font-medium">{t.name} • {t.type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-neutral-500">{t.months_remaining != null ? `${t.months_remaining} months remaining` : "no EMI"} {t.payoff_date ? `• Payoff ${t.payoff_date}` : ""}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatINR(t.outstanding)}</p>
                  <p className="text-xs text-neutral-500">{t.emi_amount != null ? formatINR(t.emi_amount) : "—"} @ {t.interest_rate}%</p>
                </div>
              </div>
            ))}
            {combinedTimeline.timeline.length === 0 && <p className="text-sm text-neutral-500">No active debts.</p>}
          </div>
        </Card>
      )}

      <StrategiesCompare debts={debts} />

      {debts.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="No debts"
          description="Add a debt to track EMI, interest and payoff progress."
          actionLabel="Add Debt"
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {debts.map((d) => (
            <div key={d.id} className="space-y-2">
              <DebtCard
                debt={d}
                onEdit={() => {
                  setEditing(d);
                  setFormOpen(true);
                }}
                onDelete={() => handleDelete(d.id)}
                onClose={() => handleClose(d.id)}
                onReopen={() => handleReopen(d.id)}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" onClick={() => setHistoryDebt(d)}><History className="h-3 w-3" /> Payments</Button>
                <Button variant="outline" size="sm" onClick={() => setStatusDebt(d)}><Calendar className="h-3 w-3" /> Status</Button>
                <Button variant="outline" size="sm" onClick={() => setAmortDebt(d)}><BarChart3 className="h-3 w-3" /> Schedule</Button>
                <Button variant="outline" size="sm" onClick={() => setPrepayDebt(d)}><Calculator className="h-3 w-3" /> Prepay</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <DebtFormDialog open={formOpen} onOpenChange={setFormOpen} debt={editing} accounts={accounts} onSuccess={() => router.refresh()} />
      <AmortizationDialog debt={amortDebt} open={!!amortDebt} onOpenChange={(v) => !v && setAmortDebt(null)} />
      <PrepaymentSimulatorDialog debt={prepayDebt} open={!!prepayDebt} onOpenChange={(v) => !v && setPrepayDebt(null)} />
      <PaymentsHistoryDialog debt={historyDebt} open={!!historyDebt} onOpenChange={(v) => !v && setHistoryDebt(null)} />
      <PaymentStatusDialog debt={statusDebt} open={!!statusDebt} onOpenChange={(v) => !v && setStatusDebt(null)} />
    </div>
  );
}
