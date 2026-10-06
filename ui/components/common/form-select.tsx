"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type FormSelectOption = { value: string; label: string };

/**
 * Adaptive dropdown: Label + Select that always fills its container, so
 * callers never hand-size triggers (no w-44 / w-[180px] per site).
 * Pixel-matched to the modal Select pattern: DS 10px radius, h-10,
 * primary-100 focus ring, with dark-mode pairs baked in.
 */
export function FormSelect({
  id,
  label,
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  error,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: FormSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  error?: string | null;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onValueChange} disabled={disabled}>
        <SelectTrigger
          id={id}
          className={cn(
            "dark:border-[#334155] dark:bg-[#0F172A] dark:text-[#F8FAFC]",
            error && "border-error"
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-xs text-error-dark">{error}</p> : null}
    </div>
  );
}
