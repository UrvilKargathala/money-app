"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatINR } from "@/lib/format";

type Tag = { id: string; name: string; color: string | null };
type Category = { id: string; name: string };
type Transaction = { id: string; amount: string; tags: Tag[] };
type Split = { id: string; category_id: string; category_name: string | null; amount: number; notes: string | null };

export function TransactionToolsDialog({ open, onOpenChange, transaction, tags, categories }: { open: boolean; onOpenChange: (value: boolean) => void; transaction: Transaction | null; tags: Tag[]; categories: Category[] }) {
  const router = useRouter(); const [splits, setSplits] = useState<Split[]>([]); const [remaining, setRemaining] = useState(0); const [categoryId, setCategoryId] = useState(""); const [amount, setAmount] = useState(""); const [tagId, setTagId] = useState(""); const [tagName, setTagName] = useState(""); const [tagColor, setTagColor] = useState("#2563EB"); const [busy, setBusy] = useState(false);
  const loadSplits = async () => { if (!transaction) return; const res = await fetch(`/api/transactions/${transaction.id}/splits`, { cache: "no-store" }); const body = await res.json(); if (res.ok) { setSplits(body.splits ?? []); setRemaining(Number(body.remaining ?? 0)); } };
  useEffect(() => { if (open) void loadSplits(); }, [open, transaction?.id]);
  const run = async (url: string, options: RequestInit, message: string) => { setBusy(true); try { const res = await fetch(url, options); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0] || "Action failed."); toast.success(message); router.refresh(); await loadSplits(); } catch (error) { toast.error(error instanceof Error ? error.message : "Action failed."); } finally { setBusy(false); } };
  const addTag = () => transaction && tagId && void run(`/api/transactions/${transaction.id}/tags`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tag_id: tagId }) }, "Tag added");
  const removeTag = (id: string) => transaction && void run(`/api/transactions/${transaction.id}/tags/${id}`, { method: "DELETE" }, "Tag removed");
  const createTag = () => void run("/api/tags", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: tagName, color: tagColor }) }, "Tag created");
  const addSplit = () => transaction && void run(`/api/transactions/${transaction.id}/splits`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ category_id: categoryId, amount }) }, "Split added");
  const removeSplit = (id: string) => transaction && void run(`/api/transactions/${transaction.id}/splits/${id}`, { method: "DELETE" }, "Split removed");
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Organize transaction</DialogTitle></DialogHeader><Tabs defaultValue="tags"><TabsList className="grid w-full grid-cols-2"><TabsTrigger value="tags">Tags</TabsTrigger><TabsTrigger value="splits">Split amount</TabsTrigger></TabsList><TabsContent value="tags" className="space-y-4 pt-3"><div className="flex flex-wrap gap-2">{transaction?.tags.length ? transaction.tags.map((tag) => <Badge key={tag.id} style={{ borderColor: tag.color || undefined }} variant="outline" className="gap-1">{tag.name}<button onClick={() => removeTag(tag.id)} aria-label={`Remove ${tag.name}`}>×</button></Badge>) : <p className="text-sm text-neutral-500">No tags assigned.</p>}</div><div className="flex gap-2"><Select value={tagId} onValueChange={setTagId}><SelectTrigger><SelectValue placeholder="Choose tag" /></SelectTrigger><SelectContent>{tags.filter((tag) => !transaction?.tags.some((current) => current.id === tag.id)).map((tag) => <SelectItem key={tag.id} value={tag.id}>{tag.name}</SelectItem>)}</SelectContent></Select><Button onClick={addTag} disabled={!tagId || busy}>Add</Button></div><div className="border-t pt-4"><Label>Create a tag</Label><div className="mt-2 grid grid-cols-[1fr_48px_auto] gap-2"><Input value={tagName} onChange={(event) => setTagName(event.target.value)} placeholder="Business, reimbursable..." /><input type="color" value={tagColor} onChange={(event) => setTagColor(event.target.value)} className="h-10 w-12 rounded border p-1" /><Button variant="outline" onClick={createTag} disabled={!tagName.trim() || busy}><Plus className="h-4 w-4" /> Create</Button></div></div></TabsContent><TabsContent value="splits" className="space-y-4 pt-3"><div className="flex justify-between rounded-lg bg-neutral-50 p-3 text-sm"><span>Transaction {formatINR(Number(transaction?.amount ?? 0))}</span><span>Remaining {formatINR(remaining)}</span></div>{splits.map((split) => <div key={split.id} className="flex items-center justify-between rounded-lg border p-3"><div><p className="text-sm font-medium">{split.category_name || "Category"}</p><p className="text-xs text-neutral-500">{formatINR(split.amount)}</p></div><Button size="icon" variant="ghost" onClick={() => removeSplit(split.id)}><Trash2 className="h-4 w-4" /></Button></div>)}<div className="grid grid-cols-[1fr_130px_auto] gap-2"><Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select><Input type="number" min="0.01" max={remaining} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" /><Button onClick={addSplit} disabled={!categoryId || !amount || busy}>Add</Button></div></TabsContent></Tabs></DialogContent></Dialog>;
}
