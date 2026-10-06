"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ToggleProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

/**
 * DS 7.10 Toggle: 44x24 container, full radius. On: Primary/600, knob right.
 * Off: Neutral/300, knob left. Knob is a 20x20 white circle with Shadow/sm
 * and 2px container padding. Native button semantics: keyboard operable,
 * focus-visible ring, 50% opacity when disabled.
 */
export function Toggle({ checked, onCheckedChange, className, disabled, ...props }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary-600" : "bg-neutral-300",
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}
