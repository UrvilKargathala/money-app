import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Prefetchable link action (alternative to onAction for server components). */
  href?: string;
  className?: string;
  /** Heading level for the title (default h2 preserves current rendering). */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
};

export function EmptyState({ icon, title, description, actionLabel, onAction, href, className, level = 2 }: EmptyStateProps) {
  const TitleTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-edge bg-base px-6 py-12 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-soft text-faint">
          {icon}
        </div>
      )}
      <TitleTag className="text-base font-semibold font-heading text-foreground">{title}</TitleTag>
      {description && <p className="mt-1 max-w-sm text-sm text-faint font-body">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      )}
      {actionLabel && !onAction && href && (
        <Button asChild className="mt-6">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}
