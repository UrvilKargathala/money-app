"use client";

import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "group toast group-[.toaster]:bg-surface group-[.toaster]:text-ink-1 group-[.toaster]:border-line group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-ink-3",
          actionButton: "group-[.toast]:bg-primary-600 group-[.toast]:text-white",
          cancelButton: "group-[.toast]:bg-wash group-[.toast]:text-ink-3",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
