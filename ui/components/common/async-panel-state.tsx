import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/common/loading-skeleton";

export function TableLoadingRows({ columns, rows = 4 }: { columns: number; rows?: number }) {
  return Array.from({ length: rows }).map((_, row) => (
    <tr key={row} aria-hidden="true" className="border-t">
      {Array.from({ length: columns }).map((__, column) => <td key={column} className="p-2"><Skeleton className="h-4 w-full max-w-28" /></td>)}
    </tr>
  ));
}

export function PanelLoading({ label = "Loading" }: { label?: string }) {
  return <div role="status" aria-live="polite" className="space-y-3 rounded-xl border p-4"><span className="sr-only">{label}</span><Skeleton className="h-4 w-2/3" /><Skeleton className="h-32 w-full" /><Skeleton className="h-4 w-1/2" /></div>;
}

export function PanelError({ message = "Could not load this section.", onRetry }: { message?: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-error/20 bg-error/5 p-5 text-center"><AlertCircle className="h-5 w-5 text-error" /><p className="text-sm text-neutral-700">{message}</p><Button type="button" size="sm" variant="outline" onClick={onRetry}><RotateCcw className="h-4 w-4" /> Try again</Button></div>;
}
