import { Wallet, CreditCard, Landmark, PiggyBank, Banknote, Building2, Coins } from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  bank_savings: Landmark,
  bank_current: Building2,
  credit_card: CreditCard,
  wallet: Wallet,
  cash: Banknote,
  fd: PiggyBank,
  ppf: Coins,
};

type AccountIconProps = {
  type: string;
  color?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function AccountIcon({ type, color, size = "md", className }: AccountIconProps) {
  const Icon = iconMap[type] || Wallet;
  const sizeClasses = {
    sm: "h-8 w-8",
    md: "h-10 w-10",
    lg: "h-12 w-12",
  };
  const iconSize = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  return (
    <div
      className={cn("flex items-center justify-center rounded-[10px] shrink-0", sizeClasses[size], className)}
      style={{ backgroundColor: color ? `${color}15` : "#EFF6FF", color: color || "#2563EB" }}
    >
      <Icon className={iconSize[size]} />
    </div>
  );
}
