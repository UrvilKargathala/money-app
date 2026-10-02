"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { formatINR, formatDate } from "@/lib/format";
import { Card } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PanelError, PanelLoading } from "@/components/common/async-panel-state";

type PricePoint = { price: number; date: string };

export function PriceHistoryDialog({
  open,
  onOpenChange,
  investmentName,
  investmentId,
  fetchHistory,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  investmentName: string;
  investmentId: string;
  fetchHistory: (id: string) => Promise<PricePoint[]>;
}) {
  const [points, setPoints] = useState<PricePoint[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!investmentId) return;
    setLoading(true);
    setError(false);
    setPoints(null);
    fetchHistory(investmentId)
      .then(setPoints)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [fetchHistory, investmentId]);

  useEffect(() => {
    if (!open || !investmentId) return;
    load();
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Price history - {investmentName}</DialogTitle>
          <DialogDescription>Historical price points for this holding</DialogDescription>
        </DialogHeader>

        {loading ? <PanelLoading label="Loading price history" /> : null}
        {!loading && error ? <PanelError message="Could not load price history." onRetry={load} /> : null}

        {!loading && !error && points && points.length === 0 && (
          <p className="text-sm text-neutral-500 py-8 text-center">No price history yet. Update price to create history.</p>
        )}

        {!loading && !error && points && points.length > 0 && (
          <div className="space-y-4">
            <div className="h-[260px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748B" tickFormatter={(v: string) => new Date(v).toLocaleDateString("en-IN", { month: "short", day: "numeric" })} />
                  <YAxis tickFormatter={(v: number) => `₹${v}`} tick={{ fontSize: 12 }} stroke="#64748B" width={70} />
                  <Tooltip formatter={(v: number) => [formatINR(Number(v)), "Price"]} labelFormatter={(l: string) => formatDate(l)} contentStyle={{ borderRadius: 12, borderColor: "#E2E8F0" }} />
                  <Line type="monotone" dataKey="price" stroke="#2563EB" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="max-h-[200px] overflow-auto rounded-lg border border-neutral-100">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 text-xs text-neutral-500 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-right px-3 py-2 font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {points.map((p) => (
                    <tr key={`${p.date}-${p.price}`} className="border-t border-neutral-100">
                      <td className="px-3 py-2">{formatDate(p.date)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatINR(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
