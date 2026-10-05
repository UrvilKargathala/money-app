"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ConfirmDialogState = {
  title: string;
  description: string;
  confirmLabel?: string;
  /** Runs only when the user presses the confirm button. */
  onConfirm: () => void | Promise<void>;
} | null;

/**
 * App-styled replacement for window.confirm(). Render once per surface that
 * needs destructive confirmations; drive it with ConfirmDialogState.
 *
 * - Cancel closes with zero side effects (mirrors confirm() === false).
 * - Confirm runs onConfirm, then closes. Async handlers show a busy state.
 * - Destructive actions use the Danger button variant (DS 7.1).
 */
export function ConfirmDialog({
  state,
  onOpenChange,
}: {
  state: ConfirmDialogState;
  onOpenChange: (v: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);

  const close = () => {
    if (!busy) onOpenChange(false);
  };

  const confirm = async () => {
    if (!state || busy) return;
    setBusy(true);
    try {
      await state.onConfirm();
    } finally {
      setBusy(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={state !== null} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state?.title ?? ""}</DialogTitle>
          {state?.description ? (
            <DialogDescription>{state.description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={() => void confirm()} disabled={busy}>
            {busy ? "Working..." : (state?.confirmLabel ?? "Delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * useState-backed driver: const [confirmState, askConfirm, closeConfirm] =
 * useConfirm(); ... askConfirm({ title, description, onConfirm });
 */
export function useConfirm(): [
  ConfirmDialogState,
  (s: Exclude<ConfirmDialogState, null>) => void,
  (v: boolean) => void,
] {
  const [state, setState] = useState<ConfirmDialogState>(null);
  return [state, setState, (v: boolean) => { if (!v) setState(null); }];
}
