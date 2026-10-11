import { cn } from "@/lib/utils";

// Decorative shimmer blocks: hidden from assistive tech by default (the
// labelled role="status" region owns the announcement). Callers inside an
// unlabelled context can pass aria-hidden={false} + role="status".
// dark:bg-white/[0.06] keeps the pulse visible on navy (bg-soft alone is
// ~1.2:1 against the dark page).
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-soft dark:bg-white/[0.06]", className)} {...props} />;
}
