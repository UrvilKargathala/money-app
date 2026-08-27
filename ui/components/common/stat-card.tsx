import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: string;
  subtext?: string;
  trend?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  className?: string;
};

export function StatCard({ label, value, subtext, trend, icon, className }: StatCardProps) {
  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-[13px] font-medium font-heading text-neutral-500">{label}</p>
          <p className="text-[28px] font-bold font-heading text-neutral-900 leading-none">{value}</p>
          {(subtext || trend) && (
            <div className="flex items-center gap-2">
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium",
                    trend.positive ? "text-success" : "text-error"
                  )}
                >
                  <span className={cn("h-2 w-2 rounded-full", trend.positive ? "bg-success" : "bg-error")} />
                  {trend.value}
                </span>
              )}
              {subtext && <span className="text-xs text-neutral-500 font-body">{subtext}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
