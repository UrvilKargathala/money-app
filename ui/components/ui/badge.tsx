import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-medium font-heading transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
      variants: {
        variant: {
          default: "bg-neutral-100 text-neutral-600 dark:bg-[#1E1E1E] dark:text-[#B9C7DE]",
          success: "bg-success-light text-success-dark dark:bg-[#064E3B] dark:text-[#A7F3D0]",
          warning: "bg-warning-light text-warning-dark dark:bg-[#78350F] dark:text-[#FDE68A]",
          error: "bg-error-light text-error-dark dark:bg-[#7F1D1D] dark:text-[#FCA5A5]",
          info: "bg-info-light text-info-dark dark:bg-[#1E1E1E] dark:text-[#BFDBFE]",
          secondary: "bg-primary-50 text-primary-600 dark:bg-[#1E1E1E] dark:text-[#BFDBFE]",
          outline: "border border-neutral-200 text-neutral-600 dark:border-[#2A2A2A] dark:text-[#B9C7DE]",
        },
      },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
