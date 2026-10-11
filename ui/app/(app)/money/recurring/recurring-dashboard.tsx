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
import { PageHeader } from "@/components/common/page-header";
import dynamic from "next/dynamic";
import { useConfirm } from "@/components/common/confirm-dialog";

// ConfirmDialog mounts only when opened (ssr:false code-split).
const ConfirmDialog = dynamic(() => import("@/components/common/confirm-dialog").then((m) => m.ConfirmDialog), {
  ssr: false,
});
import { formatINR, todayLocalISO } from "@/lib/format";

type Option = { id: string; name: string };
type Template = {
  id: string;
  account_id: string | null;
  account_name: string | null;
  category_id: string | null;
  category_name: string | null;
  type: "income" | "expense";
  amount: number;
  description: string | null;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval_value: number;
  end_type: "never" | "count" | "date";
  end_count: number | null;
  end_date: string | null;
  next_due_date: string;
  is_active: number;
  is_due: boolean;
  executed_count: number;
  version: number;
};

export function RecurringDashboard({
  templates,
  accounts,
  categories,
}: {
  templates: Template[];
  accounts: Option[];
  categories: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("none");
  const [frequency, setFrequency] = useState("monthly");
  const [endType, setEndType] = useState("never");
  const [busy, setBusy] = useState(false);

  const launch = (template?: Template) => {
    setEditing(template ?? null);
    setType(template?.type ?? "expense");
    setAccountId(template?.account_id ?? "");
    setCategoryId(template?.category_id ?? "none");
    setFrequency(template?.frequency ?? "monthly");
    setEndType(template?.end_type ?? "never");
    setOpen(true);
  };
  const request = async (url: string, options: RequestInit, success: string) => {
    setBusy(true);
    try {
      const res = await fetch(url, options);
      const responseBody = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(responseBody.error || Object.values(responseBody.fieldErrors || {})[0] || "Action failed.");
      toast.success(success);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      type,
      account_id: accountId || null,
      category_id: categoryId === "none" ? null : categoryId,
      amount: form.get("amount"),
      description: form.get("description"),
      frequency,
      interval_value: Number(form.get("interval_value") || 1),
      end_type: endType,
      end_count: endType === "count" ? Number(form.get("end_count")) : null,
      end_date: endType === "date" ? form.get("end_date") : null,
      next_due_date: form.get("next_due_date"),
      ...(editing ? { version: editing.version } : {}),
    };
    if (
      await request(
        editing ? `/api/recurring-transactions/${editing.id}` : "/api/recurring-transactions",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
        editing ? "Recurring transaction updated" : "Recurring transaction created"
      )
    )
      setOpen(false);
  };
  const act = (template: Template, action: "execute" | "skip") =>
    void request(
      `/api/recurring-transactions/${template.id}/${action}`,
      { method: "POST" },
      action === "execute" ? "Transaction recorded" : "Occurrence skipped"
    );
  const toggle = (template: Template) =>
    void request(
      `/api/recurring-transactions/${template.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ is_active: template.is_active !== 1, version: template.version }),
      },
      template.is_active ? "Schedule paused" : "Schedule resumed"
    );
  const [confirmState, askConfirm, closeConfirm] = useConfirm();
  const remove = (template: Template) => {
    askConfirm({
      title: "Delete this recurring transaction?",
      description: "Future occurrences stop being generated. This cannot be undone.",
      onConfirm: () => {
        void request(`/api/recurring-transactions/${template.id}`, { method: "DELETE" }, "Recurring transaction deleted");
      },
    });
  };

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Recurring transactions"
          description="Automatically track repeating income and expenses."
          actions={
            <Button onClick={() => launch()}>
              <Plus className="h-4 w-4" /> Add recurring
            </Button>
          }
        />
        {templates.length === 0 ? (
          <EmptyState
            icon={<Repeat className="h-6 w-6" />}
            title="No recurring transactions"
            description="Create a schedule for rent, salary, memberships, or any repeating payment."
            actionLabel="Add recurring"
            onAction={() => launch()}
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {templates.map((template) => (
              <Card key={template.id} className={template.is_active !== 1 ? "opacity-65" : template.is_due ? "border-warning" : ""}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-foreground">{template.description || "Recurring transaction"}</h2>
                        <Badge variant={template.is_active !== 1 ? "default" : template.is_due ? "warning" : "success"}>
                          {template.is_active !== 1 ? "Paused" : template.is_due ? "Due" : "Active"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-faint">
                        Every {template.interval_value > 1 ? `${template.interval_value} ` : ""}
                        {template.frequency}
                        {template.account_name ? ` · ${template.account_name}` : ""}
                      </p>
                    </div>
                    <p
                      className={
                        template.type === "income" ? "font-semibold text-success-dark" : "font-semibold text-error-dark"
                      }
                    >
                      {template.type === "income" ? "+" : "−"}
                      {formatINR(template.amount)}
                    </p>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-deep px-3 py-2 text-sm">
                    <span>Next: {new Date(`${template.next_due_date}T00:00:00`).toLocaleDateString("en-IN")}</span>
                    <span>{template.executed_count} recorded</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {template.is_due && template.is_active === 1 ? (
                      <>
                        <Button size="sm" onClick={() => act(template, "execute")} disabled={busy}>
                          <Play className="h-3.5 w-3.5" /> Record now
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => act(template, "skip")} disabled={busy}>
                          <SkipForward className="h-3.5 w-3.5" /> Skip
                        </Button>
                      </>
                    ) : null}
                    <Button size="sm" variant="outline" onClick={() => launch(template)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(template)} disabled={busy}>
                      {template.is_active ? <Pause className="h-3.5 w-3.5" /> : <CircleCheck className="h-3.5 w-3.5" />}
                      {template.is_active ? "Pause" : "Resume"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(template)} disabled={busy}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit" : "Add"} recurring transaction</DialogTitle>
            </DialogHeader>
            <form key={editing?.id ?? "new"} onSubmit={save} className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={type === "expense" ? "default" : "outline"}
                  onClick={() => setType("expense")}
                >
                  Expense
                </Button>
                <Button
                  type="button"
                  variant={type === "income" ? "default" : "outline"}
                  onClick={() => setType("income")}
                >
                  Income
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  name="description"
                  defaultValue={editing?.description ?? ""}
                  placeholder="Rent, salary, allowance"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Amount *</Label>
                  <Input
                    name="amount"
                    type="number"
                    min="0.01"
                    step="0.01"
                    defaultValue={editing?.amount ?? ""}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Next date *</Label>
                  <Input
                    name="next_due_date"
                    type="date"
                    defaultValue={editing?.next_due_date ?? todayLocalISO()}
                    required
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Account</Label>
                  <Select value={accountId || "none"} onValueChange={(v) => setAccountId(v === "none" ? "" : v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No account</SelectItem>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No category</SelectItem>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-[1fr_100px] gap-4">
                <div className="space-y-2">
                  <Label>Frequency</Label>
                  <Select value={frequency} onValueChange={setFrequency}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["daily", "weekly", "monthly", "yearly"].map((value) => (
                        <SelectItem key={value} value={value} className="capitalize">
                          {value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Every</Label>
                  <Input
                    name="interval_value"
                    type="number"
                    min="1"
                    max="366"
                    defaultValue={editing?.interval_value ?? 1}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Ends</Label>
                <Select value={endType} onValueChange={setEndType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="never">Never</SelectItem>
                    <SelectItem value="count">After occurrences</SelectItem>
                    <SelectItem value="date">On a date</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {endType === "count" ? (
                <Input name="end_count" type="number" min="1" defaultValue={editing?.end_count ?? 12} />
              ) : null}
              {endType === "date" ? (
                <Input name="end_date" type="date" defaultValue={editing?.end_date ?? ""} required />
              ) : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button disabled={busy}>{busy ? "Saving..." : "Save schedule"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {confirmState ? <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} /> : null}
    </>
  );
}
