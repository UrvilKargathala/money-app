"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WIDGETS } from "@/lib/widgets";
import { LayoutGrid } from "lucide-react";

export function WidgetsGrid({ layout }: { layout?: unknown[] }) {
  const ids = Array.isArray(layout) && layout.length > 0 ? (layout as string[]) : WIDGETS.slice(0, 2).map((w) => w.id);
  const items = ids.map((id) => WIDGETS.find((w) => w.id === id)).filter(Boolean) as typeof WIDGETS;

  if (items.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LayoutGrid className="h-4 w-4" /> Widgets</CardTitle>
        <CardDescription>Drag to reorder in Settings → Widgets (Premium)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((w) => (
            <div key={w.id} className="rounded-xl border border-neutral-200 p-4 bg-white">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{w.label}</p>
                {w.premium && <Badge className="bg-neutral-900 text-white text-[10px]">Premium</Badge>}
              </div>
              <p className="text-xs text-neutral-500 mt-1">{w.description}</p>
              <div className="mt-3 h-16 rounded-lg bg-neutral-50 border border-dashed flex items-center justify-center text-xs text-neutral-400">Preview</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
