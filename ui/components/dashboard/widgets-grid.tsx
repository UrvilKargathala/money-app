"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WIDGETS } from "@/lib/widgets";
import { LayoutGrid } from "lucide-react";
import { useMembership } from "@/components/membership";
import { LiveWidget } from "./live-widget";

export function WidgetsGrid({ layout }: { layout?: unknown[] }) {
  const { premium, loading } = useMembership();
  if (loading) return null;
  const ids = Array.isArray(layout) && layout.length > 0 ? (layout as string[]) : WIDGETS.map((w) => w.id);
  const items = ids.map((id) => WIDGETS.find((w) => w.id === id)).filter(Boolean) as typeof WIDGETS;

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Widgets</CardTitle>
        <CardDescription>Drag to reorder in Settings → Widgets (Premium)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((w) => (
            <div key={w.id} className="rounded-xl border border-line p-4 bg-surface">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{w.label}</p>
                {w.premium && <Badge className="bg-neutral-900 text-white text-[10px]">Premium</Badge>}
              </div>
              <p className="text-xs text-ink-3 mt-1">{w.description}</p>
              <div className="mt-3"><LiveWidget id={w.id} /></div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
