import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/format";

type AmountDisplayProps = {
  amount: number;
  type?: "income" | "expense" | "transfer";
  showSign?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
};

export function AmountDisplay({ amount, type, showSign = true, size = "md", className }: AmountDisplayProps) {
  const isNegative = type === "expense" || (type === undefined && amount < 0);
  const isPositive = type === "income" || (type === undefined && amount > 0);

  const colorClass =
    type === "expense" || isNegative
      ? "text-error"
      : type === "income" || isPositive
        ? "text-success"
        : "text-neutral-700";

  const sizeClass = {
    sm: "text-sm font-semibold",
    md: "text-base font-semibold",
    lg: "text-xl font-bold",
  };

  const sign = showSign ? (isNegative ? "- " : isPositive ? "+ " : "") : "";

  return (
    <span className={cn("font-heading tabular-nums", sizeClass[size], colorClass, className)}>
      {sign}
      {formatINR(Math.abs(amount))}
    </span>
  );
}
