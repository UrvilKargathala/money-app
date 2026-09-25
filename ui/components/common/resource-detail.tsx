import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const HIDDEN_KEYS = new Set(["id", "user_id", "version", "created_at", "updated_at"]);
const MONEY_KEYS = /(amount|balance|price|principal|value|cost|emi|limit|income|expense|interest_earned)/i;
const DATE_KEYS = /(^date$|_date$|_at$)/i;

function labelFor(key: string) {
  return key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayValue(key: string, value: unknown) {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean" || key.startsWith("is_")) return Number(value) === 1 || value === true ? "Yes" : "No";
  if (MONEY_KEYS.test(key) && !key.includes("rate") && !key.includes("pct")) {
    const amount = Number(value);
    if (Number.isFinite(amount)) return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
  }
  if (DATE_KEYS.test(key) && typeof value === "string") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toLocaleString("en-IN", { dateStyle: "medium", ...(key.endsWith("_at") ? { timeStyle: "short" } : {}) });
  }
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "None";
  if (typeof value === "object") return "Available in the related activity section";
  return String(value).replaceAll("_", " ");
}

export function ResourceDetail({ title, subtitle, backHref, record, related }: { title: string; subtitle: string; backHref: string; record: Record<string, unknown>; related?: { title: string; items: Record<string, unknown>[] }[] }) {
  const fields = Object.entries(record).filter(([key, value]) => !HIDDEN_KEYS.has(key) && !key.endsWith("_id") && typeof value !== "object");
  const status = typeof record.status === "string" ? record.status : null;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Button variant="ghost" asChild className="-ml-3"><Link href={backHref}><ArrowLeft className="h-4 w-4" /> Back to {subtitle}</Link></Button>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-sm font-medium text-primary-600">{subtitle}</p><h1 className="text-3xl font-bold font-heading text-neutral-900">{title}</h1></div>
        {status ? <Badge variant={status === "active" || status === "paid" || status === "completed" ? "success" : "secondary"}>{status.replaceAll("_", " ")}</Badge> : null}
      </div>
      <Card className="p-6">
        <h2 className="mb-5 text-lg font-semibold">Details</h2>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">{labelFor(key)}</dt><dd className="mt-1 break-words text-sm font-medium text-neutral-900">{displayValue(key, value)}</dd></div>)}
        </dl>
      </Card>
      {related?.map((section) => section.items.length ? <Card key={section.title} className="p-6"><h2 className="mb-4 text-lg font-semibold">{section.title}</h2><div className="space-y-3">{section.items.map((item, index) => <div key={String(item.id ?? index)} className="grid gap-2 rounded-xl border p-4 sm:grid-cols-3">{Object.entries(item).filter(([key, value]) => !HIDDEN_KEYS.has(key) && typeof value !== "object").slice(0, 6).map(([key, value]) => <div key={key}><p className="text-xs text-neutral-500">{labelFor(key)}</p><p className="text-sm font-medium">{displayValue(key, value)}</p></div>)}</div>)}</div></Card> : null)}
    </div>
  );
}
