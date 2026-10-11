import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-[10px] border bg-base px-3.5 py-2.5 text-sm text-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-neutral-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100 focus-visible:border-primary-500 dark:focus-visible:ring-[#60A5FA]/40 dark:focus-visible:border-[#60A5FA] disabled:cursor-not-allowed disabled:opacity-60 disabled:bg-soft",
          error
            ? "border-error bg-error-soft dark:bg-[#7F1D1D]/40 focus-visible:border-error focus-visible:ring-error/20"
            : "border-edge",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
