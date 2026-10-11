import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-[10px] border bg-base px-3.5 py-2.5 text-sm text-foreground ring-offset-background placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-100 focus-visible:border-primary-500 dark:focus-visible:ring-[#60A5FA]/40 dark:focus-visible:border-[#60A5FA] disabled:cursor-not-allowed disabled:opacity-60",
          error ? "border-error bg-error-soft dark:bg-[#7F1D1D]/40" : "border-edge",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
