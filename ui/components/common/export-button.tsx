"use client";

import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

/**
 * Shared CSV export link (was 15+ copy-pasted `Button asChild > a[download]`
 * anchors across dashboards). Visuals match the common shape exactly:
 * outline small button, h-3 icon, label text.
 */
export function ExportButton({
  href,
  label = "Export CSV",
  className,
}: {
  href: string;
  label?: string;
  className?: string;
}) {
  return (
    <Button variant="outline" size="sm" asChild className={className}>
      <a href={href} download>
        <Download className="h-3 w-3" /> {label}
      </a>
    </Button>
  );
}

/** Ghost icon-only variant for tight table/dialog headers. */
export function ExportIconButton({ href, label = "Export CSV" }: { href: string; label?: string }) {
  return (
    <Button variant="ghost" size="icon" asChild aria-label={label} title={label}>
      <a href={href} download>
        <Download className="h-4 w-4" />
      </a>
    </Button>
  );
}
