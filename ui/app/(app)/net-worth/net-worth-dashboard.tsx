"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { formatINR } from "@/lib/format";
import { Scale, Plus, Trash2, Building2 } from "lucide-react";
import { createManualAsset, deleteManualAssetAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

type ManualAsset = { id: string; name: string; category: string; valuation: string; acquisition_date: string; version: number };

export function NetWorthDashboard({
  netWorth,
  assets,
  liabilities,
  trend,
  manualAssets,
}: {
  netWorth: number | null;
  assets: number | null;
  liabilities: number | null;
  trend: { date: string; value: number }[];
  manualAssets: ManualAsset[];
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [category, setCategory] = useState("property");
  const [state, formAction, isPending] = useActionState(createManualAsset, null);

  useEffect(() => {
    if (state?.success) {
      toast.success("Asset added");
      setFormOpen(false);
      router.refresh();
    }
    if (state?.error) toast.error(state.error);
  }, [state]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this asset?")) return;
    const res = await deleteManualAssetAction(id);
    if (res?.error) toast.error(res.error);
    else {
      toast.success("Deleted");
      router.refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold font-heading text-neutral-900">Net Worth</h1>
          <p className="text-sm text-neutral-500 font-body mt-1">Assets minus liabilities</p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Add Asset
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <StatCard label="Net Worth" value={netWorth != null ? formatINR(netWorth) : "—"} icon={<Scale className="h-5 w-5" />} />
        <StatCard label="Assets" value={assets != null ? formatINR(assets) : "—"} icon={<Building2 className="h-5 w-5" />} />
        <StatCard label="Liabilities" value={liabilities != null ? formatINR(liabilities) : "—"} icon={<Scale className="h-5 w-5" />} />
      </div>

      {trend.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold font-heading text-neutral-800 mb-4">Trend (last {trend.length} snapshots)</h3>
          <div className="flex gap-2 overflow-x-auto">
            {trend.map((p) => (
              <div key={p.date} className="text-center min-w-[80px]">
                <p className="text-xs text-neutral-500">{new Date(p.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}</p>
                <p className="text-sm font-semibold">{formatINR(p.value)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <h3 className="font-semibold font-heading text-neutral-800 mb-4">Manual Assets ({manualAssets.length})</h3>
        {manualAssets.length === 0 ? (
          <EmptyState
            icon={<Building2 className="h-6 w-6" />}
            title="No manual assets"
            description="Add property, vehicle, gold to include in net worth."
            actionLabel="Add Asset"
            onAction={() => setFormOpen(true)}
          />
        ) : (
          <div className="space-y-3">
            {manualAssets.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-3">
                <div>
                  <p className="text-sm font-medium font-heading">{a.name}</p>
                  <p className="text-xs text-neutral-500">
                    {a.category} • {formatINR(Number(a.valuation))} • {new Date(a.acquisition_date).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => handleDelete(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add manual asset</DialogTitle>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <input type="hidden" name="category" value={category} />
            <div className="space-y-2">
              <Label htmlFor="asset-name">Name *</Label>
              <Input id="asset-name" name="name" placeholder="Family Home, Gold" required />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="property">Property</SelectItem>
                  <SelectItem value="vehicle">Vehicle</SelectItem>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="jewelry">Jewelry</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-val">Valuation *</Label>
              <Input id="asset-val" name="valuation" type="number" step="0.01" placeholder="5000000" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="asset-date">Acquisition date</Label>
              <Input id="asset-date" name="acquisition_date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Add"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
