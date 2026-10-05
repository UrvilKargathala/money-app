"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfirmDialog, useConfirm } from "@/components/common/confirm-dialog";

export function DetailActions({ id, collection, editHref }: { id: string; collection: string; editHref?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmState, askConfirm, closeConfirm] = useConfirm();
  function remove() {
    askConfirm({
      title: "Delete this record?",
      description: "This cannot be undone and may remove related history.",
      onConfirm: async () => {
        setBusy(true);
        try {
          const response = await fetch(`/api/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
          const body = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(body.error || "Could not delete this record.");
          toast.success("Record deleted.");
          router.push(`/${collection}`);
          router.refresh();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not delete this record.");
        } finally { setBusy(false); }
      },
    });
  }
  return <div className="flex items-center gap-2">
    {editHref ? <Button variant="outline" size="sm" asChild><a href={editHref}><Pencil className="h-4 w-4" /> Edit</a></Button> : null}
    <Button variant="outline" size="sm" className="text-error hover:text-error-dark" onClick={() => remove()} disabled={busy}><Trash2 className="h-4 w-4" /> {busy ? "Deleting…" : "Delete"}</Button>
    <ConfirmDialog state={confirmState} onOpenChange={closeConfirm} />
  </div>;
}
