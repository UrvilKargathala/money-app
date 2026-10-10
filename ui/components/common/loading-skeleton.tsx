import { cn } from "@/lib/utils";

// Decorative shimmer blocks: hidden from assistive tech by default (the
// labelled role="status" region owns the announcement). Callers inside an
// unlabelled context can pass aria-hidden={false} + role="status".
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-wash", className)} {...props} />;
}

export function CardSkeleton() {
  return (
    <div aria-hidden="true" className="rounded-xl border border-line bg-surface p-6 shadow-md space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg border border-line bg-surface p-4">
          <Skeleton className="h-10 w-10 rounded-[10px]" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
