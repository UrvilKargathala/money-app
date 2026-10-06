"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Mapping = { id: string; merchant_raw: string; merchant_clean: string | null; category_name: string | null; use_count: number };
export function MerchantRulesDialog({ open, onOpenChange, mappings, categories }: { open: boolean; onOpenChange: (value: boolean) => void; mappings: Mapping[]; categories: { id: string; name: string }[] }) {
  const router = useRouter(); const [raw, setRaw] = useState(""); const [clean, setClean] = useState(""); const [categoryId, setCategoryId] = useState("none"); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); try { const res = await fetch("/api/merchant-mappings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ merchant_raw: raw, merchant_clean: clean || null, category_id: categoryId === "none" ? null : categoryId }) }); const body = await res.json().catch(() => ({})); if (!res.ok) throw new Error(body.error || Object.values(body.fieldErrors || {})[0]); toast.success("Merchant rule saved"); setRaw(""); setClean(""); router.refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save rule."); } finally { setBusy(false); } };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Merchant rules</DialogTitle></DialogHeader><p className="text-sm text-ink-3">Automatically clean statement descriptions and apply a category during future imports.</p><div className="grid gap-3"><div><Label>Statement text *</Label><Input value={raw} onChange={(event) => setRaw(event.target.value)} placeholder="AMZN Mktp IN*..." /></div><div><Label>Display name</Label><Input value={clean} onChange={(event) => setClean(event.target.value)} placeholder="Amazon" /></div><div><Label>Default category</Label><Select value={categoryId} onValueChange={setCategoryId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No category</SelectItem>{categories.map((category) => <SelectItem key={category.id} value={category.id}>{category.name}</SelectItem>)}</SelectContent></Select></div><Button onClick={() => void save()} disabled={!raw.trim() || busy}>{busy ? "Saving..." : "Save rule"}</Button></div><div className="max-h-60 space-y-2 overflow-y-auto border-t pt-4">{mappings.length === 0 ? <EmptyState title="No merchant rules yet" description="Save the form above to clean future statements automatically." /> : mappings.map((mapping) => <div key={mapping.id} className="rounded-lg border p-3"><p className="text-sm font-medium">{mapping.merchant_raw} → {mapping.merchant_clean || "Keep original"}</p><p className="text-xs text-ink-3">{mapping.category_name || "No category"} · used {mapping.use_count} times</p></div>)}</div></DialogContent></Dialog>;
}
