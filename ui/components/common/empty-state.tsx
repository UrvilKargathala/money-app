import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
  /** Heading level for the title (default h2 preserves current rendering). */
  level?: 1 | 2 | 3 | 4 | 5 | 6;
};

export function EmptyState({ icon, title, description, actionLabel, onAction, className, level = 2 }: EmptyStateProps) {
  const TitleTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface px-6 py-12 text-center", className)}>
      {icon && (
        <div aria-hidden="true" className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-wash text-neutral-400">
          {icon}
        </div>
      )}
      <TitleTag className="text-base font-semibold font-heading text-ink-1">{title}</TitleTag>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-3 font-body">{description}</p>}
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-6">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
