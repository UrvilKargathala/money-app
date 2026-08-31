import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardVariant = "primary" | "success" | "warning" | "info" | "violet" | "teal" | "rose" | "amber";

type StatCardProps = {
  label: string;
  value: string;
  subtext?: string;
  trend?: { value: string; positive: boolean };
  icon?: React.ReactNode;
  className?: string;
  variant?: StatCardVariant;
};

const variantStyles: Record<StatCardVariant, { card: string; label: string; value: string; subtext: string; icon: string; trend: string }> = {
  primary: {
    card: "bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 border-0 shadow-lg shadow-blue-500/20",
    label: "text-blue-100",
    value: "text-white",
    subtext: "text-blue-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  success: {
    card: "bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-600 border-0 shadow-lg shadow-emerald-500/20",
    label: "text-emerald-100",
    value: "text-white",
    subtext: "text-emerald-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  warning: {
    card: "bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 border-0 shadow-lg shadow-orange-500/20",
    label: "text-amber-100",
    value: "text-white",
    subtext: "text-amber-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  info: {
    card: "bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 border-0 shadow-lg shadow-sky-500/20",
    label: "text-sky-100",
    value: "text-white",
    subtext: "text-sky-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  violet: {
    card: "bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-600 border-0 shadow-lg shadow-violet-500/20",
    label: "text-violet-100",
    value: "text-white",
    subtext: "text-violet-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  teal: {
    card: "bg-gradient-to-br from-teal-500 via-cyan-500 to-sky-600 border-0 shadow-lg shadow-teal-500/20",
    label: "text-teal-100",
    value: "text-white",
    subtext: "text-teal-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  rose: {
    card: "bg-gradient-to-br from-rose-500 via-pink-500 to-fuchsia-600 border-0 shadow-lg shadow-rose-500/20",
    label: "text-rose-100",
    value: "text-white",
    subtext: "text-rose-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
  amber: {
    card: "bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 border-0 shadow-lg shadow-amber-500/20",
    label: "text-amber-100",
    value: "text-white",
    subtext: "text-amber-100/80",
    icon: "bg-white/20 text-white backdrop-blur",
    trend: "text-white/90",
  },
};

export function StatCard({ label, value, subtext, trend, icon, className, variant = "primary" }: StatCardProps) {
  const v = variantStyles[variant];
  return (
    <Card className={cn("p-6 relative overflow-hidden transition-all hover:shadow-xl hover:-translate-y-0.5", v.card, className)}>
      {/* subtle overlay texture */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.08] to-transparent pointer-events-none" />
      <div className="relative flex items-start justify-between">
        <div className="space-y-2">
          <p className={cn("text-[13px] font-medium font-heading", v.label)}>{label}</p>
          <p className={cn("text-[28px] font-bold font-heading leading-none", v.value)}>{value}</p>
          {(subtext || trend) && (
            <div className="flex items-center gap-2">
              {trend && (
                <span className={cn("inline-flex items-center gap-1 text-xs font-medium", v.trend)}>
                  <span className={cn("h-2 w-2 rounded-full", trend.positive ? "bg-white" : "bg-white/70")} />
                  {trend.value}
                </span>
              )}
              {subtext && <span className={cn("text-xs font-body", v.subtext)}>{subtext}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm", v.icon)}>{icon}</div>
        )}
      </div>
    </Card>
  );
}
