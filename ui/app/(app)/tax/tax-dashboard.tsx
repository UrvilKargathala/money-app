"use client";

import { useState, useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TaxInvestmentDialog } from "./tax-investment-dialog";
import { formatINR } from "@/lib/format";
import { Calculator, Plus, Download, Trash2, Pencil, Wallet, TrendingUp, Lightbulb, FileCheck, Briefcase } from "lucide-react";
import { deleteTaxInvestmentAction, upsertSalary, patchSalary, createItrDoc, updateItrDoc, deleteItrDocAction, suggestItrDocs } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Investment = { id: string; section: string; name: string; amount: string; investment_date: string; proof_status: string; financial_year: string; version: number };
type Utilization = { section_code: string; section_name: string; limit: number; invested: number; utilization_pct: number };
type Summary = { total_invested: number; total_deduction: number; financial_year: string } | null;
type Salary = {
  id: string;
  financial_year: string;
  employment_type: string;
  basic_monthly: number;
  hra_monthly: number | null;
  lta_annual: number | null;
  special_allowances: number | null;
  employer_pf: number | null;
  actual_rent_monthly: number | null;
  other_exemptions: number | null;
  gross_annual_income: number | null;
  additional_income: number | null;
  tds_deducted: number | null;
} | null;
type Compare = {
  financial_year: string;
  has_salary: boolean;
  old_regime: { taxable_income: number; total_tax: number; gross_income: number; exemptions: number } | null;
  new_regime: { taxable_income: number; total_tax: number; gross_income: number; exemptions: number } | null;
  savings: number | null;
  recommended: string | null;
  recommended_label: string | null;
} | null;
type Suggestion = { section: string; name: string; max_limit: number; invested: number; remaining: number; suggested_amount: number; reason: string };
type ItrDocument = { id: string; financial_year: string; category: string; document_name: string; status: string; is_suggested: number; notes: string | null };
type ItrCompletion = { total: number; pending: number; collected: number; submitted: number; completion_pct: number } | null;

function SalaryDialog({ open, onOpenChange, salary, fy, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; salary: Salary; fy: string; onSuccess?: () => void }) {
  const isEdit = !!salary;
  const [employmentType, setEmploymentType] = useState(salary?.employment_type ?? "salaried");
  const [state, formAction, isPending] = useActionState(isEdit ? patchSalary : upsertSalary, null as never);

  useEffect(() => {
    if (open) setEmploymentType(salary?.employment_type ?? "salaried");
  }, [open, salary]);

  useEffect(() => {
    const s = state as unknown as { success?: boolean; error?: string } | null;
    if (s?.success) {
      toast.success(isEdit ? "Salary updated" : "Salary saved");
      onOpenChange(false);
      onSuccess?.();
    }
    if (s?.error) toast.error(String(s.error));
  }, [state, isEdit, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit salary structure" : "Add salary structure"} — FY {fy}</DialogTitle>
          <DialogDescription>Employment type, gross and deductions drive regime comparison.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="financial_year" value={fy} />
          <input type="hidden" name="employment_type" value={employmentType} />

          {(state as unknown as { error?: string })?.error && <p className="text-sm text-error-dark">{(state as unknown as { error: string }).error}</p>}

          <div className="space-y-2">
            <Label>Employment type</Label>
            <Select value={employmentType} onValueChange={setEmploymentType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="salaried">Salaried</SelectItem>
                <SelectItem value="business">Business</SelectItem>
                <SelectItem value="freelancer">Freelancer</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="basic_monthly">Basic monthly</Label>
              <Input id="basic_monthly" name="basic_monthly" type="number" step="0.01" defaultValue={salary?.basic_monthly ?? ""} placeholder="50000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hra_monthly">HRA monthly</Label>
              <Input id="hra_monthly" name="hra_monthly" type="number" step="0.01" defaultValue={salary?.hra_monthly ?? ""} placeholder="20000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="special_allowances">Special allowances (monthly)</Label>
              <Input id="special_allowances" name="special_allowances" type="number" step="0.01" defaultValue={salary?.special_allowances ?? ""} placeholder="10000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lta_annual">LTA annual</Label>
              <Input id="lta_annual" name="lta_annual" type="number" step="0.01" defaultValue={salary?.lta_annual ?? ""} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="employer_pf">Employer PF (monthly)</Label>
              <Input id="employer_pf" name="employer_pf" type="number" step="0.01" defaultValue={salary?.employer_pf ?? ""} placeholder="5400" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="actual_rent_monthly">Actual rent monthly</Label>
              <Input id="actual_rent_monthly" name="actual_rent_monthly" type="number" step="0.01" defaultValue={salary?.actual_rent_monthly ?? ""} placeholder="15000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="other_exemptions">Other exemptions (annual)</Label>
              <Input id="other_exemptions" name="other_exemptions" type="number" step="0.01" defaultValue={salary?.other_exemptions ?? ""} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gross_annual_income">Gross annual income (non-salaried)</Label>
              <Input id="gross_annual_income" name="gross_annual_income" type="number" step="0.01" defaultValue={salary?.gross_annual_income ?? ""} placeholder="450000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="additional_income">Additional income (annual)</Label>
              <Input id="additional_income" name="additional_income" type="number" step="0.01" defaultValue={salary?.additional_income ?? ""} placeholder="0" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tds_deducted">TDS deducted (annual)</Label>
              <Input id="tds_deducted" name="tds_deducted" type="number" step="0.01" defaultValue={salary?.tds_deducted ?? ""} placeholder="0" />
            </div>
          </div>

          {(state as unknown as { fieldErrors?: Record<string,string> })?.fieldErrors && (
            <div className="space-y-1">
              {Object.entries((state as unknown as { fieldErrors: Record<string,string> }).fieldErrors).map(([k,v]) => (
                <p key={k} className="text-xs text-error-dark">{k}: {v}</p>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : isEdit ? "Update" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItrDialog({ open, onOpenChange, doc, fy, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; doc: ItrDocument | null; fy: string; onSuccess?: () => void }) {
  const isEdit = !!doc;
  const [category, setCategory] = useState(doc?.category ?? "income_proof");
  const [status, setStatus] = useState(doc?.status ?? "pending");
  const [state, formAction, isPending] = useActionState(isEdit ? updateItrDoc : createItrDoc, null as never);

  useEffect(() => {
    if (open) {
      setCategory(doc?.category ?? "income_proof");
      setStatus(doc?.status ?? "pending");
    }
  }, [open, doc]);

  useEffect(() => {
    const s = state as unknown as { success?: boolean; error?: string } | null;
    if (s?.success) {
      toast.success(isEdit ? "Document updated" : "Document added");
      onOpenChange(false);
      onSuccess?.();
    }
    if (s?.error) toast.error(String(s.error));
  }, [state, isEdit, onOpenChange, onSuccess]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit document" : "Add ITR document"} — FY {fy}</DialogTitle>
          <DialogDescription>Category and status drive the checklist completion.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {isEdit && <input type="hidden" name="id" value={doc!.id} />}
          <input type="hidden" name="financial_year" value={fy} />
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="status" value={status} />
          {(state as unknown as { error?: string })?.error && <p className="text-sm text-error-dark">{(state as unknown as { error: string }).error}</p>}
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="income_proof">Income proof</SelectItem>
                <SelectItem value="investment_proof">Investment proof</SelectItem>
                <SelectItem value="deduction_proof">Deduction proof</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="document_name">Document name *</Label>
            <Input id="document_name" name="document_name" defaultValue={doc?.document_name ?? ""} placeholder="Form 16 - FY 2026-27" required />
            {(state as unknown as { fieldErrors?: Record<string,string> })?.fieldErrors?.document_name && <p className="text-xs text-error-dark">{(state as unknown as { fieldErrors: Record<string,string> }).fieldErrors.document_name}</p>}
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="collected">Collected</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" name="notes" defaultValue={doc?.notes ?? ""} placeholder="Optional notes" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? "Saving..." : isEdit ? "Save" : "Add"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TaxDashboard({
  investments,
  utilization,
  summary,
  sections,
  fy,
  salary,
  compare,
  suggestions,
  itrDocuments,
  itrCompletion,
}: {
  investments: Investment[];
  utilization: Utilization[];
  summary: Summary;
  sections: { section_code: string; section_name: string; limit: number }[];
  fy: string;
  salary: Salary;
  compare: Compare;
  suggestions: Suggestion[];
  itrDocuments: ItrDocument[];
  itrCompletion: ItrCompletion;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Investment | null>(null);
  const [selectedFy, setSelectedFy] = useState(fy);
  const [salaryOpen, setSalaryOpen] = useState(false);
  const [itrOpen, setItrOpen] = useState(false);
  const [itrEditing, setItrEditing] = useState<ItrDocument | null>(null);
  const [itrCategoryFilter, setItrCategoryFilter] = useState<string>("all");
  const [suggestState, suggestAction, suggestPending] = useActionState(suggestItrDocs as unknown as (prev: unknown, fd: FormData) => Promise<unknown>, null);

  useEffect(() => {
    const s = suggestState as unknown as { success?: boolean; error?: string } | null;
    if (s?.success) {
      toast.success("Suggested documents added");
      router.refresh();
    }
    if (s?.error) toast.error(String(s.error));
  }, [suggestState, router]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this investment?")) return;
    const res = await deleteTaxInvestmentAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Deleted");
      router.refresh();
    }
  };

  const handleDeleteItr = async (id: string) => {
    if (!confirm("Delete this document?")) return;
    const res = await deleteItrDocAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Document deleted");
      router.refresh();
    }
  };

  const handleFyChange = (v: string) => {
    setSelectedFy(v);
    router.push(`/tax?fy=${v}`);
  };

  const now = new Date();
  const currentFyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const fyOptions = [0, 1, 2, 3, 4].map((i) => {
    const y = currentFyStart - i;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });

  const filteredItr = itrCategoryFilter === "all" ? itrDocuments : itrDocuments.filter((d) => d.category === itrCategoryFilter);

  const completionTotal = itrCompletion?.total ?? itrDocuments.length;
  const completionPct = itrCompletion?.completion_pct ?? 0;
  const pendingCount = itrCompletion?.pending ?? itrDocuments.filter((d) => d.status === "pending").length;
  const collectedCount = itrCompletion?.collected ?? itrDocuments.filter((d) => d.status === "collected").length;
  const submittedCount = itrCompletion?.submitted ?? itrDocuments.filter((d) => d.status === "submitted").length;

  // Gross / deductions derived from salary if available
  const salaryGross = (() => {
    if (!salary) return null;
    if (salary.employment_type === "salaried") {
      const basicY = (salary.basic_monthly ?? 0) * 12;
      const hraY = (salary.hra_monthly ?? 0) * 12;
      const specialY = (salary.special_allowances ?? 0) * 12;
      const lta = salary.lta_annual ?? 0;
      const add = salary.additional_income ?? 0;
      return basicY + hraY + specialY + lta + add;
    }
    return (salary.gross_annual_income ?? 0) + (salary.additional_income ?? 0);
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Tax Planning</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">Section 80C/80D tracking • FY {fy}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={selectedFy} onValueChange={handleFyChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" asChild>
            <a href={`/api/tax/exports/investments?financial_year=${fy}`} download>
              <Download className="h-4 w-4" /> Export Investments
            </a>
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Investment
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="salary">Salary</TabsTrigger>
          <TabsTrigger value="itr">ITR</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 mt-4">
          {summary && (
            <div className="grid gap-6 md:grid-cols-3">
              <StatCard label="Total Invested" value={formatINR(summary.total_invested)} icon={<Calculator className="h-5 w-5" />} />
              <StatCard label="Total Deduction" value={formatINR(summary.total_deduction)} icon={<Calculator className="h-5 w-5" />} />
              <StatCard label="FY" value={summary.financial_year} icon={<Calculator className="h-5 w-5" />} />
            </div>
          )}

          {/* Regime compare */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold font-heading text-neutral-800 flex items-center gap-2"><TrendingUp className="h-5 w-5" /> Regime Compare</h3>
              {compare?.recommended_label && <Badge variant={compare.recommended === "new" ? "info" : "success"}>{compare.recommended_label} recommended</Badge>}
            </div>
            {!compare || !compare.has_salary || !compare.old_regime || !compare.new_regime ? (
              <p className="text-sm text-neutral-500">Add a salary structure to compare Old vs New regime. All data from API.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-neutral-100 p-4">
                    <p className="text-xs font-medium text-neutral-500">Old Regime</p>
                    <p className="text-sm text-neutral-700 mt-1">Taxable {formatINR(compare.old_regime.taxable_income)} • Tax {formatINR(compare.old_regime.total_tax)}</p>
                    <p className="text-xs text-neutral-400">Gross {formatINR(compare.old_regime.gross_income)} • Exemptions {formatINR(compare.old_regime.exemptions)}</p>
                  </div>
                  <div className="rounded-lg border border-neutral-100 p-4 bg-primary-50/50">
                    <p className="text-xs font-medium text-primary-700">New Regime</p>
                    <p className="text-sm text-neutral-700 mt-1">Taxable {formatINR(compare.new_regime.taxable_income)} • Tax {formatINR(compare.new_regime.total_tax)}</p>
                    <p className="text-xs text-neutral-400">Gross {formatINR(compare.new_regime.gross_income)} • Exemptions {formatINR(compare.new_regime.exemptions)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  <Badge variant={compare.savings != null && compare.savings > 0 ? "success" : "default"}>Tax saved: {compare.savings != null ? formatINR(Math.abs(compare.savings)) : "—"}</Badge>
                  <span className="text-xs text-neutral-500">Recommendation: {compare.recommended_label ?? compare.recommended ?? "—"}</span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild><a href={`/api/tax/exports/utilization?financial_year=${fy}`} download><Download className="h-4 w-4" /> Export Utilization</a></Button>
                  <Button variant="outline" size="sm" asChild><a href={`/api/tax/exports/itr?financial_year=${fy}`} download><Download className="h-4 w-4" /> Export ITR</a></Button>
                </div>
              </div>
            )}
          </Card>

          {/* Suggestions */}
          <Card className="p-6">
            <h3 className="font-semibold font-heading text-neutral-800 mb-4 flex items-center gap-2"><Lightbulb className="h-5 w-5" /> Suggestions — unused limits</h3>
            {suggestions.length === 0 ? (
              <p className="text-sm text-neutral-500">No suggestions — all limits utilized or no actionable sections for FY {fy}.</p>
            ) : (
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <div key={s.section} className="flex justify-between items-start rounded-lg border border-neutral-100 p-3">
                    <div>
                      <p className="text-sm font-medium font-heading text-neutral-900">{s.section} — {s.name}</p>
                      <p className="text-xs text-neutral-500">{s.reason}</p>
                      <p className="text-xs text-neutral-400 mt-1">Invested {formatINR(s.invested)} / {formatINR(s.max_limit)} • Remaining {formatINR(s.remaining)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-primary-600">{formatINR(s.suggested_amount)}</p>
                      <p className="text-xs text-neutral-400">suggested</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {utilization.length > 0 && (
            <Card className="p-6">
              <h3 className="font-semibold font-heading text-neutral-800 mb-4">Section Utilization</h3>
              <div className="space-y-4">
                {utilization.map((u) => (
                  <div key={u.section_code} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">
                        {u.section_code} — {u.section_name}
                      </span>
                      <span className="text-neutral-500">
                        {formatINR(u.invested)} / {formatINR(u.limit)} • {u.utilization_pct.toFixed(1)}%
                      </span>
                    </div>
                    <Progress value={Math.min(u.utilization_pct, 100)} indicatorClassName={u.utilization_pct >= 100 ? "bg-success" : u.utilization_pct >= 80 ? "bg-warning" : "bg-primary-600"} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {investments.length === 0 ? (
            <EmptyState
              icon={<Calculator className="h-6 w-6" />}
              title="No investments"
              description={`No tax investments for FY ${fy}. Add an 80C/80D entry to track utilization.`}
              actionLabel="Add Investment"
              onAction={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            />
          ) : (
            <div className="space-y-3">
              {investments.map((inv) => (
                <Card key={inv.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold font-heading text-neutral-900">{inv.name}</p>
                    <p className="text-xs text-neutral-500">
                      {inv.section} • {formatINR(Number(inv.amount))} • {new Date(inv.investment_date).toLocaleDateString("en-IN")} • FY {inv.financial_year}
                    </p>
                    <Badge variant={inv.proof_status === "verified" ? "success" : inv.proof_status === "collected" ? "info" : "default"} className="mt-1">
                      {inv.proof_status}
                    </Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(inv);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(inv.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="salary" className="space-y-6 mt-4">
          <Card className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold font-heading text-neutral-800 flex items-center gap-2"><Briefcase className="h-5 w-5" /> Salary Structure — FY {fy}</h3>
                <p className="text-sm text-neutral-500 font-body mt-1">Employment type, gross and deductions feed the Old vs New computation.</p>
              </div>
              <Button onClick={() => setSalaryOpen(true)}><Wallet className="h-4 w-4" /> {salary ? "Edit Salary" : "Add Salary"}</Button>
            </div>

            {!salary ? (
              <div className="mt-6">
                <EmptyState icon={<Briefcase className="h-6 w-6" />} title="No salary for this FY" description={`Add salary details for FY ${fy} to enable regime comparison and tax estimation.`} actionLabel="Add Salary" onAction={() => setSalaryOpen(true)} />
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2"><span className="text-sm text-neutral-500">Employment type</span><Badge variant="secondary">{salary.employment_type}</Badge></div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Basic (monthly)</p><p className="font-semibold">{formatINR(salary.basic_monthly)}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">HRA (monthly)</p><p className="font-semibold">{salary.hra_monthly != null ? formatINR(salary.hra_monthly) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Special allow. (monthly)</p><p className="font-semibold">{salary.special_allowances != null ? formatINR(salary.special_allowances) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">LTA (annual)</p><p className="font-semibold">{salary.lta_annual != null ? formatINR(salary.lta_annual) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Actual rent (monthly)</p><p className="font-semibold">{salary.actual_rent_monthly != null ? formatINR(salary.actual_rent_monthly) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Gross (derived)</p><p className="font-semibold">{salaryGross != null ? formatINR(salaryGross) : "—"}</p></div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Other exemptions</p><p className="font-semibold">{salary.other_exemptions != null ? formatINR(salary.other_exemptions) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Employer PF (monthly)</p><p className="font-semibold">{salary.employer_pf != null ? formatINR(salary.employer_pf) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Additional income</p><p className="font-semibold">{salary.additional_income != null ? formatINR(salary.additional_income) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">TDS deducted</p><p className="font-semibold">{salary.tds_deducted != null ? formatINR(salary.tds_deducted) : "—"}</p></div>
                    <div className="rounded-lg bg-neutral-50 p-3"><p className="text-xs text-neutral-500">Gross annual (non-salaried)</p><p className="font-semibold">{salary.gross_annual_income != null ? formatINR(salary.gross_annual_income) : "—"}</p></div>
                    <div className="rounded-lg bg-primary-50 p-3"><p className="text-xs text-primary-700">Financial year</p><p className="font-semibold">{salary.financial_year}</p></div>
                  </div>
                  <p className="text-xs text-neutral-400">FY {salary.financial_year} • All amounts in INR, from API salary structure.</p>
                </div>
              </div>
            )}
          </Card>

          {salary && compare?.has_salary && compare.old_regime && compare.new_regime && (
            <Card className="p-6">
              <h3 className="font-semibold font-heading text-neutral-800 mb-3">Tax Impact of Salary</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <StatCard label="Old Regime Tax" value={formatINR(compare.old_regime.total_tax)} subtext={`Taxable ${formatINR(compare.old_regime.taxable_income)}`} />
                <StatCard label="New Regime Tax" value={formatINR(compare.new_regime.total_tax)} subtext={`Taxable ${formatINR(compare.new_regime.taxable_income)}`} />
                <StatCard label="Recommended" value={compare.recommended_label ?? "—"} subtext={compare.savings != null ? `Save ${formatINR(Math.abs(compare.savings))}` : undefined} />
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="itr" className="space-y-6 mt-4">
          <Card className="p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-semibold font-heading text-neutral-800 flex items-center gap-2"><FileCheck className="h-5 w-5" /> ITR Checklist — FY {fy}</h3>
                <p className="text-sm text-neutral-500">{completionTotal} documents • {completionPct.toFixed(1)}% complete • {pendingCount} pending, {collectedCount} collected, {submittedCount} submitted</p>
                <div className="mt-3 max-w-sm">
                  <Progress value={Math.min(completionPct, 100)} indicatorClassName={completionPct >= 100 ? "bg-success" : completionPct >= 50 ? "bg-primary-600" : "bg-warning"} />
                  <div className="flex justify-between text-xs text-neutral-500 mt-1"><span>{completionPct.toFixed(0)}% done</span><span>{completionTotal} total</span></div>
                </div>
                {/* Completion pie (simple SVG) */}
                <div className="mt-4 flex items-center gap-4">
                  <div className="h-20 w-20 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: `conic-gradient(#16a34a ${completionPct}%, #e5e7eb ${completionPct}% 100%)` }}>
                    <span className="h-14 w-14 rounded-full bg-white flex items-center justify-center">{completionPct.toFixed(0)}%</span>
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-amber-400" /> Pending {pendingCount}</div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blue-500" /> Collected {collectedCount}</div>
                    <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-600" /> Submitted {submittedCount}</div>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={itrCategoryFilter} onValueChange={setItrCategoryFilter}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="Filter category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    <SelectItem value="income_proof">Income proof</SelectItem>
                    <SelectItem value="investment_proof">Investment proof</SelectItem>
                    <SelectItem value="deduction_proof">Deduction proof</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <form action={suggestAction}>
                  <input type="hidden" name="financial_year" value={fy} />
                  <Button type="submit" variant="outline" disabled={suggestPending}><Lightbulb className="h-4 w-4" /> {suggestPending ? "Suggesting..." : "Suggest Docs"}</Button>
                </form>
                <Button variant="outline" asChild><a href={`/api/tax/exports/itr?financial_year=${fy}`} download><Download className="h-4 w-4" /> Export ITR</a></Button>
                <Button onClick={() => { setItrEditing(null); setItrOpen(true); }}><Plus className="h-4 w-4" /> Add Doc</Button>
              </div>
            </div>

            {itrDocuments.length === 0 ? (
              <div className="mt-6">
                <EmptyState icon={<FileCheck className="h-6 w-6" />} title="No ITR documents" description={`No checklist items for FY ${fy}. Use Suggest to auto-create the standard document set for this FY.`} actionLabel="Suggest Documents" onAction={() => { const fd = new FormData(); fd.set("financial_year", fy); suggestItrDocs(null as never, fd as never).then(() => { toast.success("Suggested"); router.refresh(); }); }} />
              </div>
            ) : filteredItr.length === 0 ? (
              <p className="text-sm text-neutral-500 mt-6">No documents match category {itrCategoryFilter}.</p>
            ) : (
              <div className="mt-6 overflow-auto rounded-lg border border-neutral-100">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-50 text-xs text-neutral-500">
                    <tr><th className="p-2 text-left">Category</th><th className="p-2 text-left">Document</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Notes</th><th className="p-2 text-right">Actions</th></tr>
                  </thead>
                  <tbody>
                    {filteredItr.map((d) => (
                      <tr key={d.id} className="border-t">
                        <td className="p-2"><Badge variant="default">{d.category.replace(/_/g," ")}</Badge></td>
                        <td className="p-2 font-medium">{d.document_name}</td>
                        <td className="p-2"><Badge variant={d.status === "submitted" ? "success" : d.status === "collected" ? "info" : "warning"}>{d.status}</Badge></td>
                        <td className="p-2 text-xs text-neutral-500 max-w-[20ch] truncate">{d.notes ?? "—"}</td>
                        <td className="p-2 text-right">
                          <div className="flex gap-1 justify-end">
                            <Button variant="ghost" size="icon" onClick={() => { setItrEditing(d); setItrOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteItr(d.id)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-neutral-400 mt-3">Completion: {completionTotal} total • {pendingCount} pending • {collectedCount} collected • {submittedCount} submitted • All counts from API.</p>
          </Card>
        </TabsContent>
      </Tabs>

      <TaxInvestmentDialog open={formOpen} onOpenChange={setFormOpen} investment={editing} sections={sections} fy={fy} onSuccess={() => router.refresh()} />
      <SalaryDialog open={salaryOpen} onOpenChange={setSalaryOpen} salary={salary} fy={fy} onSuccess={() => router.refresh()} />
      <ItrDialog open={itrOpen} onOpenChange={setItrOpen} doc={itrEditing} fy={fy} onSuccess={() => router.refresh()} />
    </div>
  );
}
