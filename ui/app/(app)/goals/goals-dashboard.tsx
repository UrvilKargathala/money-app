"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { GoalCard } from "./goal-card";
import { GoalFormDialog } from "./goal-form-dialog";
import { formatINR } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Target, Plus, Wallet, TrendingUp, History, Calendar, Flag, BarChart3, Layers, ArrowUpDown, PiggyBank, Edit, Trash2, Download } from "lucide-react";
import { deleteGoalAction, pauseGoalAction, resumeGoalAction, completeGoalAction, addContribution, updateContribution, deleteContributionAction, addContributionWithTransfer, createSnapshot, createTemplate, updateTemplate, deleteTemplateAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

type Goal = {
  id: string;
  name: string;
  target_amount: number;
  target_date: string;
  priority: string;
  status: string;
  current_amount: number;
  progress_pct: number;
  version: number;
  account_id: string | null;
  notes: string | null;
};

type Dashboard = { goal_count: number; total_target: number; total_saved: number; completion_pct: number };

type Template = {
  id: string;
  user_id: number | null;
  name: string;
  description: string | null;
  default_target_amount: number | null;
  default_timeframe_months: number | null;
  icon: string | null;
  is_system: number;
  version: number;
};

type Contribution = { id: string; goal_id: string; amount: number; date: string; transaction_id: string | null; notes: string | null };
type Snapshot = { date: string; current_amount: number };
type Milestone = { milestone_pct: number; reached_date: string; notified_at: string | null };
type Feasibility = { goal_id: string; status: string; required_monthly: number; avg_monthly: number; projected_date: string | null };
type Projection = { goal_id: string; target_date: string; target_amount: number; current_amount: number; avg_monthly: number; months_to_finish: number | null; projected_date: string | null };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function feasibilityColor(status: string) {
  if (status === "on_track") return "success";
  if (status === "behind") return "warning";
  return "error";
}
function feasibilityLabel(status: string) {
  if (status === "on_track") return "On track";
  if (status === "behind") return "Behind";
  return "Critical";
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

function MilestonesDisplay({ milestones, progressPct }: { milestones: Milestone[]; progressPct: number }) {
  const all = [25, 50, 75, 100];
  const reached = new Set(milestones.map((m) => m.milestone_pct));
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium font-heading">Milestones • {milestones.length} / 4 reached</p>
      <div className="grid grid-cols-4 gap-2">
        {all.map((pct) => {
          const m = milestones.find((x) => x.milestone_pct === pct);
          const isReached = reached.has(pct);
          return (
            <div key={pct} className={`rounded-lg border p-3 text-center ${isReached ? "border-success/30 bg-success-light/50" : "border-neutral-100 bg-neutral-50"}`}>
              <p className={`text-lg font-bold font-heading ${isReached ? "text-success-dark" : "text-neutral-400"}`}>{pct}%</p>
              <p className="text-xs text-neutral-500">{isReached ? m?.reached_date ?? "—" : `${pct > progressPct ? `${(pct - progressPct).toFixed(0)}% to go` : "pending"}`}</p>
              {isReached && <Badge variant="success" className="mt-1 text-[10px]">reached</Badge>}
            </div>
          );
        })}
      </div>
      <Progress value={Math.min(100, progressPct)} indicatorClassName={progressPct >= 100 ? "bg-success" : progressPct >= 50 ? "bg-primary-600" : "bg-warning"} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Snapshots timeline
// ---------------------------------------------------------------------------

function SnapshotsTimeline({ snapshots, onCreate }: { snapshots: Snapshot[]; onCreate: (date: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [pending, setPending] = useState(false);
  const handleCreate = async () => {
    setPending(true);
    try {
      await onCreate(date);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-end">
        <div className="space-y-1 flex-1">
          <Label>Snapshot date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={handleCreate} disabled={pending}>{pending ? "..." : "Record snapshot"}</Button>
      </div>
      {snapshots.length === 0 ? (
        <p className="text-sm text-neutral-500 py-4 text-center">No snapshots yet. Contributions automatically create snapshots.</p>
      ) : (
        <div className="relative border-l border-neutral-200 ml-4 space-y-4">
          {snapshots.map((s) => (
            <div key={s.date} className="relative pl-6">
              <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-primary-600" />
              <p className="text-sm font-medium font-heading">{s.date}</p>
              <p className="text-sm text-neutral-600">{formatINR(s.current_amount)}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Projection / Feasibility
// ---------------------------------------------------------------------------

function ProjectionFeasibility({ feasibility, projection }: { feasibility: Feasibility | null; projection: Projection | null }) {
  if (!feasibility && !projection) return <p className="text-sm text-neutral-500">No data.</p>;
  return (
    <div className="space-y-4">
      {feasibility && (
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium font-heading">Feasibility</p>
              <p className="text-xs text-neutral-500">Required {formatINR(feasibility.required_monthly)}/mo • Avg {formatINR(feasibility.avg_monthly)}/mo</p>
            </div>
            <Badge variant={feasibilityColor(feasibility.status) as never}>{feasibilityLabel(feasibility.status)}</Badge>
          </div>
          <p className="text-xs text-neutral-400 mt-2">Projected {feasibility.projected_date ?? "—"} • Target {projection?.target_date ?? "—"}</p>
        </Card>
      )}
      {projection && (
        <Card className="p-4">
          <p className="text-sm font-medium font-heading">Projection</p>
          <div className="grid grid-cols-2 gap-3 mt-2 text-sm">
            <div><p className="text-xs text-neutral-500">Target</p><p className="font-semibold">{formatINR(projection.target_amount)}</p></div>
            <div><p className="text-xs text-neutral-500">Saved</p><p className="font-semibold">{formatINR(projection.current_amount)}</p></div>
            <div><p className="text-xs text-neutral-500">Avg monthly</p><p className="font-semibold">{formatINR(projection.avg_monthly)}</p></div>
            <div><p className="text-xs text-neutral-500">Months to finish</p><p className="font-semibold">{projection.months_to_finish ?? "—"}</p></div>
          </div>
          <p className="text-xs text-neutral-400 mt-2">Projected completion {projection.projected_date ?? "—"}</p>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Contributions Dialog
// ---------------------------------------------------------------------------

function ContributionsDialog({ goal, accounts, open, onOpenChange }: { goal: Goal | null; accounts: { id: string; name: string }[]; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("history");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [editing, setEditing] = useState<Contribution | null>(null);
  const [withTransfer, setWithTransfer] = useState(false);
  const [fromAccount, setFromAccount] = useState("");
  const [toAccount, setToAccount] = useState("");

  const load = async () => {
    if (!goal) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/goals/${goal.id}/contributions`);
      const data = await res.json();
      setContributions((data.contributions ?? []).map((c: { amount: string | number }) => ({ ...c, amount: Number((c as { amount: string | number }).amount) })));
    } catch {
      toast.error("Could not load contributions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      load();
      setActiveTab("history");
      setEditing(null);
      setAmount("");
      setNotes("");
      setDate(new Date().toISOString().slice(0, 10));
      setWithTransfer(false);
    }
  }, [open, goal]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal) return;
    if (withTransfer) {
      const fd = new FormData();
      fd.set("goalId", goal.id);
      fd.set("from_account_id", fromAccount);
      fd.set("to_account_id", toAccount);
      fd.set("amount", amount);
      fd.set("date", date);
      if (notes) fd.set("notes", notes);
      const res = await addContributionWithTransfer(null as never, fd);
      if (res?.error) toast.error(res.error);
      else if (res?.fieldErrors) toast.error(Object.values(res.fieldErrors).join(", "));
      else {
        toast.success("Contribution with transfer recorded");
        setAmount(""); setNotes("");
        load(); router.refresh();
      }
    } else {
      const fd = new FormData();
      fd.set("goalId", goal.id);
      fd.set("amount", amount);
      fd.set("date", date);
      if (notes) fd.set("notes", notes);
      const res = await addContribution(null as never, fd);
      if (res?.error) toast.error(res.error);
      else if (res?.fieldErrors) toast.error(Object.values(res.fieldErrors).join(", "));
      else {
        toast.success("Contribution added");
        setAmount(""); setNotes("");
        load(); router.refresh();
      }
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal || !editing) return;
    const fd = new FormData();
    fd.set("goalId", goal.id);
    fd.set("contributionId", editing.id);
    fd.set("amount", amount);
    fd.set("date", date);
    fd.set("notes", notes);
    const res = await updateContribution(null as never, fd);
    if (res?.error) toast.error(res.error);
    else if (res?.fieldErrors) toast.error(Object.values(res.fieldErrors).join(", "));
    else {
      toast.success("Contribution updated");
      setEditing(null); setAmount(""); setNotes(""); setActiveTab("history"); load(); router.refresh();
    }
  };

  const handleDelete = async (id: string) => {
    if (!goal) return;
    if (!confirm("Delete contribution?")) return;
    const res = await deleteContributionAction(goal.id, id);
    if (res?.error) toast.error(res.error);
    else { toast.success("Deleted"); load(); router.refresh(); }
  };

  const startEdit = (c: Contribution) => {
    setEditing(c);
    setAmount(String(c.amount));
    setDate(c.date);
    setNotes(c.notes ?? "");
    setActiveTab("add");
  };

  if (!goal) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Contributions — {goal.name}</DialogTitle>
          <DialogDescription>{contributions.length} contributions • {formatINR(goal.current_amount)} saved of {formatINR(goal.target_amount)}</DialogDescription>
        </DialogHeader>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="history" className="flex-1"><History className="h-4 w-4" /> History</TabsTrigger>
            <TabsTrigger value="add" className="flex-1">{editing ? "Edit" : "Add"} Contribution</TabsTrigger>
          </TabsList>
          <TabsContent value="history" className="space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-xs text-neutral-500">{contributions.length} records</p>
              <Button variant="outline" size="sm" asChild><a href={`/api/goals/${goal.id}/contributions/export`} download><Download className="h-3 w-3" /> Export CSV</a></Button>
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-neutral-50 text-xs text-neutral-500">
                  <tr><th className="p-2 text-left">Date</th><th className="p-2 text-right">Amount</th><th className="p-2 text-left">Notes</th><th className="p-2 text-center">Actions</th></tr>
                </thead>
                <tbody>
                  {loading ? <tr><td colSpan={4} className="p-4 text-center text-neutral-400">Loading...</td></tr> : contributions.length === 0 ? <tr><td colSpan={4} className="p-4 text-center text-neutral-400">No contributions yet</td></tr> : contributions.map((c) => (
                    <tr key={c.id} className="border-t text-xs">
                      <td className="p-2">{c.date}</td>
                      <td className="p-2 text-right font-medium">{formatINR(c.amount)}</td>
                      <td className="p-2 max-w-[20ch] truncate">{c.notes ?? "—"}</td>
                      <td className="p-2 flex gap-1 justify-center">
                        <Button variant="ghost" size="sm" onClick={() => startEdit(c)}><Edit className="h-3 w-3" /> Edit</Button>
                        <Button variant="ghost" size="sm" className="text-error" onClick={() => handleDelete(c.id)}><Trash2 className="h-3 w-3" /> Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="add">
            <form onSubmit={editing ? handleUpdate : handleAdd} className="space-y-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="with-transfer" checked={withTransfer} onChange={(e) => setWithTransfer(e.target.checked)} className="rounded" />
                <Label htmlFor="with-transfer">With transfer (move money between accounts)</Label>
              </div>
              {withTransfer && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>From account</Label>
                    <Select value={fromAccount} onValueChange={setFromAccount}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>To account</Label>
                    <Select value={toAccount} onValueChange={setToAccount}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="5000" required />
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" required />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
              </div>
              <div className="flex gap-2">
                <Button type="submit">{editing ? "Update" : withTransfer ? "Transfer & Contribute" : "Add Contribution"}</Button>
                {editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setAmount(""); setNotes(""); setActiveTab("history"); }}>Cancel</Button>}
              </div>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Goal Detail Dialog (snapshots, milestones, feasibility/projection)
// ---------------------------------------------------------------------------

function GoalDetailDialog({ goal, open, onOpenChange }: { goal: Goal | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [feasibility, setFeasibility] = useState<Feasibility | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [progress, setProgress] = useState<{ progress_pct: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !goal) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/goals/${goal.id}/snapshots`).then((r) => r.json()).catch(() => ({ snapshots: [] })),
      fetch(`/api/goals/${goal.id}/milestones`).then((r) => r.json()).catch(() => ({ milestones: [] })),
      fetch(`/api/goals/${goal.id}/feasibility`).then((r) => r.json()).catch(() => null),
      fetch(`/api/goals/${goal.id}/projection`).then((r) => r.json()).catch(() => null),
      fetch(`/api/goals/${goal.id}/progress`).then((r) => r.json()).catch(() => null),
    ])
      .then(([snap, mile, feas, proj, prog]) => {
        setSnapshots((snap.snapshots ?? []).map((s: { current_amount: string | number }) => ({ ...s, current_amount: Number((s as { current_amount: string | number }).current_amount) })));
        setMilestones(mile.milestones ?? []);
        setFeasibility(feas);
        setProjection(proj);
        setProgress(prog ? { progress_pct: prog.progress_pct } : null);
      })
      .finally(() => setLoading(false));
  }, [open, goal]);

  const handleCreateSnapshot = async (date: string) => {
    if (!goal) return;
    const fd = new FormData();
    fd.set("goalId", goal.id);
    fd.set("date", date);
    const res = await createSnapshot(null as never, fd);
    if (res?.error) toast.error(res.error);
    else if (res?.fieldErrors?.date) toast.error(res.fieldErrors.date);
    else {
      toast.success("Snapshot recorded");
      const r = await fetch(`/api/goals/${goal.id}/snapshots`).then((x) => x.json());
      setSnapshots((r.snapshots ?? []).map((s: { current_amount: string | number }) => ({ ...s, current_amount: Number((s as { current_amount: string | number }).current_amount) })));
      router.refresh();
    }
  };

  if (!goal) return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal.name} — Details</DialogTitle>
          <DialogDescription>{formatINR(goal.current_amount)} / {formatINR(goal.target_amount)} • {goal.progress_pct.toFixed(1)}% • Due {new Date(goal.target_date).toLocaleDateString("en-IN")}</DialogDescription>
        </DialogHeader>
        {loading ? <p className="text-sm text-neutral-400 py-8 text-center">Loading...</p> : (
          <Tabs defaultValue="overview">
            <TabsList className="w-full">
              <TabsTrigger value="overview" className="flex-1">Overview</TabsTrigger>
              <TabsTrigger value="milestones" className="flex-1">Milestones</TabsTrigger>
              <TabsTrigger value="snapshots" className="flex-1">Snapshots</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="mt-4">
              <ProjectionFeasibility feasibility={feasibility} projection={projection} />
            </TabsContent>
            <TabsContent value="milestones" className="mt-4">
              <MilestonesDisplay milestones={milestones} progressPct={progress?.progress_pct ?? goal.progress_pct} />
            </TabsContent>
            <TabsContent value="snapshots" className="mt-4">
              <SnapshotsTimeline snapshots={snapshots} onCreate={handleCreateSnapshot} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Templates section
// ---------------------------------------------------------------------------

function TemplatesSection({ templates, accounts }: { templates: Template[]; accounts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [months, setMonths] = useState("");
  const [icon, setIcon] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  // We'll use GoalFormDialog when applying
  const [draftTemplate, setDraftTemplate] = useState<Template | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setName(editing.name);
        setDescription(editing.description ?? "");
        setAmount(editing.default_target_amount != null ? String(editing.default_target_amount) : "");
        setMonths(editing.default_timeframe_months != null ? String(editing.default_timeframe_months) : "");
        setIcon(editing.icon ?? "");
      } else {
        setName(""); setDescription(""); setAmount(""); setMonths(""); setIcon("");
      }
    }
  }, [open, editing]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    if (editing) {
      fd.set("id", editing.id);
      fd.set("name", name);
      fd.set("description", description);
      fd.set("default_target_amount", amount);
      fd.set("default_timeframe_months", months);
      fd.set("icon", icon);
      fd.set("version", String(editing.version));
      const res = await updateTemplate(null as never, fd);
      if (res?.error) toast.error(res.error);
      else if (res?.fieldErrors) toast.error(Object.values(res.fieldErrors).join(", "));
      else { toast.success("Template updated"); setOpen(false); router.refresh(); }
    } else {
      fd.set("name", name);
      fd.set("description", description);
      fd.set("default_target_amount", amount);
      fd.set("default_timeframe_months", months);
      fd.set("icon", icon);
      const res = await createTemplate(null as never, fd);
      if (res?.error) toast.error(res.error);
      else if (res?.fieldErrors) toast.error(Object.values(res.fieldErrors).join(", "));
      else { toast.success("Template created"); setOpen(false); router.refresh(); }
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete template?")) return;
    const res = await deleteTemplateAction(id);
    if (res?.error) toast.error(res.error);
    else { toast.success("Deleted"); router.refresh(); }
  };

  const handleApply = (t: Template) => {
    setDraftTemplate(t);
    setFormOpen(true);
  };

  // Prepare initial values for GoalFormDialog when applying template
  const applyGoal = draftTemplate ? {
    id: "",
    name: draftTemplate.name,
    target_amount: draftTemplate.default_target_amount ?? 0,
    target_date: (() => {
      const d = new Date();
      const m = draftTemplate.default_timeframe_months ?? 12;
      d.setMonth(d.getMonth() + m);
      return d.toISOString().slice(0,10);
    })(),
    priority: "medium",
    notes: draftTemplate.description,
    version: 1,
    account_id: null,
  } as unknown as Goal : null;

  return (
    <>
      <Card className="p-6">
        <CardHeader className="p-0 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Layers className="h-5 w-5" /> Templates</CardTitle>
              <CardDescription>{templates.length} templates • system + custom • apply to prefill goal</CardDescription>
            </div>
            <Button size="sm" onClick={() => { setEditing(null); setOpen(true); }}><Plus className="h-4 w-4" /> New Template</Button>
          </div>
        </CardHeader>
        {templates.length === 0 ? (
          <p className="text-sm text-neutral-500">No templates. Create one or use system templates.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="rounded-lg border border-neutral-100 p-4 space-y-2 bg-white">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold font-heading">{t.icon ? `${t.icon} ` : ""}{t.name}</p>
                    <p className="text-xs text-neutral-500">{t.description ?? "—"}</p>
                  </div>
                  <Badge variant={t.is_system ? "info" : "secondary"}>{t.is_system ? "system" : "custom"}</Badge>
                </div>
                <p className="text-xs text-neutral-600">
                  {t.default_target_amount != null ? formatINR(t.default_target_amount) : "No amount"} • {t.default_timeframe_months != null ? `${t.default_timeframe_months} months` : "no timeframe"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleApply(t)}><Flag className="h-3 w-3" /> Apply</Button>
                  {!t.is_system && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>Edit</Button>
                      <Button size="sm" variant="ghost" className="text-error" onClick={() => handleDelete(t.id)}>Delete</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit template" : "New template"}</DialogTitle>
            <DialogDescription>Templates prefill goals. System templates cannot be edited.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Emergency Fund" required />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="6 months expenses" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default target</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" step="0.01" placeholder="100000" />
              </div>
              <div className="space-y-2">
                <Label>Timeframe (months)</Label>
                <Input value={months} onChange={(e) => setMonths(e.target.value)} type="number" placeholder="12" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Icon</Label>
              <Input value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="shield / flag" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* When applying template, reuse GoalFormDialog with prefilled goal */}
      {draftTemplate && (
        <GoalFormDialog
          open={formOpen}
          onOpenChange={(v) => { setFormOpen(v); if (!v) setDraftTemplate(null); }}
          goal={applyGoal as never}
          accounts={accounts}
          onSuccess={() => { router.refresh(); setDraftTemplate(null); }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Distribute windfall
// ---------------------------------------------------------------------------

function DistributeCard({ goals }: { goals: Goal[] }) {
  const [amount, setAmount] = useState("10000");
  const [suggestions, setSuggestions] = useState<{ goal_id: string; name: string; remaining: number; amount: number }[]>([]);
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    if (!amount || Number(amount) <= 0) { toast.error("Enter amount > 0"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/goals/distribute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amount }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.fieldErrors?.amount || "Failed");
      setSuggestions(data.suggestions ?? []);
    } catch (e) { toast.error(String(e)); }
    finally { setLoading(false); }
  };

  return (
    <Card className="p-6">
      <CardHeader className="p-0 mb-3">
        <CardTitle className="flex items-center gap-2 text-base"><ArrowUpDown className="h-5 w-5" /> Distribute windfall</CardTitle>
        <CardDescription>Proportional split across active goals by remaining amount. All from API.</CardDescription>
      </CardHeader>
      <div className="flex gap-2 items-end">
        <div className="space-y-1">
          <Label>Amount (INR)</Label>
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" className="w-40" placeholder="10000" />
        </div>
        <Button onClick={handle} disabled={loading}><PiggyBank className="h-4 w-4" /> {loading ? "..." : "Suggest"}</Button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-4 space-y-2">
          {suggestions.map((s) => (
            <div key={s.goal_id} className="flex justify-between items-center rounded-lg bg-neutral-50 p-3">
              <div>
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-neutral-500">Remaining {formatINR(s.remaining)}</p>
              </div>
              <p className="text-sm font-bold">{formatINR(s.amount)}</p>
            </div>
          ))}
          <p className="text-xs text-neutral-400">Total {formatINR(suggestions.reduce((a,b)=>a+b.amount,0))} across {suggestions.length} goals</p>
        </div>
      )}
      {goals.filter((g)=>g.status==='active').length===0 && <p className="text-sm text-neutral-500 mt-2">No active goals to distribute to.</p>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main Dashboard
// ---------------------------------------------------------------------------

export function GoalsDashboard({ goals, dashboard, accounts, templates }: { goals: Goal[]; dashboard: Dashboard | null; accounts: { id: string; name: string }[]; templates?: Template[] }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const [detailGoal, setDetailGoal] = useState<Goal | null>(null);
  const [contribGoal, setContribGoal] = useState<Goal | null>(null);

  const filtered = goals.filter((g) => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return g.status === "active";
    if (activeTab === "paused") return g.status === "paused";
    if (activeTab === "completed") return g.status === "completed";
    return true;
  });

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this goal?")) return;
    const res = await deleteGoalAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Goal deleted");
      router.refresh();
    }
  };
  const handlePause = async (id: string) => {
    const res = await pauseGoalAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Goal paused");
      router.refresh();
    }
  };
  const handleResume = async (id: string) => {
    const res = await resumeGoalAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Goal resumed");
      router.refresh();
    }
  };
  const handleComplete = async (id: string) => {
    const res = await completeGoalAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Goal completed");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Goals</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">{dashboard ? `${dashboard.goal_count} goals • ${dashboard.completion_pct.toFixed(1)}% overall` : "Track your savings goals"}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><a href="/api/goals/export" download><Download className="h-4 w-4" /> Export CSV</a></Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Add Goal
          </Button>
        </div>
      </div>

      {dashboard && (
        <div className="grid gap-6 md:grid-cols-3">
          <StatCard label="Total Target" value={formatINR(dashboard.total_target)} icon={<Target className="h-5 w-5" />} />
          <StatCard label="Total Saved" value={formatINR(dashboard.total_saved)} subtext={`${dashboard.completion_pct.toFixed(1)}%`} icon={<Wallet className="h-5 w-5" />} />
          <StatCard label="Remaining" value={formatINR(dashboard.total_target - dashboard.total_saved)} icon={<TrendingUp className="h-5 w-5" />} />
        </div>
      )}

      <DistributeCard goals={goals} />

      {templates && <TemplatesSection templates={templates} accounts={accounts} />}

      <Card className="p-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="paused">Paused</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Target className="h-6 w-6" />}
          title="No goals"
          description="Create a goal to track your savings progress."
          actionLabel="Add Goal"
          onAction={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => (
            <div key={g.id} className="space-y-2">
              <GoalCard
                goal={g}
                onEdit={() => {
                  setEditing(g);
                  setFormOpen(true);
                }}
                onDelete={() => handleDelete(g.id)}
                onPause={() => handlePause(g.id)}
                onResume={() => handleResume(g.id)}
                onComplete={() => handleComplete(g.id)}
              />
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => setContribGoal(g)}><PiggyBank className="h-3 w-3" /> Contribute</Button>
                <Button variant="outline" size="sm" onClick={() => setDetailGoal(g)}><BarChart3 className="h-3 w-3" /> Details</Button>
                <Button variant="outline" size="sm" onClick={() => setDetailGoal(g)}><Calendar className="h-3 w-3" /> Timeline</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GoalFormDialog open={formOpen} onOpenChange={setFormOpen} goal={editing} accounts={accounts} onSuccess={() => router.refresh()} />
      <ContributionsDialog goal={contribGoal} accounts={accounts} open={!!contribGoal} onOpenChange={(v) => !v && setContribGoal(null)} />
      <GoalDetailDialog goal={detailGoal} open={!!detailGoal} onOpenChange={(v) => !v && setDetailGoal(null)} />
    </div>
  );
}
