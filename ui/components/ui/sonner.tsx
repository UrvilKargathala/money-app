"use client";

import { Toaster as Sonner } from "sonner";
import { useTheme } from "@/components/common/theme-provider";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { dark } = useTheme();
  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-base group-[.toaster]:text-foreground group-[.toaster]:border-edge group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-faint",
          actionButton: "group-[.toast]:bg-primary-600 group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-soft group-[.toast]:text-faint",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
