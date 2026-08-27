import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-medium font-heading transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-neutral-100 text-neutral-600",
        success: "bg-success-light text-success-dark",
        warning: "bg-warning-light text-warning-dark",
        error: "bg-error-light text-error-dark",
        info: "bg-info-light text-info-dark",
        secondary: "bg-primary-50 text-primary-600",
        outline: "border border-neutral-200 text-neutral-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
