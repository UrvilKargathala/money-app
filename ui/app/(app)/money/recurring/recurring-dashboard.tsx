"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Repeat, Play, SkipForward, Pencil, Trash2, Pause, CircleCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import { ConfirmDialog, useConfirm } from "@/components/common/confirm-dialog";
import { formatINR } from "@/lib/format";

type Option = { id: string; name: string };
type Template = { id: string; account_id: string | null; account_name: string | null; category_id: string | null; category_name: string | null; type: "income" | "expense"; amount: number; description: string | null; frequency: "daily" | "weekly" | "monthly" | "yearly"; interval_value: number; end_type: "never" | "count" | "date"; end_count: number | null; end_date: string | null; next_due_date: string; is_active: number; is_due: boolean; executed_count: number; version: number };

export function RecurringDashboard({ templates, accounts, categories }: { templates: Template[]; accounts: Option[]; categories: Option[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [frequency, setFrequency] = useState("monthly");
  const [endType, setEndType] = useState("never");
  const [busy, setBusy] = useState(false);

  const launch = (item?: Template) => {
    setEditing(item ?? null); setType(item?.type ?? "expense"); setAccountId(item?.account_id ?? ""); setCategoryId(item?.category_id ?? "none"); setFrequency(item?.frequency ?? "monthly"); setEndType(item?.end_type ?? "never"); setOpen(true);
  };
  const request = async (url: string, options: RequestInit, success: string) => {
    setBusy(true);
    try { const res = await fetch(url, options); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0] || "Action failed."); toast.success(success); router.refresh(); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : "Action failed."); return false; }
    finally { setBusy(false); }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const payload = { type, account_id: accountId || null, category_id: categoryId === "none" ? null : categoryId, amount: form.get("amount"), description: form.get("description"), frequency, interval_value: Number(form.get("interval_value") || 1), end_type: endType, end_count: endType === "count" ? Number(form.get("end_count")) : null, end_date: endType === "date" ? form.get("end_date") : null, next_due_date: form.get("next_due_date"), ...(editing ? { version: editing.version } : {}) };
    if (await request(editing ? `/api/recurring-transactions/${editing.id}` : "/api/recurring-transactions", { method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }, editing ? "Recurring transaction updated" : "Recurring transaction created")) setOpen(false);
  };
  const act = (item: Template, action: "execute" | "skip") => void request(`/api/recurring-transactions/${item.id}/${action}`, { method: "POST" }, action === "execute" ? "Transaction recorded" : "Occurrence skipped");
  const toggle = (item: Template) => void request(`/api/recurring-transactions/${item.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ is_active: item.is_active !== 1, version: item.version }) }, item.is_active ? "Schedule paused" : "Schedule resumed");
  const [confirmState, askConfirm, closeConfirm] = useConfirm();
  const remove = (item: Template) => {
    askConfirm({
      title: "Delete this recurring transaction?",
      description: "Future occurrences stop being generated. This cannot be undone.",
      onConfirm: () => { void request(`/api/recurring-transactions/${item.id}`, { method: "DELETE" }, "Recurring transaction deleted"); },
    });
  };

  return <><div className="space-y-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="text-3xl font-bold font-heading">Recurring transactions</h1><p className="mt-1 text-sm text-neutral-500">Automatically track repeating income and expenses.</p></div><Button onClick={() => launch()}><Plus className="h-4 w-4" /> Add recurring</Button></div>
    {templates.length === 0 ? <EmptyState icon={<Repeat className="h-6 w-6" />} title="No recurring transactions" description="Create a schedule for rent, salary, memberships, or any repeating payment." actionLabel="Add recurring" onAction={() => launch()} /> : <div className="grid gap-4 lg:grid-cols-2">{templates.map((item) => <Card key={item.id} className={item.is_active !== 1 ? "opacity-65" : item.is_due ? "border-warning" : ""}><CardContent className="space-y-4 p-5"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-neutral-900">{item.description || "Recurring transaction"}</h2><Badge variant={item.is_active !== 1 ? "default" : item.is_due ? "warning" : "success"}>{item.is_active !== 1 ? "Paused" : item.is_due ? "Due" : "Active"}</Badge></div><p className="mt-1 text-sm text-neutral-500">Every {item.interval_value > 1 ? `${item.interval_value} ` : ""}{item.frequency}{item.account_name ? ` · ${item.account_name}` : ""}</p></div><p className={item.type === "income" ? "font-semibold text-success-dark" : "font-semibold text-error-dark"}>{item.type === "income" ? "+" : "−"}{formatINR(item.amount)}</p></div><div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-sm"><span>Next: {new Date(`${item.next_due_date}T00:00:00`).toLocaleDateString("en-IN")}</span><span>{item.executed_count} recorded</span></div><div className="flex flex-wrap gap-2">{item.is_due && item.is_active === 1 ? <><Button size="sm" onClick={() => act(item, "execute")} disabled={busy}><Play className="h-3.5 w-3.5" /> Record now</Button><Button size="sm" variant="outline" onClick={() => act(item, "skip")} disabled={busy}><SkipForward className="h-3.5 w-3.5" /> Skip</Button></> : null}<Button size="sm" variant="outline" onClick={() => launch(item)}><Pencil className="h-3.5 w-3.5" /> Edit</Button><Button size="sm" variant="ghost" onClick={() => toggle(item)} disabled={busy}>{item.is_active ? <Pause className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}{item.is_active ? "Pause" : "Resume"}</Button><Button size="sm" variant="ghost" onClick={() => remove(item)} disabled={busy}><Trash2 className="h-3.5 w-3.5" /></Button></div></CardContent></Card>)}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} recurring transaction</DialogTitle></DialogHeader><form key={editing?.id ?? "new"} onSubmit={save} className="space-y-4"><div className="grid grid-cols-2 gap-2"><Button type="button" variant={type === "expense" ? "default" : "outline"} onClick={() => setType("expense")}>Expense</Button><Button type="button" variant={type === "income" ? "default" : "outline"} onClick={() => setType("income")}>Income</Button></div><div className="space-y-2"><Label>Description</Label><Input name="description" defaultValue={editing?.description ?? ""} placeholder="Rent, salary, allowance" /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Amount *</Label><Input name="amount" type="number" min="0.01" step="0.01" defaultValue={editing?.amount ?? ""} required /></div><div className="space-y-2"><Label>Next date *</Label><Input name="next_due_date" type="date" defaultValue={editing?.next_due_date ?? new Date().toISOString().slice(0, 10)} required /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Account</Label><Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No account</SelectItem>{accounts.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Category</Label><Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{categories.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div></div><div className="grid grid-cols-[1fr_100px] gap-4"><div className="space-y-2"><Label>Frequency</Label><Select value={frequency} onValueChange={setFrequency}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["daily","weekly","monthly","yearly"].map((value) => <SelectItem key={value} value={value} className="capitalize">{value}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Every</Label><Input name="interval_value" type="number" min="1" max="366" defaultValue={editing?.interval_value ?? 1} /></div></div><div className="space-y-2"><Label>Ends</Label><Select value={endType} onValueChange={setEndType}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="never">Never</SelectItem><SelectItem value="count">After occurrences</SelectItem><SelectItem value="date">On a date</SelectItem></SelectContent></Select></div>{endType === "count" ? <Input name="end_count" type="number" min="1" defaultValue={editing?.end_count ?? 12} /> : null}{endType === "date" ? <Input name="end_date" type="date" defaultValue={editing?.end_date ?? ""} required /> : null}<DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy}>{busy ? "Saving..." : "Save schedule"}</Button></DialogFooter></form></DialogContent></Dialog>
  </div><ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /></>;
}
